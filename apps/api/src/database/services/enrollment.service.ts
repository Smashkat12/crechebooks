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
import { FeeStructureRepository } from '../repositories/fee-structure.repository';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { InvoiceLineRepository } from '../repositories/invoice-line.repository';
import { TenantRepository } from '../repositories/tenant.repository';
import { AuditLogService } from './audit-log.service';
import { ProRataService } from './pro-rata.service';
import { CreditNoteService } from './credit-note.service';
import { EnrollmentStatus, IEnrollment } from '../entities/enrollment.entity';
import { LineType } from '../entities/invoice-line.entity';
import {
  NotFoundException,
  ConflictException,
  ValidationException,
} from '../../shared/exceptions';
import { UpdateEnrollmentDto } from '../dto/enrollment.dto';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/**
 * Result of enrolling a child, including the generated invoice (if any)
 * TASK-BILL-023: Enrollment Invoice UI Integration
 */
export interface EnrollChildResult {
  enrollment: IEnrollment;
  invoice: Invoice | null;
}

@Injectable()
export class EnrollmentService {
  private readonly logger = new Logger(EnrollmentService.name);

  constructor(
    private readonly enrollmentRepo: EnrollmentRepository,
    private readonly childRepo: ChildRepository,
    private readonly feeStructureRepo: FeeStructureRepository,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly invoiceLineRepo: InvoiceLineRepository,
    private readonly proRataService: ProRataService,
    private readonly creditNoteService: CreditNoteService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Enroll a child in a fee structure
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param childId - Child ID to enroll
   * @param feeStructureId - Fee structure to enroll child in
   * @param startDate - Enrollment start date
   * @param userId - User performing the enrollment
   * @returns Created enrollment with generated invoice (if any)
   * @throws NotFoundException if child or fee structure doesn't exist
   * @throws ConflictException if child already has active enrollment
   * @throws ValidationException if startDate is in the past
   */
  async enrollChild(
    tenantId: string,
    childId: string,
    feeStructureId: string,
    startDate: Date,
    userId: string,
  ): Promise<EnrollChildResult> {
    // 1. Validate child exists and belongs to tenant
    const child = await this.childRepo.findById(childId);
    if (!child || child.tenantId !== tenantId) {
      this.logger.error(
        `Child not found or tenant mismatch: ${childId} for tenant ${tenantId}`,
      );
      throw new NotFoundException('Child', childId);
    }

    // 2. Validate fee structure exists and belongs to tenant
    const feeStructure = await this.feeStructureRepo.findById(feeStructureId);
    if (!feeStructure || feeStructure.tenantId !== tenantId) {
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

    // 4. Validate startDate not in past (allow today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startNorm = new Date(startDate);
    startNorm.setHours(0, 0, 0, 0);
    if (startNorm < today) {
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
      // Log error but don't fail enrollment if invoice creation fails
      this.logger.error(
        `Failed to create enrollment invoice for child ${childId}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }

    this.logger.log(
      `Successfully enrolled child ${childId} in enrollment ${enrollment.id}`,
    );

    return {
      enrollment: enrollment as IEnrollment,
      invoice: enrollmentInvoice,
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
    const enrollment = await this.enrollmentRepo.findById(enrollmentId);
    if (!enrollment || enrollment.tenantId !== tenantId) {
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
      );
      if (!feeStructure || feeStructure.tenantId !== tenantId) {
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
    const updated = await this.enrollmentRepo.update(enrollmentId, updates);

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
    const enrollment = await this.enrollmentRepo.findById(enrollmentId);
    if (!enrollment || enrollment.tenantId !== tenantId) {
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
    const updated = await this.enrollmentRepo.update(enrollmentId, {
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

    for (let i = 0; i < enrollments.length; i++) {
      const childId = enrollments[i].childId;
      if (i === 0) {
        // First child: 0%
        discountMap.set(childId, new Decimal(0));
      } else if (enrollments.length === 2) {
        // 2 children: second gets 10%
        discountMap.set(childId, new Decimal(10));
      } else {
        // 3+ children
        if (i === 1) {
          // Second child: 15%
          discountMap.set(childId, new Decimal(15));
        } else {
          // Third+: 20%
          discountMap.set(childId, new Decimal(20));
        }
      }
    }

    this.logger.log(
      `Calculated sibling discounts for parent ${parentId}: ${enrollments.length} children`,
    );

    return discountMap;
  }

  /**
   * Create enrollment invoice with registration fee and pro-rated first month
   * TASK-BILL-021: Implements EC-BILL-001 and REQ-BILL-001
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
    const child = await this.childRepo.findById(enrollment.childId);
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

    // 4. Generate invoice number (INV-YYYY-NNNNN format)
    const year = startDate.getFullYear();
    const invoiceNumber = await this.generateInvoiceNumber(tenantId, year);

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

    // Registration fee line (if registrationFeeCents > 0)
    const registrationFeeCents = feeStructure.registrationFeeCents ?? 0;
    if (registrationFeeCents > 0) {
      lineItems.push({
        invoiceId: invoice.id,
        description: 'Registration Fee',
        quantity: 1,
        unitPriceCents: registrationFeeCents,
        discountCents: 0,
        subtotalCents: registrationFeeCents,
        vatCents: 0, // Registration fees typically VAT exempt
        totalCents: registrationFeeCents,
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
    await this.invoiceRepo.update(invoice.id, {
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
   * Generate unique invoice number in format INV-YYYY-NNN
   * Uses 3-digit padding to match InvoiceGenerationService format
   * @param tenantId - Tenant ID for tenant-specific numbering
   * @param year - Year for the invoice
   * @returns Generated invoice number
   */
  private async generateInvoiceNumber(
    tenantId: string,
    year: number,
  ): Promise<string> {
    // Find the last invoice for this tenant in this year
    const lastInvoice = await this.invoiceRepo.findLastInvoiceForYear(
      tenantId,
      year,
    );

    let maxSequence = 0;
    if (lastInvoice && lastInvoice.invoiceNumber) {
      // Extract sequence number from INV-YYYY-NNN or INV-YYYY-NNNNN format
      const match = lastInvoice.invoiceNumber.match(/^INV-\d{4}-(\d+)$/);
      if (match) {
        maxSequence = parseInt(match[1], 10);
      }
    }

    // Also check if there are any invoices with the next sequence to avoid duplicates
    // This handles cases where there are mixed format invoices (3-digit vs 5-digit)
    const nextSequence = maxSequence + 1;
    const candidateNumber = `INV-${year}-${nextSequence.toString().padStart(3, '0')}`;
    const existing = await this.invoiceRepo.findByInvoiceNumber(
      tenantId,
      candidateNumber,
    );

    if (existing) {
      // If the candidate already exists, find a higher sequence
      // Query all invoices for this year and find the max
      const allInvoices = await this.invoiceRepo.findByTenant(tenantId, {});
      let highestSeq = maxSequence;
      for (const inv of allInvoices) {
        const m = inv.invoiceNumber.match(/^INV-(\d{4})-(\d+)$/);
        if (m && parseInt(m[1], 10) === year) {
          const seq = parseInt(m[2], 10);
          if (seq > highestSeq) {
            highestSeq = seq;
          }
        }
      }
      // Format with 3-digit padding to match InvoiceGenerationService
      const paddedSequence = (highestSeq + 1).toString().padStart(3, '0');
      return `INV-${year}-${paddedSequence}`;
    }

    // Format with 3-digit padding to match InvoiceGenerationService
    const paddedSequence = nextSequence.toString().padStart(3, '0');
    return `INV-${year}-${paddedSequence}`;
  }
}
