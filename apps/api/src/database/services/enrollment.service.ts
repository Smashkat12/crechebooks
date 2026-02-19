/**
 * Enrollment Service
 * TASK-ENROL-002: Enrollment Service with Sibling Discount Logic
 *
 * @module database/services/enrollment
 * @description Orchestrates enrollment operations including validation,
 * sibling discount calculations, and enrollment lifecycle management.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Enrollment, FeeStructure, Invoice } from '@prisma/client';
import Decimal from 'decimal.js';
import { EnrollmentRepository } from '../repositories/enrollment.repository';
import { ChildRepository } from '../repositories/child.repository';
import { ParentRepository } from '../repositories/parent.repository';
import { FeeStructureRepository } from '../repositories/fee-structure.repository';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { InvoiceLineRepository } from '../repositories/invoice-line.repository';
import { TenantRepository } from '../repositories/tenant.repository';
import { AuditLogService } from './audit-log.service';
import { ProRataService } from './pro-rata.service';
import { CreditNoteService } from './credit-note.service';
import { InvoiceNumberService } from './invoice-number.service';
import { EnrollmentStatus, IEnrollment } from '../entities/enrollment.entity';
import { LineType } from '../entities/invoice-line.entity';
import {
  NotFoundException,
  ConflictException,
  ValidationException,
} from '../../shared/exceptions';
import { UpdateEnrollmentDto } from '../dto/enrollment.dto';
import {
  YearEndStudent,
  YearEndReviewResult,
} from '../dto/year-end-review.dto';
import { WelcomePackDeliveryService } from './welcome-pack-delivery.service';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/**
 * Result of enrolling a child, including the generated invoice (if any)
 * TASK-BILL-023: Enrollment Invoice UI Integration
 * TASK-ENROL-008: Welcome Pack Delivery Integration
 */
export interface EnrollChildResult {
  enrollment: IEnrollment;
  invoice: Invoice | null;
  /** Error message if invoice creation failed (enrollment succeeded but invoice didn't) */
  invoiceError?: string;
  /** Whether welcome pack email was sent successfully */
  welcomePackSent?: boolean;
  /** Error message if welcome pack delivery failed */
  welcomePackError?: string;
  /** Catch-up invoice results for historic enrollments */
  catchUpInvoices?: {
    generated: number;
    skipped: number;
    errors: string[];
  };
}

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    private readonly enrollmentRepo: EnrollmentRepository,
    private readonly childRepo: ChildRepository,
    private readonly parentRepo: ParentRepository,
    private readonly feeStructureRepo: FeeStructureRepository,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly invoiceLineRepo: InvoiceLineRepository,
    private readonly proRataService: ProRataService,
    private readonly creditNoteService: CreditNoteService,
    private readonly auditLogService: AuditLogService,
    private readonly invoiceNumberService: InvoiceNumberService,
    private readonly welcomePackDeliveryService: WelcomePackDeliveryService,
  ) {}

  /**
   * Enroll a child in a fee structure
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param childId - Child ID to enroll
   * @param feeStructureId - Fee structure to enroll child in
   * @param startDate - Enrollment start date
   * @param userId - User performing the enrollment
   * @param allowHistoricDates - If true, allows historical start dates (for data imports)
   * @param skipWelcomePack - If true, skips welcome pack delivery (e.g. WhatsApp onboarding sends its own completion message)
   * @returns Created enrollment with generated invoice (if any)
   * @throws NotFoundException if child or fee structure doesn't exist
   * @throws ConflictException if child already has active enrollment
   * @throws ValidationException if startDate is in the past (unless allowHistoricDates is true)
   */
  async enrollChild(
    tenantId: string,
    childId: string,
    feeStructureId: string,
    startDate: Date,
    userId: string,
    allowHistoricDates = false,
    skipWelcomePack = false,
  ): Promise<EnrollChildResult> {
    // 1. Validate child exists and belongs to tenant
    const child = await this.childRepo.findById(childId, tenantId);
    if (!child) {
      this.logger.error(
        `Child not found or tenant mismatch: ${childId} for tenant ${tenantId}`,
      );
      throw new NotFoundException('Child', childId);
    }

    // 2. Validate fee structure exists and belongs to tenant
    const feeStructure = await this.feeStructureRepo.findById(
      feeStructureId,
      tenantId,
    );
    if (!feeStructure) {
      this.logger.error(
        `Fee structure not found or tenant mismatch: ${feeStructureId} for tenant ${tenantId}`,
      );
      throw new NotFoundException('FeeStructure', feeStructureId);
    }

    // 3. Check no active enrollment exists for this child
    const existing = await this.enrollmentRepo.findActiveByChild(
      tenantId,
      childId,
    );
    if (existing) {
      this.logger.error(
        `Child ${childId} already has active enrollment: ${existing.id}`,
      );
      throw new ConflictException('Child already has an active enrollment', {
        childId,
        existingEnrollmentId: existing.id,
      });
    }

    // 4. Validate startDate not in past (allow today, or allow if historic imports enabled)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startNorm = new Date(startDate);
    startNorm.setHours(0, 0, 0, 0);
    if (startNorm < today && !allowHistoricDates) {
      this.logger.error(
        `Start date ${startDate.toISOString()} is in the past (today: ${today.toISOString()})`,
      );
      throw new ValidationException('Start date cannot be in the past', [
        {
          field: 'startDate',
          message: 'Start date cannot be in the past',
          value: startDate,
        },
      ]);
    }
    if (startNorm < today && allowHistoricDates) {
      this.logger.log(
        `Allowing historical start date ${startDate.toISOString()} for data import`,
      );
    }

    // 5. Create enrollment
    const enrollment = await this.enrollmentRepo.create({
      tenantId,
      childId,
      feeStructureId,
      startDate,
      status: EnrollmentStatus.ACTIVE,
    });

    // 6. Audit log
    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'Enrollment',
      entityId: enrollment.id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      afterValue: JSON.parse(JSON.stringify(enrollment)),
    });

    // 7. Generate enrollment invoice (registration fee + pro-rated first month)
    let enrollmentInvoice: Invoice | null = null;
    let invoiceError: string | undefined;
    try {
      enrollmentInvoice = await this.createEnrollmentInvoice(
        tenantId,
        enrollment,
        feeStructure,
        userId,
      );
      this.logger.log(
        `Created enrollment invoice ${enrollmentInvoice.invoiceNumber} for child ${childId}`,
      );
    } catch (error) {
      // IMPORTANT: Capture error message so it's visible to API consumers
      // Don't fail enrollment, but DO surface the error message
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      invoiceError = `Invoice creation failed: ${errorMessage}`;
      this.logger.error(
        `Failed to create enrollment invoice for child ${childId}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    // 8. Send welcome pack (non-blocking, don't fail enrollment if email fails)
    // TASK-ENROL-008: Welcome Pack Delivery Integration
    // TASK-WA-015: Skip when called from WhatsApp onboarding (handler sends its own completion message)
    let welcomePackResult: { sent: boolean; error?: string } = { sent: false };
    if (skipWelcomePack) {
      this.logger.log(
        `Skipping welcome pack for enrollment ${enrollment.id} (skipWelcomePack=true)`,
      );
      welcomePackResult = { sent: false, error: 'Skipped by caller' };
    } else {
      try {
        const deliveryResult =
          await this.welcomePackDeliveryService.sendWelcomePack(
            tenantId,
            enrollment.id,
          );
        welcomePackResult = {
          sent: deliveryResult.success,
          error: deliveryResult.error,
        };
        if (deliveryResult.success) {
          this.logger.log(`Welcome pack sent for enrollment ${enrollment.id}`);
        }
      } catch (error) {
        welcomePackResult = {
          sent: false,
          error: error instanceof Error ? error.message : String(error),
        };
        this.logger.warn(
          `Failed to send welcome pack for enrollment ${enrollment.id}: ${welcomePackResult.error}`,
        );
      }
    }

    this.logger.log(
      `Successfully enrolled child ${childId} in enrollment ${enrollment.id}${invoiceError ? ' (invoice creation failed)' : ''}${!welcomePackResult.sent ? ' (welcome pack not sent)' : ''}`,
    );

    return {
      enrollment: enrollment as IEnrollment,
      invoice: enrollmentInvoice,
      invoiceError,
      welcomePackSent: welcomePackResult.sent,
      welcomePackError: welcomePackResult.error,
    };
  }

  /**
   * Update an enrollment
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param enrollmentId - Enrollment ID to update
   * @param updates - Updates to apply
   * @param userId - User performing the update
   * @returns Updated enrollment
   * @throws NotFoundException if enrollment or fee structure doesn't exist
   * @throws ValidationException if endDate <= startDate
   */
  async updateEnrollment(
    tenantId: string,
    enrollmentId: string,
    updates: UpdateEnrollmentDto,
    userId: string,
  ): Promise<IEnrollment> {
    // Fetch enrollment and validate tenant
    const enrollment = await this.enrollmentRepo.findById(
      enrollmentId,
      tenantId,
    );
    if (!enrollment) {
      this.logger.error(
        `Enrollment not found or tenant mismatch: ${enrollmentId} for tenant ${tenantId}`,
      );
      throw new NotFoundException('Enrollment', enrollmentId);
    }

    // Store before value for audit
    const beforeValue = { ...enrollment };

    // Validate fee structure if provided
    if (updates.feeStructureId) {
      const feeStructure = await this.feeStructureRepo.findById(
        updates.feeStructureId,
        tenantId,
      );
      if (!feeStructure) {
        this.logger.error(
          `Fee structure not found or tenant mismatch: ${updates.feeStructureId} for tenant ${tenantId}`,
        );
        throw new NotFoundException('FeeStructure', updates.feeStructureId);
      }
    }

    // Validate endDate > startDate if provided
    if (updates.endDate) {
      const startDate = updates.startDate ?? enrollment.startDate;
      if (updates.endDate <= startDate) {
        this.logger.error(
          `End date ${updates.endDate.toISOString()} must be after start date ${startDate.toISOString()}`,
        );
        throw new ValidationException('End date must be after start date', [
          {
            field: 'endDate',
            message: 'End date must be after start date',
            value: updates.endDate,
          },
        ]);
      }
    }

    // Update enrollment
    const updated = await this.enrollmentRepo.update(
      enrollmentId,
      tenantId,
      updates,
    );

    // Audit log
    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'Enrollment',
      entityId: enrollmentId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      beforeValue: JSON.parse(JSON.stringify(beforeValue)),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      afterValue: JSON.parse(JSON.stringify(updated)),
      changeSummary: 'Enrollment updated',
    });

    this.logger.log(`Successfully updated enrollment ${enrollmentId}`);

    return updated as IEnrollment;
  }

  /**
   * Withdraw a child from enrollment
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param enrollmentId - Enrollment ID to withdraw
   * @param endDate - Withdrawal date
   * @param userId - User performing the withdrawal
   * @returns Updated enrollment with WITHDRAWN status
   * @throws NotFoundException if enrollment doesn't exist
   * @throws ConflictException if already withdrawn
   * @throws ValidationException if endDate <= startDate
   */
  async withdrawChild(
    tenantId: string,
    enrollmentId: string,
    endDate: Date,
    userId: string,
  ): Promise<IEnrollment> {
    // Fetch enrollment and validate tenant
    const enrollment = await this.enrollmentRepo.findById(
      enrollmentId,
      tenantId,
    );
    if (!enrollment) {
      this.logger.error(
        `Enrollment not found or tenant mismatch: ${enrollmentId} for tenant ${tenantId}`,
      );
      throw new NotFoundException('Enrollment', enrollmentId);
    }

    // Check not already withdrawn
    if (enrollment.status === (EnrollmentStatus.WITHDRAWN as string)) {
      this.logger.error(
        `Enrollment ${enrollmentId} is already withdrawn (status: ${enrollment.status})`,
      );
      throw new ConflictException('Enrollment is already withdrawn', {
        enrollmentId,
        currentStatus: enrollment.status,
      });
    }

    // Validate endDate > startDate
    if (endDate <= enrollment.startDate) {
      this.logger.error(
        `End date ${endDate.toISOString()} must be after start date ${enrollment.startDate.toISOString()}`,
      );
      throw new ValidationException('End date must be after start date', [
        {
          field: 'endDate',
          message: 'End date must be after start date',
          value: endDate,
        },
      ]);
    }

    // Store before value for audit
    const beforeValue = { ...enrollment };

    // Update with withdrawn status
    const updated = await this.enrollmentRepo.update(enrollmentId, tenantId, {
      status: EnrollmentStatus.WITHDRAWN,
      endDate,
    });

    // Audit log
    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'Enrollment',
      entityId: enrollmentId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      beforeValue: JSON.parse(JSON.stringify(beforeValue)),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      afterValue: JSON.parse(JSON.stringify(updated)),
      changeSummary: 'Child withdrawn from enrollment',
    });

    // Generate credit note for unused days (TASK-BILL-022)
    try {
      const creditNoteResult =
        await this.creditNoteService.createWithdrawalCreditNote(
          tenantId,
          updated,
          endDate,
          userId,
        );
      this.logger.log(
        `Created credit note ${creditNoteResult.creditNote.invoiceNumber} for ${creditNoteResult.daysUnused} unused days`,
      );
    } catch (error) {
      // ValidationException means no credit needed (e.g., withdrawn on last day)
      if (
        error instanceof ValidationException &&
        (error.message.includes('No unused days') ||
          error.message.includes('no credit'))
      ) {
        this.logger.debug(
          `No credit note needed for enrollment ${enrollmentId}: ${error.message}`,
        );
      } else {
        // Log other errors but don't fail the withdrawal
        this.logger.error(
          `Failed to create credit note for enrollment ${enrollmentId}: ${error instanceof Error ? error.message : String(error)}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    this.logger.log(
      `Successfully withdrew child from enrollment ${enrollmentId}`,
    );

    return updated as IEnrollment;
  }

  /**
   * Get all active enrollments for a tenant, optionally filtered by parent
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param parentId - Optional parent ID to filter by
   * @returns Array of active enrollments
   */
  async getActiveEnrollments(
    tenantId: string,
    parentId?: string,
  ): Promise<Enrollment[]> {
    if (parentId) {
      return await this.enrollmentRepo.findActiveByParentId(tenantId, parentId);
    }
    return await this.enrollmentRepo.findByStatus(
      tenantId,
      EnrollmentStatus.ACTIVE,
    );
  }

  /**
   * Calculate sibling discount percentages for all children of a parent
   * Discount policy:
   * - 1 child: 0% discount
   * - 2 children: second child gets 10% discount
   * - 3+ children: second child gets 15%, third+ get 20%
   *
   * Children are ordered by enrollment startDate (oldest enrollment = first child)
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param parentId - Parent ID to calculate discounts for
   * @returns Map of childId -> discount percentage (as Decimal)
   */
  async applySiblingDiscount(
    tenantId: string,
    parentId: string,
  ): Promise<Map<string, Decimal>> {
    const enrollments = await this.getActiveEnrollments(tenantId, parentId);
    const discountMap = new Map<string, Decimal>();

    if (enrollments.length < 2) {
      // No discount for single child
      for (const e of enrollments) {
        discountMap.set(e.childId, new Decimal(0));
      }
      this.logger.log(
        `No sibling discount for parent ${parentId} (${enrollments.length} active enrollment(s))`,
      );
      return discountMap;
    }

    // Sort by startDate (oldest first = first child)
    enrollments.sort(
      (a, b) =>
        new Date(a.startDate).getTime() - new Date(b.startDate).getTime(),
    );

    // Sibling discount per TASK-INT-002 specification:
    // - 1st child: 0% discount
    // - 2nd child: 10% discount
    // - 3rd+ child: 15% discount
    for (let i = 0; i < enrollments.length; i++) {
      const childId = enrollments[i].childId;
      if (i === 0) {
        // First child: 0%
        discountMap.set(childId, new Decimal(0));
      } else if (i === 1) {
        // Second child: 10%
        discountMap.set(childId, new Decimal(10));
      } else {
        // Third+ child: 15%
        discountMap.set(childId, new Decimal(15));
      }
    }

    this.logger.log(
      `Calculated sibling discounts for parent ${parentId}: ${enrollments.length} children`,
    );

    return discountMap;
  }

  /**
   * Graduate a child from enrollment
   * TASK-ENROL-003: Bulk Year-End Graduation Feature
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param enrollmentId - Enrollment ID to graduate
   * @param endDate - Graduation date
   * @param userId - User performing the graduation
   * @returns Updated enrollment with GRADUATED status
   * @throws NotFoundException if enrollment doesn't exist
   * @throws ConflictException if already graduated or withdrawn
   * @throws ValidationException if endDate constraints violated
   */
  async graduateChild(
    tenantId: string,
    enrollmentId: string,
    endDate: Date,
    userId: string,
  ): Promise<IEnrollment> {
    // Fetch enrollment and validate tenant
    const enrollment = await this.enrollmentRepo.findById(
      enrollmentId,
      tenantId,
    );
    if (!enrollment) {
      this.logger.error(
        `Enrollment not found or tenant mismatch: ${enrollmentId} for tenant ${tenantId}`,
      );
      throw new NotFoundException('Enrollment', enrollmentId);
    }

    // Check enrollment is ACTIVE (only active enrollments can be graduated)
    if (enrollment.status !== (EnrollmentStatus.ACTIVE as string)) {
      this.logger.error(
        `Enrollment ${enrollmentId} is not active (status: ${enrollment.status})`,
      );
      throw new ConflictException('Only active enrollments can be graduated', {
        enrollmentId,
        currentStatus: enrollment.status,
      });
    }

    // Validate endDate > startDate
    if (endDate <= enrollment.startDate) {
      this.logger.error(
        `End date ${endDate.toISOString()} must be after start date ${enrollment.startDate.toISOString()}`,
      );
      throw new ValidationException('End date must be after start date', [
        {
          field: 'endDate',
          message: 'End date must be after start date',
          value: endDate,
        },
      ]);
    }

    // Validate endDate is not in the future
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    if (endDate > today) {
      this.logger.error(
        `End date ${endDate.toISOString()} cannot be in the future`,
      );
      throw new ValidationException('End date cannot be in the future', [
        {
          field: 'endDate',
          message: 'End date cannot be in the future',
          value: endDate,
        },
      ]);
    }

    // Store before value for audit
    const beforeValue = { ...enrollment };

    // Update with graduated status
    const updated = await this.enrollmentRepo.update(enrollmentId, tenantId, {
      status: EnrollmentStatus.GRADUATED,
      endDate,
    });

    // Audit log
    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'Enrollment',
      entityId: enrollmentId,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      beforeValue: JSON.parse(JSON.stringify(beforeValue)),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      afterValue: JSON.parse(JSON.stringify(updated)),
      changeSummary: 'Child graduated from enrollment',
    });

    this.logger.log(
      `Successfully graduated child from enrollment ${enrollmentId}`,
    );

    return updated as IEnrollment;
  }

  /**
   * Bulk graduate multiple enrollments (year-end processing)
   * TASK-ENROL-003: Bulk Year-End Graduation Feature
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param enrollmentIds - Array of enrollment IDs to graduate
   * @param endDate - Graduation date for all
   * @param userId - User performing the graduation
   * @returns Count of graduated and skipped enrollments
   */
  async bulkGraduate(
    tenantId: string,
    enrollmentIds: string[],
    endDate: Date,
    userId: string,
  ): Promise<{ graduated: number; skipped: number }> {
    let graduated = 0;
    let skipped = 0;

    for (const enrollmentId of enrollmentIds) {
      try {
        await this.graduateChild(tenantId, enrollmentId, endDate, userId);
        graduated++;
      } catch (error) {
        // Skip enrollments that can't be graduated (not found, wrong tenant, not active, etc.)
        this.logger.warn(
          `Skipped graduation for enrollment ${enrollmentId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        skipped++;
      }
    }

    this.logger.log(
      `Bulk graduation complete: ${graduated} graduated, ${skipped} skipped`,
    );

    return { graduated, skipped };
  }

  /**
   * Check if child had an ACTIVE enrollment on a specific date
   * TASK-BILL-037: Corrected re-registration logic for January invoices
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param childId - Child ID to check
   * @param date - Date to check enrollment status on
   * @returns true if child had an active enrollment on the given date
   */
  async wasActiveOnDate(
    tenantId: string,
    childId: string,
    date: Date,
  ): Promise<boolean> {
    const enrollments = await this.enrollmentRepo.findByChild(
      tenantId,
      childId,
    );

    const targetDate = new Date(date);
    targetDate.setHours(0, 0, 0, 0);

    return enrollments.some((e) => {
      // Check start date - enrollment must have started on or before target date
      const startDate = new Date(e.startDate);
      startDate.setHours(0, 0, 0, 0);
      if (startDate > targetDate) {
        return false;
      }

      // If enrollment has ended, check if end date is on or after target date
      if (e.endDate) {
        const endDate = new Date(e.endDate);
        endDate.setHours(23, 59, 59, 999);
        if (endDate < targetDate) {
          return false;
        }
      }

      // For ongoing enrollments (no end date), check status is ACTIVE
      // For ended enrollments (with end date), they were active on that date if within range
      if (!e.endDate) {
        return e.status === (EnrollmentStatus.ACTIVE as string);
      }

      // Enrollment with end date in range was active on that date regardless of current status
      return true;
    });
  }

  /**
   * @deprecated Use wasActiveOnDate() for correct re-registration logic
   * TASK-BILL-024 original logic was incorrect - kept for backwards compatibility
   *
   * This method incorrectly determines re-registration eligibility.
   * Re-registration fee should be for CONTINUING students (active Dec 31 previous year),
   * not for students returning after being WITHDRAWN/GRADUATED.
   */
  async isReturningStudent(
    tenantId: string,
    childId: string,
  ): Promise<boolean> {
    this.logger.warn(
      'isReturningStudent() is deprecated and returns incorrect logic. Use wasActiveOnDate() for re-registration checks.',
    );
    const previousEnrollments = await this.enrollmentRepo.findByChild(
      tenantId,
      childId,
    );
    return previousEnrollments.some(
      (e) =>
        e.status === (EnrollmentStatus.WITHDRAWN as string) ||
        e.status === (EnrollmentStatus.GRADUATED as string),
    );
  }

  /**
   * Create enrollment invoice with registration fee and pro-rated first month
   * TASK-BILL-021: Implements EC-BILL-001 and REQ-BILL-001
   * TASK-BILL-024: Uses re-registration fee for returning students
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param enrollment - The created enrollment
   * @param feeStructure - Fee structure with registration fee and monthly amount
   * @param userId - User performing the enrollment
   * @returns Created invoice
   */
  async createEnrollmentInvoice(
    tenantId: string,
    enrollment: Enrollment,
    feeStructure: FeeStructure,
    userId: string,
  ): Promise<Invoice> {
    // 1. Get child info for parent reference
    const child = await this.childRepo.findById(enrollment.childId, tenantId);
    if (!child) {
      throw new NotFoundException('Child', enrollment.childId);
    }

    // 2. Calculate billing period (remaining days in current month)
    const startDate = new Date(enrollment.startDate);
    startDate.setHours(0, 0, 0, 0);
    const monthEnd = new Date(
      startDate.getFullYear(),
      startDate.getMonth() + 1,
      0,
    );
    monthEnd.setHours(23, 59, 59, 999);

    // 3. Calculate pro-rated fee using ProRataService
    const fullMonthFeeCents = feeStructure.amountCents;
    let proRatedFeeCents = fullMonthFeeCents;
    let isProRated = false;

    // Only pro-rate if not starting on the 1st of the month
    if (startDate.getDate() !== 1) {
      proRatedFeeCents = await this.proRataService.calculateProRata(
        fullMonthFeeCents,
        startDate,
        monthEnd,
        tenantId,
      );
      isProRated = true;
      this.logger.debug(
        `Pro-rated fee for enrollment: ${fullMonthFeeCents} cents → ${proRatedFeeCents} cents (from day ${startDate.getDate()})`,
      );
    }

    // 4. Generate invoice number atomically (TASK-BILL-003: Use InvoiceNumberService)
    const year = startDate.getFullYear();
    const invoiceNumber = await this.invoiceNumberService.generateNextNumber(
      tenantId,
      year,
    );

    // 5. Create invoice with DRAFT status
    const today = new Date();
    const issueDate = new Date(today);
    issueDate.setHours(0, 0, 0, 0);
    const dueDate = new Date(today);
    dueDate.setDate(dueDate.getDate() + 7); // Due in 7 days
    dueDate.setHours(23, 59, 59, 999);

    const invoice = await this.invoiceRepo.create({
      tenantId,
      invoiceNumber,
      parentId: child.parentId,
      childId: enrollment.childId,
      billingPeriodStart: startDate,
      billingPeriodEnd: monthEnd,
      issueDate,
      dueDate,
      subtotalCents: 0, // Will be updated after line items
      vatCents: 0,
      totalCents: 0,
    });

    // 6. Prepare line items
    const lineItems: Array<{
      invoiceId: string;
      description: string;
      quantity: number;
      unitPriceCents: number;
      discountCents: number;
      subtotalCents: number;
      vatCents: number;
      totalCents: number;
      lineType: LineType;
      accountCode: string;
      sortOrder: number;
    }> = [];
    let sortOrder = 0;

    // TASK-BILL-024: Determine if returning student and use appropriate fee
    const isReturning = await this.isReturningStudent(
      tenantId,
      enrollment.childId,
    );
    const registrationFeeCents = feeStructure.registrationFeeCents ?? 0;
    const reRegistrationFeeCents = feeStructure.reRegistrationFeeCents ?? 0;

    // Use re-registration fee for returning students, registration fee for new students
    const applicableFeeCents = isReturning
      ? reRegistrationFeeCents
      : registrationFeeCents;
    const feeDescription = isReturning
      ? 'Re-Registration Fee'
      : 'Registration Fee';

    this.logger.debug(
      `Enrollment fee for child ${enrollment.childId}: isReturning=${isReturning}, fee=${applicableFeeCents} cents (${feeDescription})`,
    );

    // Registration/Re-registration fee line (if applicable fee > 0)
    if (applicableFeeCents > 0) {
      lineItems.push({
        invoiceId: invoice.id,
        description: feeDescription,
        quantity: 1,
        unitPriceCents: applicableFeeCents,
        discountCents: 0,
        subtotalCents: applicableFeeCents,
        vatCents: 0, // Registration fees typically VAT exempt
        totalCents: applicableFeeCents,
        lineType: LineType.REGISTRATION,
        accountCode: '4010', // Registration income account
        sortOrder: sortOrder++,
      });
    }

    // Monthly fee line (pro-rated if needed)
    const description = isProRated
      ? `${feeStructure.name} (Pro-rated from ${startDate.getDate()}/${startDate.getMonth() + 1}/${startDate.getFullYear()})`
      : feeStructure.name;

    lineItems.push({
      invoiceId: invoice.id,
      description,
      quantity: 1,
      unitPriceCents: proRatedFeeCents,
      discountCents: 0,
      subtotalCents: proRatedFeeCents,
      vatCents: 0, // VAT calculated separately if tenant is registered
      totalCents: proRatedFeeCents,
      lineType: LineType.MONTHLY_FEE,
      accountCode: '4000', // School fees income account
      sortOrder: sortOrder++,
    });

    // 7. Create line items and calculate totals using Decimal.js
    let subtotalDecimal = new Decimal(0);
    for (const line of lineItems) {
      await this.invoiceLineRepo.create(line);
      subtotalDecimal = subtotalDecimal.plus(line.subtotalCents);
    }

    const subtotalCents = subtotalDecimal
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();

    // 8. Update invoice totals
    await this.invoiceRepo.update(invoice.id, tenantId, {
      subtotalCents,
      totalCents: subtotalCents, // VAT calculated separately if tenant is VAT registered
    });

    // IMPORTANT: Update local object to reflect database state (TASK-E2E-006 fix)
    // Without this, the returned invoice has totalCents: 0 from initial creation
    invoice.subtotalCents = subtotalCents;
    invoice.totalCents = subtotalCents;

    // 9. Audit log
    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'Invoice',
      entityId: invoice.id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      afterValue: JSON.parse(
        JSON.stringify({
          ...invoice,
          subtotalCents,
          totalCents: subtotalCents,
          lines: lineItems,
          _changeSummary: `Enrollment invoice created for child ${child.firstName ?? 'Unknown'}`,
        }),
      ),
    });

    this.logger.log(
      `Created enrollment invoice ${invoiceNumber} with ${lineItems.length} line(s), total: ${subtotalCents} cents`,
    );

    return invoice;
  }

  /**
   * Get year-end review data for all active enrollments
   * TASK-ENROL-004: Year-End Processing Dashboard
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param academicYear - Academic year to review (defaults to current/next based on month)
   * @returns Year-end review result with students grouped by category
   */
  async getYearEndReview(
    tenantId: string,
    academicYear: number,
  ): Promise<YearEndReviewResult> {
    this.logger.log(
      `Generating year-end review for tenant ${tenantId}, year ${academicYear}`,
    );

    // January 1st of the review year (when children turn their new age)
    const jan1NextYear = new Date(academicYear, 0, 1);

    // Review period: Nov 1 of previous year to Jan 31 of review year
    const reviewPeriod = {
      start: new Date(academicYear - 1, 10, 1), // Nov 1
      end: new Date(academicYear, 0, 31), // Jan 31
    };

    // Get all ACTIVE enrollments
    const activeEnrollments = await this.enrollmentRepo.findByStatus(
      tenantId,
      EnrollmentStatus.ACTIVE,
    );

    const students: {
      continuing: YearEndStudent[];
      graduating: YearEndStudent[];
      withdrawing: YearEndStudent[];
    } = {
      continuing: [],
      graduating: [],
      withdrawing: [],
    };

    let graduationCandidatesCount = 0;
    let totalOutstanding = 0;
    let totalCredit = 0;

    for (const enrollment of activeEnrollments) {
      // Get child info
      const child = await this.childRepo.findById(enrollment.childId, tenantId);
      if (!child) {
        this.logger.warn(
          `Child not found for enrollment ${enrollment.id}, skipping`,
        );
        continue;
      }

      // Get parent info
      const parent = child.parentId
        ? await this.parentRepo
            .findById(child.parentId, tenantId)
            .catch(() => null)
        : null;
      const parentName = parent
        ? `${parent.firstName || ''} ${parent.lastName || ''}`.trim()
        : 'Unknown Parent';

      // Calculate age as of January 1st of academic year
      let ageOnJan1 = 0;
      if (child.dateOfBirth) {
        const dob = new Date(child.dateOfBirth);
        ageOnJan1 = jan1NextYear.getFullYear() - dob.getFullYear();
        // Adjust if birthday hasn't occurred yet by Jan 1
        const jan1Birthday = new Date(
          jan1NextYear.getFullYear(),
          dob.getMonth(),
          dob.getDate(),
        );
        if (jan1Birthday > jan1NextYear) {
          ageOnJan1--;
        }
      }

      // Flag graduation candidate (turning 6 or older)
      const graduationCandidate = ageOnJan1 >= 6;
      if (graduationCandidate) {
        graduationCandidatesCount++;
      }

      // Get fee structure info
      const feeStructure = await this.feeStructureRepo.findById(
        enrollment.feeStructureId,
        tenantId,
      );

      // Calculate account balance from outstanding invoices
      const invoices = await this.invoiceRepo.findByChild(
        tenantId,
        enrollment.childId,
      );
      let accountBalance = 0;
      for (const invoice of invoices) {
        if (invoice.status !== 'PAID' && invoice.status !== 'VOID') {
          const outstanding = invoice.totalCents - invoice.amountPaidCents;
          accountBalance += outstanding;
        }
      }

      if (accountBalance > 0) {
        totalOutstanding += accountBalance;
      } else if (accountBalance < 0) {
        totalCredit += Math.abs(accountBalance);
      }

      // Determine category (all start as 'continuing')
      // In a full implementation, this would check withdrawal notices, etc.
      // For now, we categorize based on graduation candidacy
      const category: 'continuing' | 'graduating' | 'withdrawing' =
        'continuing';

      const studentData: YearEndStudent = {
        enrollmentId: enrollment.id,
        childId: child.id,
        childName: `${child.firstName || ''} ${child.lastName || ''}`.trim(),
        parentId: child.parentId,
        parentName,
        dateOfBirth: child.dateOfBirth || new Date(),
        ageOnJan1,
        category,
        graduationCandidate,
        currentStatus: enrollment.status,
        accountBalance,
        feeTierName: feeStructure?.name || 'Unknown',
        feeStructureId: enrollment.feeStructureId,
      };

      students[category].push(studentData);
    }

    const result: YearEndReviewResult = {
      academicYear,
      reviewPeriod,
      students,
      summary: {
        totalActive: activeEnrollments.length,
        continuingCount: students.continuing.length,
        graduatingCount: students.graduating.length,
        withdrawingCount: students.withdrawing.length,
        graduationCandidates: graduationCandidatesCount,
        totalOutstanding,
        totalCredit,
      },
    };

    this.logger.log(
      `Year-end review generated: ${result.summary.totalActive} active enrollments, ${result.summary.graduationCandidates} graduation candidates`,
    );

    return result;
  }

  // TASK-BILL-003: Removed legacy generateInvoiceNumber method
  // Invoice number generation is now handled by InvoiceNumberService
  // which uses atomic PostgreSQL operations to prevent race conditions
}
