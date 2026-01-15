/**
 * Credit Note Service
 * TASK-BILL-022: Credit Note Generation for Mid-Month Withdrawal
 * TASK-BILL-004: Credit Balance VAT Recalculation
 *
 * @module database/services/credit-note
 * @description Generates credit notes for unused days when a child
 * is withdrawn mid-month. Credit notes are stored as Invoices with
 * negative amounts.
 *
 * Also provides proportional VAT recalculation when credits are applied
 * to invoices, ensuring VAT breakdown remains accurate for tax reporting.
 *
 * CRITICAL: All calculations use Decimal.js with banker's rounding.
 * CRITICAL: VAT recalculation uses last-item rounding remainder to avoid penny differences.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Invoice, Enrollment, InvoiceLine } from '@prisma/client';
import Decimal from 'decimal.js';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { InvoiceLineRepository } from '../repositories/invoice-line.repository';
import { ChildRepository } from '../repositories/child.repository';
import { FeeStructureRepository } from '../repositories/fee-structure.repository';
import { ProRataService } from './pro-rata.service';
import { AuditLogService } from './audit-log.service';
import { PrismaService } from '../prisma/prisma.service';
import { LineType, isVatApplicable } from '../entities/invoice-line.entity';
import {
  ValidationException,
  NotFoundException,
  BusinessException,
} from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/** South African VAT rate: 15% */
const VAT_RATE = new Decimal('0.15');

export interface CreditNoteResult {
  creditNote: Invoice;
  creditAmountCents: number;
  daysUnused: number;
  totalDaysInMonth: number;
}

/**
 * TASK-BILL-004: Credit allocation breakdown per line item
 * Tracks how credit is distributed across invoice lines with VAT recalculation
 */
export interface CreditAllocation {
  /** Invoice line item ID */
  lineItemId: string;
  /** Line type for VAT determination */
  lineType: LineType;
  /** Original net amount before credit (cents) */
  originalNetCents: number;
  /** Original VAT amount before credit (cents) */
  originalVatCents: number;
  /** Credit amount allocated to this line (cents) */
  creditAmountCents: number;
  /** Adjusted net amount after credit (cents) */
  adjustedNetCents: number;
  /** Adjusted VAT amount after credit (cents) */
  adjustedVatCents: number;
  /** VAT rate used for this line (percentage, e.g., 15 for 15%) */
  vatRate: number;
  /** Whether this line is VAT exempt */
  isVatExempt: boolean;
}

/**
 * TASK-BILL-004: VAT breakdown by rate after credit application
 */
export interface VatBreakdownEntry {
  /** VAT rate (percentage) */
  rate: number;
  /** Total net amount at this rate (cents) */
  netAmountCents: number;
  /** Total VAT amount at this rate (cents) */
  vatAmountCents: number;
  /** Total gross amount at this rate (cents) */
  grossAmountCents: number;
}

/**
 * TASK-BILL-004: Result of credit application with VAT recalculation
 */
export interface CreditApplicationResult {
  /** Total credit applied (cents) */
  creditAppliedCents: number;
  /** Allocation breakdown per line item */
  allocations: CreditAllocation[];
  /** VAT breakdown by rate */
  vatBreakdown: VatBreakdownEntry[];
  /** Total adjusted net (cents) */
  totalAdjustedNetCents: number;
  /** Total adjusted VAT (cents) */
  totalAdjustedVatCents: number;
  /** Total adjusted gross (cents) */
  totalAdjustedGrossCents: number;
}

/**
 * TASK-BILL-004: Line item input for proportional credit calculation
 */
export interface LineItemForCredit {
  id: string;
  lineType: LineType;
  netAmountCents: number;
  vatAmountCents: number;
  vatRate: number;
  isVatExempt: boolean;
}

@Injectable()
export class CreditNoteService {
  private readonly logger = new Logger(CreditNoteService.name);

  constructor(
    private readonly invoiceRepo: InvoiceRepository,
    private readonly invoiceLineRepo: InvoiceLineRepository,
    private readonly childRepo: ChildRepository,
    private readonly feeStructureRepo: FeeStructureRepository,
    private readonly proRataService: ProRataService,
    private readonly auditLogService: AuditLogService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create credit note for mid-month withdrawal
   * TASK-BILL-022: Implements EC-BILL-002
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param enrollment - Enrollment being withdrawn (must include feeStructureId)
   * @param withdrawalDate - Date of withdrawal
   * @param userId - User performing the withdrawal
   * @returns Credit note with calculated unused amount
   * @throws ValidationException if no unused days to credit
   * @throws NotFoundException if child or fee structure not found
   */
  async createWithdrawalCreditNote(
    tenantId: string,
    enrollment: Enrollment,
    withdrawalDate: Date,
    userId: string,
  ): Promise<CreditNoteResult> {
    // 1. Normalize withdrawal date
    const normalizedDate = new Date(withdrawalDate);
    normalizedDate.setHours(0, 0, 0, 0);

    // 2. Calculate month boundaries
    const monthStart = new Date(
      normalizedDate.getFullYear(),
      normalizedDate.getMonth(),
      1,
    );
    const monthEnd = new Date(
      normalizedDate.getFullYear(),
      normalizedDate.getMonth() + 1,
      0,
    );
    const totalDaysInMonth = monthEnd.getDate();

    // 3. Calculate used and unused days
    // Days used = from 1st to withdrawal date (inclusive)
    const daysUsed = normalizedDate.getDate();
    const daysUnused = totalDaysInMonth - daysUsed;

    // No credit if no unused days
    if (daysUnused <= 0) {
      this.logger.debug(
        `No unused days to credit for enrollment ${enrollment.id}. Withdrawal on day ${daysUsed} of ${totalDaysInMonth}`,
      );
      throw new ValidationException('No unused days to credit', [
        {
          field: 'withdrawalDate',
          message: 'Withdrawal on last day of month - no credit note required',
          value: withdrawalDate,
        },
      ]);
    }

    // 4. Get fee structure to calculate credit amount
    const feeStructure = await this.feeStructureRepo.findById(
      enrollment.feeStructureId,
      tenantId,
    );
    if (!feeStructure) {
      this.logger.error(
        `Fee structure not found: ${enrollment.feeStructureId} for tenant ${tenantId}`,
      );
      throw new NotFoundException('FeeStructure', enrollment.feeStructureId);
    }

    const monthlyFeeCents = feeStructure.amountCents;

    // 5. Calculate credit amount using school days (more accurate)
    // Use ProRataService for unused portion
    const dayAfterWithdrawal = new Date(normalizedDate);
    dayAfterWithdrawal.setDate(dayAfterWithdrawal.getDate() + 1);

    const unusedAmountCents = await this.proRataService.calculateProRata(
      monthlyFeeCents,
      dayAfterWithdrawal,
      monthEnd,
      tenantId,
    );

    // If no school days in unused period, no credit needed
    if (unusedAmountCents <= 0) {
      this.logger.debug(
        `No school days in unused period for enrollment ${enrollment.id}`,
      );
      throw new ValidationException(
        'No school days in unused period - no credit note required',
        [
          {
            field: 'withdrawalDate',
            message: 'Remaining days are all non-school days',
            value: withdrawalDate,
          },
        ],
      );
    }

    // 6. Get child info for parent reference
    const child = await this.childRepo.findById(enrollment.childId, tenantId);
    if (!child) {
      throw new NotFoundException('Child', enrollment.childId);
    }

    // 7. Generate credit note number
    const creditNoteNumber = await this.generateCreditNoteNumber(
      tenantId,
      normalizedDate.getFullYear(),
    );

    // 8. Create credit note (as Invoice with negative amounts)
    const issueDate = new Date(normalizedDate);
    const dueDate = new Date(normalizedDate);
    dueDate.setDate(dueDate.getDate() + 30); // 30 days for credit notes

    const creditNote = await this.invoiceRepo.create({
      tenantId,
      invoiceNumber: creditNoteNumber,
      parentId: child.parentId,
      childId: enrollment.childId,
      billingPeriodStart: dayAfterWithdrawal,
      billingPeriodEnd: monthEnd,
      issueDate,
      dueDate,
      subtotalCents: -unusedAmountCents, // Negative for credit
      vatCents: 0,
      totalCents: -unusedAmountCents,
      notes: `Credit note for withdrawal on ${normalizedDate.toISOString().split('T')[0]}. ${daysUnused} calendar days unused.`,
    });

    // 9. Create credit line item
    await this.invoiceLineRepo.create({
      invoiceId: creditNote.id,
      description: `Credit for unused days (${daysUnused}/${totalDaysInMonth} days) - ${feeStructure.name}`,
      quantity: 1,
      unitPriceCents: -unusedAmountCents,
      discountCents: 0,
      subtotalCents: -unusedAmountCents,
      vatCents: 0,
      totalCents: -unusedAmountCents,
      lineType: LineType.CREDIT,
      accountCode: '4000', // Same account as school fees
      sortOrder: 0,
    });

    // 10. Audit log
    await this.auditLogService.logCreate({
      tenantId,
      userId,
      entityType: 'CreditNote',
      entityId: creditNote.id,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      afterValue: JSON.parse(
        JSON.stringify({
          creditNote,
          creditAmountCents: unusedAmountCents,
          daysUnused,
          totalDaysInMonth,
          feeStructureName: feeStructure.name,
          _summary: `Credit note for withdrawal: R${(unusedAmountCents / 100).toFixed(2)}`,
        }),
      ),
    });

    this.logger.log(
      `Created credit note ${creditNoteNumber} for ${unusedAmountCents} cents (${daysUnused} unused days)`,
    );

    return {
      creditNote,
      creditAmountCents: unusedAmountCents,
      daysUnused,
      totalDaysInMonth,
    };
  }

  /**
   * Generate credit note number in format CN-YYYY-NNN
   * @param tenantId - Tenant ID for tenant-specific numbering
   * @param year - Year for the credit note
   * @returns Generated credit note number
   */
  async generateCreditNoteNumber(
    tenantId: string,
    year: number,
  ): Promise<string> {
    const prefix = `CN-${year}-`;

    // Find last credit note for this tenant and year
    const lastCreditNote = await this.invoiceRepo.findLastByPrefix(
      tenantId,
      prefix,
    );

    let sequential = 1;
    if (lastCreditNote && lastCreditNote.invoiceNumber) {
      // Extract sequence number from CN-YYYY-NNN format
      const match = lastCreditNote.invoiceNumber.match(/^CN-\d{4}-(\d+)$/);
      if (match) {
        sequential = parseInt(match[1], 10) + 1;
      }
    }

    // Format with 3-digit padding
    const paddedSequence = sequential.toString().padStart(3, '0');
    return `${prefix}${paddedSequence}`;
  }

  // ============================================
  // TASK-BILL-004: Credit Balance VAT Recalculation
  // ============================================

  /**
   * TASK-BILL-004: Calculate proportional credit allocation across invoice line items
   *
   * When a credit is applied to an invoice, this method distributes the credit
   * proportionally across all line items and recalculates VAT for each line.
   *
   * Algorithm:
   * 1. Calculate credit as percentage of invoice gross total
   * 2. Apply same percentage reduction to each line item's gross amount
   * 3. Back-calculate net and VAT from reduced gross using original VAT rate
   * 4. Last line item absorbs rounding remainder to avoid penny differences
   *
   * @param lineItems - Array of invoice line items with VAT info
   * @param totalCreditCents - Total credit amount to apply (cents)
   * @param invoiceTotalCents - Invoice total before credit (cents)
   * @returns Array of credit allocations with recalculated VAT
   * @throws BusinessException if credit exceeds invoice total
   */
  calculateProportionalCredit(
    lineItems: LineItemForCredit[],
    totalCreditCents: number,
    invoiceTotalCents: number,
  ): CreditAllocation[] {
    // Validate inputs
    if (totalCreditCents <= 0) {
      return [];
    }

    if (invoiceTotalCents <= 0) {
      throw new BusinessException(
        'Invoice total must be positive to apply credit',
        'INVALID_INVOICE_TOTAL',
        { invoiceTotalCents },
      );
    }

    if (totalCreditCents > invoiceTotalCents) {
      throw new BusinessException(
        'Credit amount cannot exceed invoice total',
        'CREDIT_EXCEEDS_INVOICE',
        { totalCreditCents, invoiceTotalCents },
      );
    }

    // Calculate credit ratio (what percentage of invoice is being credited)
    const creditRatio = new Decimal(totalCreditCents).div(invoiceTotalCents);
    const allocations: CreditAllocation[] = [];
    let runningCreditCents = new Decimal(0);

    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const isLast = i === lineItems.length - 1;

      // Calculate line's gross total
      const lineGrossCents = new Decimal(item.netAmountCents).add(
        item.vatAmountCents,
      );

      // Skip lines with zero or negative amounts
      if (lineGrossCents.lte(0)) {
        allocations.push({
          lineItemId: item.id,
          lineType: item.lineType,
          originalNetCents: item.netAmountCents,
          originalVatCents: item.vatAmountCents,
          creditAmountCents: 0,
          adjustedNetCents: item.netAmountCents,
          adjustedVatCents: item.vatAmountCents,
          vatRate: item.vatRate,
          isVatExempt: item.isVatExempt,
        });
        continue;
      }

      // Calculate line's share of credit
      // Last line gets remainder to avoid rounding issues
      let lineCreditCents: Decimal;
      if (isLast) {
        lineCreditCents = new Decimal(totalCreditCents).sub(runningCreditCents);
      } else {
        lineCreditCents = lineGrossCents
          .mul(creditRatio)
          .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
      }

      // Ensure we don't credit more than the line's value
      lineCreditCents = Decimal.min(lineCreditCents, lineGrossCents);

      runningCreditCents = runningCreditCents.add(lineCreditCents);

      // Calculate adjusted gross
      const adjustedGrossCents = lineGrossCents.sub(lineCreditCents);

      // Back-calculate net and VAT from adjusted gross
      let adjustedNetCents: Decimal;
      let adjustedVatCents: Decimal;

      if (item.isVatExempt || item.vatRate === 0) {
        // VAT exempt: all amount is net
        adjustedNetCents = adjustedGrossCents;
        adjustedVatCents = new Decimal(0);
      } else {
        // Calculate net from gross: net = gross / (1 + vatRate)
        const vatMultiplier = new Decimal(1).add(
          new Decimal(item.vatRate).div(100),
        );
        adjustedNetCents = adjustedGrossCents
          .div(vatMultiplier)
          .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
        // VAT is the difference to ensure gross = net + vat
        adjustedVatCents = adjustedGrossCents.sub(adjustedNetCents);
      }

      allocations.push({
        lineItemId: item.id,
        lineType: item.lineType,
        originalNetCents: item.netAmountCents,
        originalVatCents: item.vatAmountCents,
        creditAmountCents: lineCreditCents.toNumber(),
        adjustedNetCents: adjustedNetCents.toNumber(),
        adjustedVatCents: adjustedVatCents.toNumber(),
        vatRate: item.vatRate,
        isVatExempt: item.isVatExempt,
      });
    }

    return allocations;
  }

  /**
   * TASK-BILL-004: Build VAT breakdown from credit allocations
   *
   * Groups allocations by VAT rate and calculates totals for each rate.
   * Used for VAT reporting after credit application.
   *
   * @param allocations - Array of credit allocations
   * @returns Array of VAT breakdown entries grouped by rate
   */
  buildVatBreakdown(allocations: CreditAllocation[]): VatBreakdownEntry[] {
    const breakdownMap = new Map<number, VatBreakdownEntry>();

    for (const allocation of allocations) {
      const rate = allocation.isVatExempt ? 0 : allocation.vatRate;
      const existing = breakdownMap.get(rate);

      if (existing) {
        existing.netAmountCents += allocation.adjustedNetCents;
        existing.vatAmountCents += allocation.adjustedVatCents;
        existing.grossAmountCents +=
          allocation.adjustedNetCents + allocation.adjustedVatCents;
      } else {
        breakdownMap.set(rate, {
          rate,
          netAmountCents: allocation.adjustedNetCents,
          vatAmountCents: allocation.adjustedVatCents,
          grossAmountCents:
            allocation.adjustedNetCents + allocation.adjustedVatCents,
        });
      }
    }

    // Sort by rate (exempt/0% first, then ascending)
    return Array.from(breakdownMap.values()).sort((a, b) => a.rate - b.rate);
  }

  /**
   * TASK-BILL-004: Get invoice with line items for credit application
   *
   * Retrieves invoice and its line items, preparing data for proportional
   * credit calculation. Determines VAT rate and exemption status for each line.
   *
   * @param invoiceId - Invoice ID to retrieve
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @returns Invoice with prepared line items for credit calculation
   * @throws NotFoundException if invoice not found
   */
  async getInvoiceWithLineItems(
    invoiceId: string,
    tenantId: string,
  ): Promise<{
    invoice: Invoice;
    lineItems: LineItemForCredit[];
    totalGrossCents: number;
  }> {
    const invoice = await this.invoiceRepo.findById(invoiceId, tenantId);
    if (!invoice) {
      throw new NotFoundException('Invoice', invoiceId);
    }

    // Get line items
    const lines = await this.prisma.invoiceLine.findMany({
      where: { invoiceId },
      orderBy: { sortOrder: 'asc' },
    });

    // Prepare line items for credit calculation
    const lineItems: LineItemForCredit[] = lines.map((line) => {
      // Determine if line is VAT exempt based on type
      const lineType = line.lineType as LineType;
      const isExempt = !isVatApplicable(lineType);

      // Calculate VAT rate from line data
      // If line has VAT, calculate rate; otherwise it's 0
      let vatRate = 0;
      if (line.vatCents > 0 && line.subtotalCents > 0) {
        vatRate = new Decimal(line.vatCents)
          .div(line.subtotalCents)
          .mul(100)
          .toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN)
          .toNumber();
      } else if (!isExempt && line.subtotalCents > 0) {
        // Standard SA VAT rate for applicable lines
        vatRate = 15;
      }

      return {
        id: line.id,
        lineType,
        netAmountCents: line.subtotalCents,
        vatAmountCents: line.vatCents,
        vatRate,
        isVatExempt: isExempt,
      };
    });

    // Calculate total gross
    const totalGrossCents = lines.reduce(
      (sum, line) => sum + line.totalCents,
      0,
    );

    return { invoice, lineItems, totalGrossCents };
  }

  /**
   * TASK-BILL-004: Apply credit to invoice with VAT recalculation
   *
   * Applies a credit amount to an invoice, recalculating VAT proportionally
   * across all line items. Updates invoice totals and stores allocation details.
   *
   * This method:
   * 1. Validates credit can be applied
   * 2. Calculates proportional allocation across line items
   * 3. Updates invoice VAT and total amounts
   * 4. Returns detailed breakdown for audit/reporting
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param invoiceId - Invoice to apply credit to
   * @param creditAmountCents - Amount of credit to apply (cents)
   * @param userId - User performing the action (for audit)
   * @returns Credit application result with allocations and VAT breakdown
   * @throws NotFoundException if invoice not found
   * @throws BusinessException if credit exceeds invoice total
   */
  async applyCreditWithVatRecalculation(
    tenantId: string,
    invoiceId: string,
    creditAmountCents: number,
    userId?: string,
  ): Promise<CreditApplicationResult> {
    this.logger.log(
      `Applying credit of ${creditAmountCents} cents to invoice ${invoiceId} with VAT recalculation`,
    );

    // Get invoice and line items
    const { invoice, lineItems, totalGrossCents } =
      await this.getInvoiceWithLineItems(invoiceId, tenantId);

    // Validate credit amount
    const outstandingCents = invoice.totalCents - invoice.amountPaidCents;
    if (creditAmountCents > outstandingCents) {
      throw new BusinessException(
        'Credit amount exceeds outstanding balance',
        'CREDIT_EXCEEDS_OUTSTANDING',
        {
          creditAmountCents,
          outstandingCents,
          invoiceTotal: invoice.totalCents,
          amountPaid: invoice.amountPaidCents,
        },
      );
    }

    // Calculate proportional credit allocation
    const allocations = this.calculateProportionalCredit(
      lineItems,
      creditAmountCents,
      totalGrossCents,
    );

    // Build VAT breakdown
    const vatBreakdown = this.buildVatBreakdown(allocations);

    // Calculate totals from allocations
    const totalAdjustedNetCents = allocations.reduce(
      (sum, a) => sum + a.adjustedNetCents,
      0,
    );
    const totalAdjustedVatCents = allocations.reduce(
      (sum, a) => sum + a.adjustedVatCents,
      0,
    );
    const totalAdjustedGrossCents =
      totalAdjustedNetCents + totalAdjustedVatCents;

    // Update invoice totals
    await this.invoiceRepo.update(invoiceId, tenantId, {
      subtotalCents: totalAdjustedNetCents,
      vatCents: totalAdjustedVatCents,
      totalCents: totalAdjustedGrossCents,
    });

    // Audit log - serialize complex objects for JSON storage
    await this.auditLogService.logUpdate({
      tenantId,
      userId,
      entityType: 'Invoice',
      entityId: invoiceId,
      beforeValue: {
        subtotalCents: invoice.subtotalCents,
        vatCents: invoice.vatCents,
        totalCents: invoice.totalCents,
      },
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      afterValue: JSON.parse(
        JSON.stringify({
          subtotalCents: totalAdjustedNetCents,
          vatCents: totalAdjustedVatCents,
          totalCents: totalAdjustedGrossCents,
          creditApplied: creditAmountCents,
          vatBreakdown,
          allocations: allocations.map((a) => ({
            lineItemId: a.lineItemId,
            creditAmount: a.creditAmountCents,
            vatAdjustment: a.originalVatCents - a.adjustedVatCents,
          })),
        }),
      ),
      changeSummary: `Applied R${(creditAmountCents / 100).toFixed(2)} credit with VAT recalculation. VAT adjusted from ${invoice.vatCents} to ${totalAdjustedVatCents} cents.`,
    });

    this.logger.log(
      `Credit applied to invoice ${invoiceId}: R${(creditAmountCents / 100).toFixed(2)} credit, ` +
        `VAT adjusted from ${invoice.vatCents} to ${totalAdjustedVatCents} cents`,
    );

    return {
      creditAppliedCents: creditAmountCents,
      allocations,
      vatBreakdown,
      totalAdjustedNetCents,
      totalAdjustedVatCents,
      totalAdjustedGrossCents,
    };
  }

  /**
   * TASK-BILL-004: Calculate VAT adjustment for a credit amount
   *
   * Quick calculation of how much VAT would be reduced for a given credit amount.
   * Useful for previewing credit impact before applying.
   *
   * @param invoiceTotalCents - Invoice total (cents)
   * @param invoiceVatCents - Current invoice VAT (cents)
   * @param creditAmountCents - Credit to apply (cents)
   * @returns Estimated VAT reduction in cents
   */
  calculateVatAdjustmentPreview(
    invoiceTotalCents: number,
    invoiceVatCents: number,
    creditAmountCents: number,
  ): number {
    if (invoiceTotalCents <= 0 || creditAmountCents <= 0) {
      return 0;
    }

    // Proportional VAT reduction: vatReduction = vat * (credit / total)
    const creditRatio = new Decimal(creditAmountCents).div(invoiceTotalCents);
    const vatReduction = new Decimal(invoiceVatCents)
      .mul(creditRatio)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);

    return vatReduction.toNumber();
  }
}
