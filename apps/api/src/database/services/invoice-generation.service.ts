/**
 * Invoice Generation Service
 * TASK-BILL-012: Invoice Generation Service
 * TASK-BILL-002: Batch Transaction Isolation with Advisory Locking
 * TASK-BILL-040: Added Transaction Isolation for Atomic Invoice Creation
 * TASK-BILL-041: Fixed Invoice Number Race Condition with Atomic Counter
 *
 * @module database/services/invoice-generation
 * @description Generates monthly invoices for enrolled children.
 * Calculates fees, applies sibling discounts, adds VAT for registered tenants,
 * and syncs draft invoices to Xero.
 *
 * CRITICAL: All monetary values are in cents (integers).
 * CRITICAL: Uses Decimal.js with banker's rounding (ROUND_HALF_EVEN).
 * CRITICAL: All operations must filter by tenantId for multi-tenant isolation.
 * CRITICAL: TASK-BILL-002 - Batch operations use advisory locking to prevent
 *           concurrent batch runs for the same tenant/billing period.
 * CRITICAL: TASK-BILL-040 - Each invoice creation is wrapped in a transaction
 *           to ensure atomicity (invoice + lines + ad-hoc marking).
 * CRITICAL: TASK-BILL-041 - Invoice numbers generated using atomic counter
 *           to prevent race conditions in concurrent invoice creation.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Invoice, InvoiceLine, AdHocCharge, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { InvoiceLineRepository } from '../repositories/invoice-line.repository';
import { TenantRepository } from '../repositories/tenant.repository';
import { ParentRepository } from '../repositories/parent.repository';
import { EnrollmentService } from './enrollment.service';
import { AuditLogService } from './audit-log.service';
import { XeroSyncService } from './xero-sync.service';
import { ProRataService } from './pro-rata.service';
import { CreditBalanceService } from './credit-balance.service';
import { InvoiceNumberService } from './invoice-number.service';
import { InvoiceStatus } from '../entities/invoice.entity';
import { LineType, isVatApplicable } from '../entities/invoice-line.entity';
import {
  InvoiceGenerationResult,
  LineItemInput,
  EnrollmentWithRelations,
  XeroLineItem,
} from '../dto/invoice-generation.dto';
import {
  NotFoundException,
  ValidationException,
  ConflictException,
} from '../../shared/exceptions';
import { hashStringToInt } from '../../common/transaction';
import {
  getBillingPeriod,
  parseBillingMonth,
  isLeapYear,
  getLastDayOfMonth,
  toSATimezone,
} from '../../common/utils/tax-period.utils';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

@Injectable()
export class InvoiceGenerationService {
  private readonly logger = new Logger(InvoiceGenerationService.name);

  /** South African VAT rate: 15% */
  private readonly VAT_RATE = new Decimal('0.15');

  /** Default payment terms in days */
  private readonly DEFAULT_DUE_DAYS = 7;

  /** Default income account code for school fees */
  private readonly SCHOOL_FEES_ACCOUNT = '4000';

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly invoiceLineRepo: InvoiceLineRepository,
    private readonly tenantRepo: TenantRepository,
    private readonly parentRepo: ParentRepository,
    private readonly enrollmentService: EnrollmentService,
    private readonly auditLogService: AuditLogService,
    private readonly xeroSyncService: XeroSyncService,
    private readonly proRataService: ProRataService,
    private readonly creditBalanceService: CreditBalanceService,
    private readonly invoiceNumberService: InvoiceNumberService,
  ) {}

  /**
   * Generate monthly invoices for all active enrollments
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param billingMonth - Format: YYYY-MM
   * @param userId - User performing the generation
   * @param childIds - Optional array to generate for specific children only
   * @returns Generation summary with created invoices and errors
   *
   * @throws NotFoundException if tenant doesn't exist
   * @throws ValidationException if billingMonth format is invalid
   */
  async generateMonthlyInvoices(
    tenantId: string,
    billingMonth: string,
    userId: string,
    childIds?: string[],
  ): Promise<InvoiceGenerationResult> {
    this.logger.log(
      `Starting invoice generation for tenant ${tenantId}, month ${billingMonth}`,
    );

    // TASK-BILL-005: Validate billing month format using centralized utility
    const parsedMonth = parseBillingMonth(billingMonth);
    if (!parsedMonth) {
      throw new ValidationException(
        'Invalid billing month format. Expected YYYY-MM',
        [
          {
            field: 'billingMonth',
            message: 'Format must be YYYY-MM with valid month (01-12)',
            value: billingMonth,
          },
        ],
      );
    }

    const { year, month } = parsedMonth;

    // TASK-BILL-005: Calculate billing period dates using utility that handles edge cases
    // This correctly handles:
    // - Leap year February (29 days)
    // - Month boundary transitions (31st to 1st)
    // - Varying month lengths (28, 29, 30, 31 days)
    const { start: billingPeriodStart, end: billingPeriodEnd } =
      getBillingPeriod(year, month);

    // Log leap year handling for February
    if (month === 2 && isLeapYear(year)) {
      this.logger.log(
        `TASK-BILL-005: February ${year} is a leap year - billing period ends on ${getLastDayOfMonth(year, month)}`,
      );
    }

    // Get tenant for VAT status
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant', tenantId);
    }
    const isVatRegistered = tenant.taxStatus === 'VAT_REGISTERED';

    // Get active enrollments with relations
    const enrollments = await this.getActiveEnrollmentsWithRelations(tenantId);

    // Filter by childIds if provided
    const filteredEnrollments =
      childIds && childIds.length > 0
        ? enrollments.filter((e) => childIds.includes(e.childId))
        : enrollments;

    if (filteredEnrollments.length === 0) {
      this.logger.warn(
        `No active enrollments found for tenant ${tenantId}${childIds ? ` with specified childIds` : ''}`,
      );
      return {
        invoicesCreated: 0,
        totalAmountCents: 0,
        invoices: [],
        errors: [],
      };
    }

    // TASK-BILL-002: Acquire advisory lock to prevent concurrent batch runs
    // Lock key includes tenant and billing month to allow different months to run in parallel
    const lockAcquired = await this.acquireBatchLock(tenantId, billingMonth);

    if (!lockAcquired) {
      this.logger.warn(
        `TASK-BILL-002: Could not acquire batch lock for tenant ${tenantId}, month ${billingMonth}. Another batch may be in progress.`,
      );
      throw new ConflictException(
        `Invoice generation already in progress for billing period ${billingMonth}. Please wait and try again.`,
      );
    }

    this.logger.log(
      `TASK-BILL-002: Acquired batch lock for tenant ${tenantId}, month ${billingMonth}`,
    );

    const result: InvoiceGenerationResult = {
      invoicesCreated: 0,
      totalAmountCents: 0,
      invoices: [],
      errors: [],
    };

    try {
      // TASK-BILL-041: Use atomic counter for invoice number generation
      // Each invoice will get its number atomically to prevent race conditions
      const batchYear = billingPeriodStart.getFullYear();

      // Group enrollments by parent for sibling discount calculation
      const enrollmentsByParent = new Map<string, EnrollmentWithRelations[]>();
      for (const enrollment of filteredEnrollments) {
        const parentId = enrollment.child.parentId;
        if (!enrollmentsByParent.has(parentId)) {
          enrollmentsByParent.set(parentId, []);
        }
        enrollmentsByParent.get(parentId)!.push(enrollment);
      }

      // Process each parent's enrollments
      for (const [parentId, parentEnrollments] of enrollmentsByParent) {
        // Get sibling discounts for this parent
        const siblingDiscounts =
          await this.enrollmentService.applySiblingDiscount(tenantId, parentId);

        // Create invoice for each child
        for (const enrollment of parentEnrollments) {
          try {
            // Check for existing invoice for this period
            const existingInvoice = await this.invoiceRepo.findByBillingPeriod(
              tenantId,
              enrollment.childId,
              billingPeriodStart,
              billingPeriodEnd,
            );

            if (existingInvoice) {
              result.errors.push({
                childId: enrollment.childId,
                enrollmentId: enrollment.id,
                error: `Invoice already exists for billing period ${billingMonth}`,
                code: 'DUPLICATE_INVOICE',
              });
              continue;
            }

            // TASK-BILL-040: Build all data first, then create invoice atomically
            // Build line items (before transaction - read-only operations)
            const lineItems: LineItemInput[] = [];

            // Get monthly fee (may have custom override)
            const monthlyFeeCents =
              enrollment.customFeeOverrideCents ??
              enrollment.feeStructure.amountCents;

            // TASK-BILL-036: Calculate pro-rata for mid-month enrollment/withdrawal
            const proRataResult = await this.calculateMonthlyFeeWithProRata(
              enrollment,
              billingPeriodStart,
              billingPeriodEnd,
              tenantId,
              monthlyFeeCents,
            );

            // Add monthly fee line (may be pro-rated)
            lineItems.push({
              description: proRataResult.description,
              quantity: new Decimal(1),
              unitPriceCents: proRataResult.amountCents,
              discountCents: 0,
              lineType: LineType.MONTHLY_FEE,
              accountCode: this.SCHOOL_FEES_ACCOUNT,
            });

            // TASK-BILL-037: Add re-registration fee for January invoices (continuing students)
            const reRegistrationFeeCents =
              enrollment.feeStructure.reRegistrationFeeCents ?? 0;
            if (reRegistrationFeeCents > 0) {
              const isEligibleForReReg = await this.isEligibleForReRegistration(
                tenantId,
                enrollment.childId,
                billingMonth,
              );

              if (isEligibleForReReg) {
                lineItems.push({
                  description: 'Annual Re-Registration Fee',
                  quantity: new Decimal(1),
                  unitPriceCents: reRegistrationFeeCents,
                  discountCents: 0,
                  lineType: LineType.REGISTRATION,
                  accountCode: '4010', // Registration income account
                });
                this.logger.log(
                  `Added re-registration fee (${reRegistrationFeeCents} cents) for child ${enrollment.childId} - January continuing student`,
                );
              }
            }

            // TASK-BILL-017: Get and include pending ad-hoc charges for this child
            const adHocCharges = await this.getAdHocCharges(
              tenantId,
              enrollment.childId,
              billingMonth,
            );

            // Collect ad-hoc charge IDs for atomic marking
            const adHocChargeIds = adHocCharges.map((c) => c.id);

            // TASK-BILL-038: Process ad-hoc charges with VAT exemption support
            for (const charge of adHocCharges) {
              lineItems.push({
                description: charge.description,
                quantity: new Decimal(1),
                unitPriceCents: charge.amountCents,
                discountCents: 0,
                lineType: LineType.AD_HOC,
                accountCode: this.SCHOOL_FEES_ACCOUNT,
                adHocChargeId: charge.id, // Track which charge this came from
                isVatExempt: charge.isVatExempt, // TASK-BILL-038: Pass VAT exemption override
              });
            }

            // Apply sibling discount if applicable
            // TASK-BILL-036: Apply discount to actual fee charged (may be pro-rated)
            const discountPercentage =
              siblingDiscounts.get(enrollment.childId) ?? new Decimal(0);

            if (discountPercentage.greaterThan(0)) {
              // Calculate discount amount based on actual fee charged (including pro-rata)
              const discountAmount = new Decimal(proRataResult.amountCents)
                .mul(discountPercentage)
                .div(100);
              const discountCents = discountAmount
                .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
                .toNumber();

              if (discountCents > 0) {
                // Add discount as negative line item
                lineItems.push({
                  description: `Sibling Discount (${discountPercentage.toString()}%)`,
                  quantity: new Decimal(1),
                  unitPriceCents: -discountCents, // Negative for discount
                  discountCents: 0,
                  lineType: LineType.DISCOUNT,
                  accountCode: this.SCHOOL_FEES_ACCOUNT,
                });
              }
            }

            // Get tenant due days
            const dueDays = tenant?.invoiceDueDays ?? this.DEFAULT_DUE_DAYS;

            // TASK-BILL-041: Generate invoice number atomically to prevent race conditions
            const invoiceNumber = await this.generateInvoiceNumber(
              tenantId,
              batchYear,
            );

            // TASK-BILL-040: Create invoice atomically with all line items and ad-hoc marking
            // This ensures either all operations succeed or all are rolled back - no partial invoices
            const invoice = await this.createInvoiceAtomic(
              tenantId,
              enrollment,
              billingPeriodStart,
              billingPeriodEnd,
              invoiceNumber,
              lineItems,
              isVatRegistered,
              adHocChargeIds,
              userId,
              dueDays,
            );

            if (adHocChargeIds.length > 0) {
              this.logger.log(
                `TASK-BILL-040: Atomically created invoice with ${adHocChargeIds.length} ad-hoc charges for child ${enrollment.childId}`,
              );
            }

            // Refresh invoice to get updated totals
            let updatedInvoice = await this.invoiceRepo.findById(
              invoice.id,
              tenantId,
            );
            if (!updatedInvoice) {
              throw new Error('Invoice not found after creation');
            }

            // TASK-PAY-020: Check and apply available credit balances
            if (updatedInvoice.totalCents > 0) {
              const availableCreditCents =
                await this.creditBalanceService.getAvailableCredit(
                  tenantId,
                  enrollment.child.parentId,
                );

              if (availableCreditCents > 0) {
                const creditToApply = Math.min(
                  availableCreditCents,
                  updatedInvoice.totalCents,
                );

                if (creditToApply > 0) {
                  // Apply credit using CreditBalanceService
                  const appliedCredit =
                    await this.creditBalanceService.applyCreditToInvoice(
                      tenantId,
                      enrollment.child.parentId,
                      invoice.id,
                      creditToApply,
                      userId,
                    );

                  if (appliedCredit > 0) {
                    // Add credit line item (negative amount)
                    await this.invoiceLineRepo.create({
                      invoiceId: invoice.id,
                      description: 'Credit Applied',
                      quantity: 1,
                      unitPriceCents: -appliedCredit, // Negative for credit
                      discountCents: 0,
                      subtotalCents: -appliedCredit,
                      vatCents: 0, // Credits don't have VAT
                      totalCents: -appliedCredit,
                      lineType: LineType.CREDIT,
                      accountCode: this.SCHOOL_FEES_ACCOUNT,
                      sortOrder: 99, // Place credit line last
                    });

                    // Calculate new totals
                    const newSubtotalCents =
                      updatedInvoice.subtotalCents - appliedCredit;
                    const newTotalCents =
                      updatedInvoice.totalCents - appliedCredit;
                    const newStatus: InvoiceStatus =
                      newTotalCents <= 0
                        ? InvoiceStatus.PAID
                        : (updatedInvoice.status as InvoiceStatus);

                    // Update invoice totals
                    await this.invoiceRepo.update(invoice.id, tenantId, {
                      subtotalCents: newSubtotalCents,
                      totalCents: newTotalCents,
                      amountPaidCents: appliedCredit, // Credit counts as partial payment
                      status: newStatus,
                    });

                    this.logger.log(
                      `Applied R${(appliedCredit / 100).toFixed(2)} credit to invoice ${updatedInvoice.invoiceNumber}, ` +
                        `new total: R${(newTotalCents / 100).toFixed(2)}, status: ${newStatus}`,
                    );

                    // Refresh invoice with updated totals
                    updatedInvoice = await this.invoiceRepo.findById(
                      invoice.id,
                      tenantId,
                    );
                    if (!updatedInvoice) {
                      throw new Error(
                        'Invoice not found after credit application',
                      );
                    }
                  }
                }
              }
            }

            // Sync to Xero - errors are logged but don't fail invoice creation
            const xeroInvoiceId = await this.syncToXero(updatedInvoice);
            if (xeroInvoiceId) {
              await this.invoiceRepo.update(updatedInvoice.id, tenantId, {
                xeroInvoiceId,
              });
              updatedInvoice.xeroInvoiceId = xeroInvoiceId;
            }

            // Build child name
            const childName = `${enrollment.child.firstName} ${enrollment.child.lastName}`;

            // Add to result
            result.invoicesCreated++;
            result.totalAmountCents += updatedInvoice.totalCents;
            result.invoices.push({
              id: updatedInvoice.id,
              invoiceNumber: updatedInvoice.invoiceNumber,
              childId: enrollment.childId,
              childName,
              parentId: enrollment.child.parentId,
              totalCents: updatedInvoice.totalCents,
              status: updatedInvoice.status as InvoiceStatus,
              xeroInvoiceId: updatedInvoice.xeroInvoiceId,
            });

            this.logger.log(
              `Created invoice ${updatedInvoice.invoiceNumber} for child ${childName} (${enrollment.childId})`,
            );
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            const errorCode =
              error instanceof NotFoundException
                ? 'NOT_FOUND'
                : error instanceof ValidationException
                  ? 'VALIDATION_ERROR'
                  : error instanceof ConflictException
                    ? 'CONFLICT'
                    : 'GENERATION_ERROR';

            result.errors.push({
              childId: enrollment.childId,
              enrollmentId: enrollment.id,
              error: errorMessage,
              code: errorCode,
            });

            this.logger.error(
              `Failed to generate invoice for child ${enrollment.childId}: ${errorMessage}`,
            );
          }
        }
      }

      this.logger.log(
        `Invoice generation complete: ${result.invoicesCreated} created, ${result.errors.length} errors`,
      );

      // Audit log
      await this.auditLogService.logCreate({
        tenantId,
        userId,
        entityType: 'InvoiceBatch',
        entityId: billingMonth,
        afterValue: {
          billingMonth,
          invoicesCreated: result.invoicesCreated,
          totalAmountCents: result.totalAmountCents,
          errorCount: result.errors.length,
        },
      });

      return result;
    } finally {
      // TASK-BILL-002: Always release the advisory lock, even if an error occurred
      await this.releaseBatchLock(tenantId, billingMonth);
      this.logger.log(
        `TASK-BILL-002: Released batch lock for tenant ${tenantId}, month ${billingMonth}`,
      );
    }
  }

  /**
   * TASK-BILL-002: Acquire advisory lock for batch invoice processing
   *
   * Uses PostgreSQL advisory locks to prevent concurrent batch runs for the
   * same tenant and billing period combination. This prevents race conditions
   * where multiple processes try to generate invoices simultaneously.
   *
   * @param tenantId - Tenant ID for lock scoping
   * @param billingMonth - Billing month for lock scoping (YYYY-MM)
   * @returns true if lock was acquired, false if already held by another process
   */
  async acquireBatchLock(
    tenantId: string,
    billingMonth: string,
  ): Promise<boolean> {
    const lockKey = `batch_invoice_${tenantId}_${billingMonth}`;
    const lockId = hashStringToInt(lockKey);

    this.logger.debug(
      `TASK-BILL-002: Attempting to acquire advisory lock: ${lockKey} (id: ${lockId})`,
    );

    try {
      const result = await this.prisma.$queryRaw<
        [{ pg_try_advisory_lock: boolean }]
      >`
        SELECT pg_try_advisory_lock(${lockId})
      `;

      return result[0]?.pg_try_advisory_lock ?? false;
    } catch (error) {
      this.logger.error(
        `TASK-BILL-002: Error acquiring advisory lock: ${(error as Error).message}`,
      );
      return false;
    }
  }

  /**
   * TASK-BILL-002: Release advisory lock for batch invoice processing
   *
   * @param tenantId - Tenant ID for lock scoping
   * @param billingMonth - Billing month for lock scoping (YYYY-MM)
   */
  async releaseBatchLock(
    tenantId: string,
    billingMonth: string,
  ): Promise<void> {
    const lockKey = `batch_invoice_${tenantId}_${billingMonth}`;
    const lockId = hashStringToInt(lockKey);

    this.logger.debug(
      `TASK-BILL-002: Releasing advisory lock: ${lockKey} (id: ${lockId})`,
    );

    try {
      await this.prisma.$queryRaw`SELECT pg_advisory_unlock(${lockId})`;
    } catch (error) {
      // Log but don't throw - lock will be released when connection closes anyway
      this.logger.error(
        `TASK-BILL-002: Error releasing advisory lock: ${(error as Error).message}`,
      );
    }
  }

  /**
   * Create a single invoice for an enrollment
   *
   * @param tenantId - Tenant ID
   * @param enrollment - Enrollment with relations
   * @param billingPeriodStart - Start of billing period
   * @param billingPeriodEnd - End of billing period
   * @param userId - User performing the action
   * @returns Created invoice
   */
  async createInvoice(
    tenantId: string,
    enrollment: EnrollmentWithRelations,
    billingPeriodStart: Date,
    billingPeriodEnd: Date,
    userId: string,
    precomputedInvoiceNumber?: string,
  ): Promise<Invoice> {
    // Use precomputed number or generate one (for backward compatibility)
    const year = billingPeriodStart.getFullYear();
    const invoiceNumber =
      precomputedInvoiceNumber ??
      (await this.generateInvoiceNumber(tenantId, year));

    // Get tenant for due days setting
    const tenant = await this.tenantRepo.findById(tenantId);
    const dueDays = tenant?.invoiceDueDays ?? this.DEFAULT_DUE_DAYS;

    // Set dates (no time component)
    const issueDate = new Date();
    issueDate.setHours(0, 0, 0, 0);

    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + dueDays);

    // Create invoice
    const invoice = await this.invoiceRepo.create({
      tenantId,
      invoiceNumber,
      parentId: enrollment.child.parentId,
      childId: enrollment.childId,
      billingPeriodStart,
      billingPeriodEnd,
      issueDate,
      dueDate,
      subtotalCents: 0, // Will be updated when adding lines
      vatCents: 0,
      totalCents: 0,
    });

    // Audit log
    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'Invoice',
      entityId: invoice.id,
      afterValue: {
        invoiceNumber,
        childId: enrollment.childId,
        billingPeriod: `${billingPeriodStart.toISOString().split('T')[0]} to ${billingPeriodEnd.toISOString().split('T')[0]}`,
      },
    });

    return invoice;
  }

  /**
   * Add line items to invoice and calculate totals
   * NOTE: This method is kept for backward compatibility but is superseded by
   * createInvoiceAtomic() which provides transaction isolation (TASK-BILL-040)
   *
   * @param invoiceId - Invoice ID
   * @param lineItems - Array of line items to add
   * @param isVatRegistered - Whether tenant is VAT registered
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @returns Created invoice lines
   */
  async addLineItems(
    invoiceId: string,
    lineItems: LineItemInput[],
    isVatRegistered: boolean,
    tenantId?: string,
  ): Promise<InvoiceLine[]> {
    const createdLines: InvoiceLine[] = [];
    let subtotal = new Decimal(0);
    let totalVat = new Decimal(0);

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];

      // Calculate line subtotal (quantity * unitPrice)
      // Note: unitPriceCents can be negative for discounts
      const lineSubtotal = new Decimal(item.unitPriceCents).mul(item.quantity);

      // TASK-BILL-038: Calculate VAT based on line type, tenant VAT registration, and override
      // Uses isVatApplicable() per South African VAT Act No. 89 of 1991, Section 12(h):
      // - VAT EXEMPT: MONTHLY_FEE, REGISTRATION, RE_REGISTRATION, EXTRA_MURAL
      // - VAT APPLICABLE (15%): BOOKS, STATIONERY, UNIFORM, SCHOOL_TRIP, MEALS, TRANSPORT, LATE_PICKUP, DAMAGED_EQUIPMENT
      // - AD_HOC: Configurable via isVatExempt override
      // - NO VAT: DISCOUNT, CREDIT (adjustments)
      let lineVatCents = 0;
      if (
        isVatRegistered &&
        isVatApplicable(item.lineType, item.isVatExempt) &&
        item.unitPriceCents > 0
      ) {
        lineVatCents = this.calculateVAT(
          lineSubtotal.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber(),
        );
      }

      // Line total = subtotal + VAT
      const lineTotal = lineSubtotal.add(lineVatCents);

      // Create line
      const line = await this.invoiceLineRepo.create({
        invoiceId,
        description: item.description,
        quantity: item.quantity.toNumber(),
        unitPriceCents: item.unitPriceCents,
        discountCents: item.discountCents,
        subtotalCents: lineSubtotal
          .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
          .toNumber(),
        vatCents: lineVatCents,
        totalCents: lineTotal
          .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
          .toNumber(),
        lineType: item.lineType,
        accountCode: item.accountCode,
        sortOrder: i,
      });

      createdLines.push(line);

      // Accumulate totals
      subtotal = subtotal.add(lineSubtotal);
      totalVat = totalVat.add(lineVatCents);
    }

    // Calculate invoice total
    const invoiceSubtotalCents = subtotal
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();
    const invoiceVatCents = totalVat
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
      .toNumber();
    const invoiceTotalCents = invoiceSubtotalCents + invoiceVatCents;

    // Update invoice totals (only if tenantId is provided)
    if (tenantId) {
      await this.invoiceRepo.update(invoiceId, tenantId, {
        subtotalCents: invoiceSubtotalCents,
        vatCents: invoiceVatCents,
        totalCents: invoiceTotalCents,
      });
    } else {
      // Fallback: update without tenant validation (legacy behavior)
      this.logger.warn(
        `addLineItems called without tenantId for invoice ${invoiceId} - consider using createInvoiceAtomic instead`,
      );
      await this.prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          subtotalCents: invoiceSubtotalCents,
          vatCents: invoiceVatCents,
          totalCents: invoiceTotalCents,
        },
      });
    }

    return createdLines;
  }

  /**
   * TASK-BILL-040: Create invoice atomically with transaction isolation
   *
   * Wraps invoice header creation, line items, ad-hoc charge marking, and total
   * updates in a single database transaction. If any operation fails, the entire
   * invoice creation is rolled back - no partial invoices can exist.
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param enrollment - Enrollment with relations
   * @param billingPeriodStart - Start of billing period
   * @param billingPeriodEnd - End of billing period
   * @param invoiceNumber - Pre-computed invoice number
   * @param lineItems - Array of line items to create
   * @param isVatRegistered - Whether tenant is VAT registered
   * @param adHocChargeIds - IDs of ad-hoc charges to mark as invoiced
   * @param userId - User performing the action
   * @param dueDays - Days until due date
   * @returns Created invoice with totals
   *
   * @throws Error if transaction fails (entire operation is rolled back)
   */
  private async createInvoiceAtomic(
    tenantId: string,
    enrollment: EnrollmentWithRelations,
    billingPeriodStart: Date,
    billingPeriodEnd: Date,
    invoiceNumber: string,
    lineItems: LineItemInput[],
    isVatRegistered: boolean,
    adHocChargeIds: string[],
    userId: string,
    dueDays: number,
  ): Promise<Invoice> {
    this.logger.debug(
      `TASK-BILL-040: Creating invoice ${invoiceNumber} with transaction isolation`,
    );

    // Set dates (no time component)
    const issueDate = new Date();
    issueDate.setHours(0, 0, 0, 0);
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + dueDays);

    // Execute all database operations atomically
    const invoice = await this.prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // 1. Create invoice header
        const createdInvoice = await tx.invoice.create({
          data: {
            tenantId,
            invoiceNumber,
            parentId: enrollment.child.parentId,
            childId: enrollment.childId,
            billingPeriodStart,
            billingPeriodEnd,
            issueDate,
            dueDate,
            subtotalCents: 0,
            vatCents: 0,
            totalCents: 0,
            status: 'DRAFT',
          },
        });

        // 2. Create all line items and calculate totals
        let subtotal = new Decimal(0);
        let totalVat = new Decimal(0);

        for (let i = 0; i < lineItems.length; i++) {
          const item = lineItems[i];

          // Calculate line subtotal
          const lineSubtotal = new Decimal(item.unitPriceCents).mul(
            item.quantity,
          );

          // Calculate VAT based on line type and VAT registration
          let lineVatCents = 0;
          if (
            isVatRegistered &&
            isVatApplicable(item.lineType, item.isVatExempt) &&
            item.unitPriceCents > 0
          ) {
            lineVatCents = this.calculateVAT(
              lineSubtotal
                .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
                .toNumber(),
            );
          }

          const lineTotal = lineSubtotal.add(lineVatCents);

          // Create line item
          await tx.invoiceLine.create({
            data: {
              invoiceId: createdInvoice.id,
              description: item.description,
              quantity: item.quantity.toNumber(),
              unitPriceCents: item.unitPriceCents,
              discountCents: item.discountCents,
              subtotalCents: lineSubtotal
                .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
                .toNumber(),
              vatCents: lineVatCents,
              totalCents: lineTotal
                .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
                .toNumber(),
              lineType: item.lineType,
              accountCode: item.accountCode,
              sortOrder: i,
            },
          });

          // Accumulate totals
          subtotal = subtotal.add(lineSubtotal);
          totalVat = totalVat.add(lineVatCents);
        }

        // 3. Calculate final totals
        const invoiceSubtotalCents = subtotal
          .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
          .toNumber();
        const invoiceVatCents = totalVat
          .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN)
          .toNumber();
        const invoiceTotalCents = invoiceSubtotalCents + invoiceVatCents;

        // 4. Update invoice with calculated totals
        const updatedInvoice = await tx.invoice.update({
          where: { id: createdInvoice.id },
          data: {
            subtotalCents: invoiceSubtotalCents,
            vatCents: invoiceVatCents,
            totalCents: invoiceTotalCents,
          },
        });

        // 5. Mark ad-hoc charges as invoiced (within same transaction)
        if (adHocChargeIds.length > 0) {
          await tx.adHocCharge.updateMany({
            where: { id: { in: adHocChargeIds } },
            data: {
              invoicedAt: new Date(),
              invoiceId: createdInvoice.id,
            },
          });

          this.logger.debug(
            `TASK-BILL-040: Marked ${adHocChargeIds.length} ad-hoc charges as invoiced within transaction`,
          );
        }

        return updatedInvoice;
      },
      {
        // Transaction options for robustness
        maxWait: 5000, // Max wait time to acquire lock (5s)
        timeout: 30000, // Max transaction execution time (30s)
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable, // Strictest isolation
      },
    );

    this.logger.log(
      `TASK-BILL-040: Invoice ${invoiceNumber} created atomically with ${lineItems.length} line items`,
    );

    // Audit log (outside transaction - non-critical)
    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'Invoice',
      entityId: invoice.id,
      afterValue: {
        invoiceNumber,
        childId: enrollment.childId,
        billingPeriod: `${billingPeriodStart.toISOString().split('T')[0]} to ${billingPeriodEnd.toISOString().split('T')[0]}`,
        transactionIsolated: true,
      },
    });

    return invoice;
  }

  /**
   * Calculate VAT using Decimal.js with banker's rounding
   *
   * @param amountCents - Amount in cents (integer)
   * @returns VAT amount in cents (integer, banker's rounded)
   */
  calculateVAT(amountCents: number): number {
    const amount = new Decimal(amountCents);
    const vat = amount.mul(this.VAT_RATE);
    return vat.toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN).toNumber();
  }

  /**
   * Generate next invoice number for tenant using atomic counter
   * TASK-BILL-041: Prevents race conditions in concurrent invoice creation
   *
   * Format: INV-{YYYY}-{sequential}
   * Example: INV-2025-001
   *
   * TASK-BILL-003: Delegates to InvoiceNumberService for atomic counter operations.
   * Uses PostgreSQL UPDATE...RETURNING to prevent race conditions.
   *
   * @param tenantId - Tenant ID
   * @param year - Year for invoice
   * @param tx - Optional transaction client for batch operations
   * @returns Generated invoice number
   */
  async generateInvoiceNumber(
    tenantId: string,
    year: number,
    tx?: Prisma.TransactionClient,
  ): Promise<string> {
    // TASK-BILL-003: Delegate to InvoiceNumberService for atomic operations
    return this.invoiceNumberService.generateNextNumber(tenantId, year, tx);
  }

  /**
   * Reserve a batch of invoice numbers atomically
   * TASK-BILL-003: Prevents race conditions in batch invoice generation
   *
   * Atomically increments counter by count and returns the starting sequential.
   * This guarantees no other request can get overlapping numbers.
   *
   * @param tenantId - Tenant ID
   * @param year - Year for invoice numbering
   * @param count - Number of invoice numbers to reserve
   * @param tx - Optional transaction client for batch operations
   * @returns Starting sequential number (the first reserved number)
   *
   * @example
   * // Reserve 5 numbers
   * const startSeq = await reserveInvoiceNumbers(tenantId, 2025, 5);
   * // If startSeq is 10, you get numbers 10, 11, 12, 13, 14
   */
  async reserveInvoiceNumbers(
    tenantId: string,
    year: number,
    count: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    // TASK-BILL-003: Delegate to InvoiceNumberService for atomic operations
    const reservation = await this.invoiceNumberService.reserveNumbers(
      tenantId,
      year,
      count,
      tx,
    );
    return reservation.startSequence;
  }

  /**
   * Get the current counter value without incrementing (for preview only)
   * TASK-BILL-003: Use reserveInvoiceNumbers for actual invoice creation
   *
   * @param tenantId - Tenant ID
   * @param year - Year for invoice numbering
   * @returns Current counter value (next invoice will be this + 1)
   */
  async peekNextInvoiceSequential(
    tenantId: string,
    year: number,
  ): Promise<number> {
    // TASK-BILL-003: Delegate to InvoiceNumberService
    return this.invoiceNumberService.peekNextSequential(tenantId, year);
  }

  /**
   * Format an invoice number from year and sequential
   *
   * @param year - Year for invoice
   * @param sequential - Sequential number
   * @returns Formatted invoice number (e.g., INV-2025-001)
   */
  formatInvoiceNumber(year: number, sequential: number): string {
    // TASK-BILL-003: Delegate to InvoiceNumberService
    return this.invoiceNumberService.formatInvoiceNumber(year, sequential);
  }

  /**
   * Build Xero line items from invoice lines
   *
   * @param invoiceId - Invoice ID
   * @returns Array of Xero-formatted line items
   */
  async buildXeroLineItems(invoiceId: string): Promise<XeroLineItem[]> {
    const lines = await this.invoiceLineRepo.findByInvoice(invoiceId);

    return lines.map((line) => ({
      description: line.description,
      quantity: Number(line.quantity),
      unitAmount: line.unitPriceCents / 100, // Convert cents to currency
      accountCode: line.accountCode ?? this.SCHOOL_FEES_ACCOUNT,
      taxType: line.vatCents > 0 ? ('OUTPUT' as const) : ('NONE' as const),
    }));
  }

  /**
   * Sync invoice to Xero as DRAFT via MCP
   *
   * @param invoice - Invoice to sync (must have id and invoiceNumber)
   * @returns Xero invoice ID, or null if sync failed (logged but not thrown)
   *
   * CRITICAL: Errors are logged but DO NOT fail the invoice creation.
   * This follows the fail-fast principle for local operations while
   * gracefully handling external service failures.
   */
  async syncToXero(invoice: Invoice): Promise<string | null> {
    this.logger.log(`Syncing invoice ${invoice.invoiceNumber} to Xero`);

    try {
      // Get parent to find Xero contact ID
      const parent = await this.parentRepo.findById(
        invoice.parentId,
        invoice.tenantId,
      );

      if (!parent) {
        this.logger.warn(
          `Cannot sync invoice ${invoice.id} to Xero: Parent ${invoice.parentId} not found`,
        );
        return null;
      }

      if (!parent.xeroContactId) {
        this.logger.warn(
          `Cannot sync invoice ${invoice.id} to Xero: Parent ${invoice.parentId} has no Xero contact ID`,
        );
        return null;
      }

      // Build Xero line items
      const xeroLineItems = await this.buildXeroLineItems(invoice.id);

      if (xeroLineItems.length === 0) {
        this.logger.warn(
          `Cannot sync invoice ${invoice.id} to Xero: No line items found`,
        );
        return null;
      }

      // Create invoice draft in Xero via XeroSyncService
      const xeroInvoiceId = await this.xeroSyncService.createInvoiceDraft(
        invoice.tenantId,
        invoice.invoiceNumber,
        invoice.dueDate,
        parent.xeroContactId,
        xeroLineItems,
      );

      if (xeroInvoiceId) {
        this.logger.log(
          `Successfully synced invoice ${invoice.invoiceNumber} to Xero: ${xeroInvoiceId}`,
        );
      } else {
        this.logger.warn(
          `Xero sync returned null for invoice ${invoice.invoiceNumber}`,
        );
      }

      return xeroInvoiceId;
    } catch (error) {
      // Log error but DO NOT throw - invoice creation should succeed locally
      // even if Xero sync fails
      this.logger.error(
        `Failed to sync invoice ${invoice.id} to Xero: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }

  /**
   * Get active enrollments with child and feeStructure relations
   *
   * @param tenantId - Tenant ID
   * @returns Array of enrollments with relations
   */
  private async getActiveEnrollmentsWithRelations(
    tenantId: string,
  ): Promise<EnrollmentWithRelations[]> {
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        tenantId,
        status: 'ACTIVE',
      },
      include: {
        child: {
          select: {
            id: true,
            parentId: true,
            firstName: true,
            lastName: true,
          },
        },
        feeStructure: {
          select: {
            id: true,
            name: true,
            amountCents: true,
            vatInclusive: true,
            reRegistrationFeeCents: true, // TASK-BILL-037: For January re-registration
          },
        },
      },
      orderBy: [{ startDate: 'asc' }],
    });

    return enrollments as EnrollmentWithRelations[];
  }

  /**
   * TASK-BILL-017: Get pending ad-hoc charges for a child within a billing period
   *
   * @param tenantId - Tenant ID for isolation
   * @param childId - Child ID to get charges for
   * @param billingMonth - Format: YYYY-MM
   * @returns Array of uninvoiced ad-hoc charges
   */
  private async getAdHocCharges(
    tenantId: string,
    childId: string,
    billingMonth: string,
  ): Promise<AdHocCharge[]> {
    // Parse billing month to get date range
    const [year, month] = billingMonth.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1); // First day of month
    const endDate = new Date(year, month, 0); // Last day of month

    // Query for uninvoiced charges within the billing period
    const charges = await this.prisma.adHocCharge.findMany({
      where: {
        tenantId,
        childId,
        invoicedAt: null, // Not yet invoiced
        chargeDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { chargeDate: 'asc' },
    });

    this.logger.debug(
      `Found ${charges.length} pending ad-hoc charges for child ${childId} in ${billingMonth}`,
    );

    return charges;
  }

  /**
   * TASK-BILL-017: Mark ad-hoc charges as invoiced
   *
   * @param chargeIds - Array of charge IDs to mark
   * @param invoiceId - Invoice ID to link charges to
   */
  private async markChargesInvoiced(
    chargeIds: string[],
    invoiceId: string,
  ): Promise<void> {
    const now = new Date();

    await this.prisma.adHocCharge.updateMany({
      where: {
        id: { in: chargeIds },
      },
      data: {
        invoicedAt: now,
        invoiceId,
      },
    });
  }

  /**
   * TASK-BILL-036: Calculate monthly fee with automatic pro-rata for mid-month enrollment/withdrawal
   *
   * Checks if the enrollment starts after the billing period start (mid-month enrollment)
   * or ends before the billing period end (mid-month withdrawal) and applies pro-rata
   * calculation accordingly.
   *
   * @param enrollment - Enrollment with relations
   * @param billingPeriodStart - First day of billing month
   * @param billingPeriodEnd - Last day of billing month
   * @param tenantId - Tenant ID for pro-rata calculation
   * @param monthlyFeeCents - Full monthly fee in cents
   * @returns Object with amount in cents, description, and whether pro-rata was applied
   */
  private async calculateMonthlyFeeWithProRata(
    enrollment: EnrollmentWithRelations,
    billingPeriodStart: Date,
    billingPeriodEnd: Date,
    tenantId: string,
    monthlyFeeCents: number,
  ): Promise<{ amountCents: number; description: string; isProRata: boolean }> {
    // Normalize all dates to remove time component
    const normalizedBillingStart = this.normalizeDate(billingPeriodStart);
    const normalizedBillingEnd = this.normalizeDate(billingPeriodEnd);
    const normalizedEnrollmentStart = this.normalizeDate(enrollment.startDate);
    const normalizedEnrollmentEnd = enrollment.endDate
      ? this.normalizeDate(enrollment.endDate)
      : null;

    // Determine actual billing period for this enrollment
    // effectiveStart: later of enrollment start or billing period start
    const effectiveStart =
      normalizedEnrollmentStart > normalizedBillingStart
        ? normalizedEnrollmentStart
        : normalizedBillingStart;

    // effectiveEnd: earlier of enrollment end (if exists) or billing period end
    const effectiveEnd =
      normalizedEnrollmentEnd && normalizedEnrollmentEnd < normalizedBillingEnd
        ? normalizedEnrollmentEnd
        : normalizedBillingEnd;

    // Check if pro-rata is needed
    const isMidMonthStart = normalizedEnrollmentStart > normalizedBillingStart;
    const isMidMonthEnd =
      normalizedEnrollmentEnd && normalizedEnrollmentEnd < normalizedBillingEnd;

    if (!isMidMonthStart && !isMidMonthEnd) {
      // Full month - no pro-rata needed
      return {
        amountCents: monthlyFeeCents,
        description: enrollment.feeStructure.name,
        isProRata: false,
      };
    }

    // Calculate pro-rata amount using ProRataService
    const proRataAmountCents = await this.proRataService.calculateProRata(
      monthlyFeeCents,
      effectiveStart,
      effectiveEnd,
      tenantId,
    );

    // Build description with date range
    const startDay = effectiveStart.getDate();
    const endDay = effectiveEnd.getDate();
    const monthNames = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const monthName = monthNames[effectiveStart.getMonth()];

    const description = `${enrollment.feeStructure.name} (Pro-rata: ${startDay} ${monthName} - ${endDay} ${monthName})`;

    this.logger.log(
      `Pro-rata applied for child ${enrollment.childId}: ` +
        `${monthlyFeeCents} cents -> ${proRataAmountCents} cents ` +
        `(${startDay} ${monthName} - ${endDay} ${monthName})`,
    );

    return {
      amountCents: proRataAmountCents,
      description,
      isProRata: true,
    };
  }

  /**
   * Normalize a date by removing time component
   * @param date - Date to normalize
   * @returns Date with time set to 00:00:00.000
   */
  private normalizeDate(date: Date): Date {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  }

  /**
   * TASK-BILL-037: Check if child is eligible for January re-registration fee
   *
   * Re-registration fee applies ONLY to continuing students:
   * - Billing month must be January (YYYY-01)
   * - Child must have been ACTIVE on December 31st of previous year
   *
   * This is NOT for students returning after WITHDRAWN/GRADUATED status.
   * Those are new enrollments and pay the full registration fee (R500).
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param childId - Child ID to check
   * @param billingMonth - Format: YYYY-MM
   * @returns true if child is eligible for re-registration fee
   */
  private async isEligibleForReRegistration(
    tenantId: string,
    childId: string,
    billingMonth: string,
  ): Promise<boolean> {
    // Only applies to January invoices
    if (!billingMonth.endsWith('-01')) {
      return false;
    }

    // Get previous year's December 31st
    const year = parseInt(billingMonth.substring(0, 4), 10);
    const previousDecember31 = new Date(year - 1, 11, 31); // Month is 0-indexed

    // Check if child was active on that date using EnrollmentService
    const wasActive = await this.enrollmentService.wasActiveOnDate(
      tenantId,
      childId,
      previousDecember31,
    );

    if (wasActive) {
      this.logger.debug(
        `Child ${childId} is eligible for re-registration fee: was active on ${year - 1}-12-31`,
      );
    }

    return wasActive;
  }
}
