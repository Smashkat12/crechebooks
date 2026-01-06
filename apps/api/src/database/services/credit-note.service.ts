/**
 * Credit Note Service
 * TASK-BILL-022: Credit Note Generation for Mid-Month Withdrawal
 *
 * @module database/services/credit-note
 * @description Generates credit notes for unused days when a child
 * is withdrawn mid-month. Credit notes are stored as Invoices with
 * negative amounts.
 *
 * CRITICAL: All calculations use Decimal.js with banker's rounding.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Invoice, Enrollment, FeeStructure } from '@prisma/client';
import Decimal from 'decimal.js';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { InvoiceLineRepository } from '../repositories/invoice-line.repository';
import { ChildRepository } from '../repositories/child.repository';
import { FeeStructureRepository } from '../repositories/fee-structure.repository';
import { ProRataService } from './pro-rata.service';
import { AuditLogService } from './audit-log.service';
import { LineType } from '../entities/invoice-line.entity';
import { ValidationException, NotFoundException } from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

export interface CreditNoteResult {
  creditNote: Invoice;
  creditAmountCents: number;
  daysUnused: number;
  totalDaysInMonth: number;
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
          message:
            'Withdrawal on last day of month - no credit note required',
          value: withdrawalDate,
        },
      ]);
    }

    // 4. Get fee structure to calculate credit amount
    const feeStructure = await this.feeStructureRepo.findById(
      enrollment.feeStructureId,
    );
    if (!feeStructure || feeStructure.tenantId !== tenantId) {
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
    const child = await this.childRepo.findById(enrollment.childId);
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
}
