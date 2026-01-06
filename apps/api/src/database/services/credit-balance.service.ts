/**
 * Credit Balance Service
 * TASK-PAY-018: Overpayment Credit Balance Implementation
 *
 * @module database/services/credit-balance
 * @description Service for managing parent credit balances from overpayments,
 * refunds, and credit notes. All amounts are in CENTS as integers.
 */

import { Injectable, Logger } from '@nestjs/common';
import { CreditBalance, CreditBalanceSourceType } from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { AuditLogService } from './audit-log.service';
import { NotFoundException, BusinessException } from '../../shared/exceptions';
import { AuditAction } from '../entities/audit-log.entity';

export interface CreateCreditBalanceDto {
  tenantId: string;
  parentId: string;
  amountCents: number;
  sourceType: CreditBalanceSourceType;
  sourceId?: string;
  description?: string;
}

export interface CreditBalanceSummary {
  totalCreditCents: number;
  availableCreditCents: number;
  appliedCreditCents: number;
  creditCount: number;
}

@Injectable()
export class CreditBalanceService {
  private readonly logger = new Logger(CreditBalanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Create credit balance from overpayment
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID to credit
   * @param paymentId - Source payment ID
   * @param amountCents - Credit amount in cents (must be positive)
   * @param userId - User ID performing action
   * @returns Created CreditBalance record
   * @throws BusinessException if amount is not positive
   */
  async createFromOverpayment(
    tenantId: string,
    parentId: string,
    paymentId: string,
    amountCents: number,
    userId?: string,
  ): Promise<CreditBalance> {
    if (amountCents <= 0) {
      throw new BusinessException(
        'Credit amount must be positive',
        'INVALID_CREDIT_AMOUNT',
        { amountCents },
      );
    }

    this.logger.log(
      `Creating credit balance from overpayment: parent=${parentId}, amount=${amountCents} cents`,
    );

    const creditBalance = await this.prisma.creditBalance.create({
      data: {
        tenantId,
        parentId,
        amountCents,
        sourceType: CreditBalanceSourceType.OVERPAYMENT,
        sourceId: paymentId,
        description: `Overpayment credit from payment ${paymentId}`,
        isApplied: false,
      },
    });

    await this.auditLogService.logAction({
      tenantId,
      userId,
      entityType: 'CreditBalance',
      entityId: creditBalance.id,
      action: AuditAction.CREATE,
      afterValue: {
        parentId,
        amountCents,
        sourceType: 'OVERPAYMENT',
        sourceId: paymentId,
      },
      changeSummary: `Credit balance created: R${(amountCents / 100).toFixed(2)} from overpayment`,
    });

    this.logger.log(
      `Created credit balance ${creditBalance.id} for R${(amountCents / 100).toFixed(2)}`,
    );

    return creditBalance;
  }

  /**
   * Create credit balance from credit note
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID to credit
   * @param creditNoteId - Source credit note ID
   * @param amountCents - Credit amount in cents (must be positive)
   * @param userId - User ID performing action
   * @returns Created CreditBalance record
   */
  async createFromCreditNote(
    tenantId: string,
    parentId: string,
    creditNoteId: string,
    amountCents: number,
    userId?: string,
  ): Promise<CreditBalance> {
    if (amountCents <= 0) {
      throw new BusinessException(
        'Credit amount must be positive',
        'INVALID_CREDIT_AMOUNT',
        { amountCents },
      );
    }

    this.logger.log(
      `Creating credit balance from credit note: parent=${parentId}, amount=${amountCents} cents`,
    );

    const creditBalance = await this.prisma.creditBalance.create({
      data: {
        tenantId,
        parentId,
        amountCents,
        sourceType: CreditBalanceSourceType.CREDIT_NOTE,
        sourceId: creditNoteId,
        description: `Credit from credit note ${creditNoteId}`,
        isApplied: false,
      },
    });

    await this.auditLogService.logAction({
      tenantId,
      userId,
      entityType: 'CreditBalance',
      entityId: creditBalance.id,
      action: AuditAction.CREATE,
      afterValue: {
        parentId,
        amountCents,
        sourceType: 'CREDIT_NOTE',
        sourceId: creditNoteId,
      },
      changeSummary: `Credit balance created: R${(amountCents / 100).toFixed(2)} from credit note`,
    });

    return creditBalance;
  }

  /**
   * Get total available (unapplied) credit for a parent
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   * @returns Total available credit in cents
   */
  async getAvailableCredit(tenantId: string, parentId: string): Promise<number> {
    const result = await this.prisma.creditBalance.aggregate({
      where: {
        tenantId,
        parentId,
        isApplied: false,
      },
      _sum: {
        amountCents: true,
      },
    });

    return result._sum.amountCents ?? 0;
  }

  /**
   * Get credit balance summary for a parent
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   * @returns Credit balance summary with totals
   */
  async getCreditSummary(
    tenantId: string,
    parentId: string,
  ): Promise<CreditBalanceSummary> {
    const [available, applied, total] = await Promise.all([
      this.prisma.creditBalance.aggregate({
        where: { tenantId, parentId, isApplied: false },
        _sum: { amountCents: true },
        _count: true,
      }),
      this.prisma.creditBalance.aggregate({
        where: { tenantId, parentId, isApplied: true },
        _sum: { amountCents: true },
      }),
      this.prisma.creditBalance.aggregate({
        where: { tenantId, parentId },
        _sum: { amountCents: true },
        _count: true,
      }),
    ]);

    return {
      totalCreditCents: total._sum.amountCents ?? 0,
      availableCreditCents: available._sum.amountCents ?? 0,
      appliedCreditCents: applied._sum.amountCents ?? 0,
      creditCount: total._count,
    };
  }

  /**
   * Get all credit balances for a parent
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   * @returns Array of CreditBalance records ordered by creation date
   */
  async getCreditHistory(
    tenantId: string,
    parentId: string,
  ): Promise<CreditBalance[]> {
    return this.prisma.creditBalance.findMany({
      where: { tenantId, parentId },
      orderBy: { createdAt: 'desc' },
      include: {
        appliedToInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
          },
        },
      },
    });
  }

  /**
   * Get unapplied credit balances for a parent (for applying to invoices)
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   * @returns Array of unapplied CreditBalance records ordered by creation date (FIFO)
   */
  async getUnappliedCredits(
    tenantId: string,
    parentId: string,
  ): Promise<CreditBalance[]> {
    return this.prisma.creditBalance.findMany({
      where: {
        tenantId,
        parentId,
        isApplied: false,
      },
      orderBy: { createdAt: 'asc' }, // FIFO: oldest first
    });
  }

  /**
   * Apply a credit balance to an invoice
   * @param creditBalanceId - Credit balance ID to apply
   * @param invoiceId - Invoice ID to apply to
   * @param userId - User ID performing action
   * @returns Updated CreditBalance record
   * @throws NotFoundException if credit balance not found
   * @throws BusinessException if already applied
   */
  async applyToInvoice(
    creditBalanceId: string,
    invoiceId: string,
    userId?: string,
  ): Promise<CreditBalance> {
    const creditBalance = await this.prisma.creditBalance.findUnique({
      where: { id: creditBalanceId },
    });

    if (!creditBalance) {
      throw new NotFoundException('CreditBalance', creditBalanceId);
    }

    if (creditBalance.isApplied) {
      throw new BusinessException(
        'Credit balance has already been applied',
        'CREDIT_ALREADY_APPLIED',
        {
          creditBalanceId,
          appliedToInvoiceId: creditBalance.appliedToInvoiceId,
          appliedAt: creditBalance.appliedAt,
        },
      );
    }

    const updated = await this.prisma.creditBalance.update({
      where: { id: creditBalanceId },
      data: {
        isApplied: true,
        appliedToInvoiceId: invoiceId,
        appliedAt: new Date(),
      },
    });

    await this.auditLogService.logAction({
      tenantId: creditBalance.tenantId,
      userId,
      entityType: 'CreditBalance',
      entityId: creditBalanceId,
      action: AuditAction.UPDATE,
      beforeValue: { isApplied: false },
      afterValue: {
        isApplied: true,
        appliedToInvoiceId: invoiceId,
        appliedAt: updated.appliedAt,
      },
      changeSummary: `Credit balance of R${(creditBalance.amountCents / 100).toFixed(2)} applied to invoice ${invoiceId}`,
    });

    this.logger.log(
      `Applied credit balance ${creditBalanceId} (R${(creditBalance.amountCents / 100).toFixed(2)}) to invoice ${invoiceId}`,
    );

    return updated;
  }

  /**
   * Find credit balance by ID
   * @param creditBalanceId - Credit balance ID
   * @returns CreditBalance or null
   */
  async findById(creditBalanceId: string): Promise<CreditBalance | null> {
    return this.prisma.creditBalance.findUnique({
      where: { id: creditBalanceId },
    });
  }

  /**
   * TASK-PAY-020: Get available credit balances for a parent
   * Alias for getUnappliedCredits with consistent naming per spec
   * @param tenantId - Tenant ID
   * @param parentId - Parent ID
   * @returns Array of unapplied CreditBalance records ordered by creation date (FIFO)
   */
  async getAvailableCreditBalances(
    tenantId: string,
    parentId: string,
  ): Promise<CreditBalance[]> {
    return this.getUnappliedCredits(tenantId, parentId);
  }

  /**
   * TASK-PAY-020: Apply credit balance to an invoice with FIFO ordering
   *
   * Applies available credit balances to an invoice, respecting:
   * - FIFO order (oldest credits applied first)
   * - Partial application (if credit exceeds need, splits the credit)
   * - Maximum amount limit (won't apply more than invoice needs)
   *
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @param parentId - Parent ID whose credits to apply
   * @param invoiceId - Invoice ID to apply credits to
   * @param maxAmountCents - Maximum credit amount to apply (typically invoice total)
   * @param userId - User ID performing the action (for audit)
   * @returns Applied credit amount in cents
   * @throws BusinessException if invalid amounts
   */
  async applyCreditToInvoice(
    tenantId: string,
    parentId: string,
    invoiceId: string,
    maxAmountCents: number,
    userId?: string,
  ): Promise<number> {
    if (maxAmountCents <= 0) {
      return 0;
    }

    // 1. Get available credits (oldest first - FIFO)
    const availableCredits = await this.getAvailableCreditBalances(tenantId, parentId);

    if (availableCredits.length === 0) {
      this.logger.debug(`No available credits for parent ${parentId}`);
      return 0;
    }

    let remainingToApply = maxAmountCents;
    let totalApplied = 0;

    // 2. Apply credits in FIFO order
    for (const credit of availableCredits) {
      if (remainingToApply <= 0) break;

      const amountToApply = Math.min(credit.amountCents, remainingToApply);

      if (amountToApply === credit.amountCents) {
        // Full application - mark entire credit as applied
        await this.prisma.creditBalance.update({
          where: { id: credit.id },
          data: {
            isApplied: true,
            appliedToInvoiceId: invoiceId,
            appliedAt: new Date(),
          },
        });

        this.logger.log(
          `Applied full credit ${credit.id} (R${(amountToApply / 100).toFixed(2)}) to invoice ${invoiceId}`,
        );
      } else {
        // Partial application - split the credit
        // Mark original with applied amount and create new credit for remainder
        await this.prisma.creditBalance.update({
          where: { id: credit.id },
          data: {
            amountCents: amountToApply, // Reduce to applied amount
            isApplied: true,
            appliedToInvoiceId: invoiceId,
            appliedAt: new Date(),
          },
        });

        // Create new credit for remaining amount
        const remainingCredit = await this.prisma.creditBalance.create({
          data: {
            tenantId,
            parentId,
            amountCents: credit.amountCents - amountToApply,
            sourceType: CreditBalanceSourceType.ADJUSTMENT,
            sourceId: credit.id, // Link to original
            description: `Remaining credit from split (original: ${credit.id})`,
            isApplied: false,
          },
        });

        this.logger.log(
          `Split credit ${credit.id}: R${(amountToApply / 100).toFixed(2)} applied to invoice ${invoiceId}, ` +
            `R${((credit.amountCents - amountToApply) / 100).toFixed(2)} retained as ${remainingCredit.id}`,
        );

        // Audit the split
        await this.auditLogService.logAction({
          tenantId,
          userId,
          entityType: 'CreditBalance',
          entityId: remainingCredit.id,
          action: AuditAction.CREATE,
          afterValue: {
            parentId,
            amountCents: credit.amountCents - amountToApply,
            sourceType: 'ADJUSTMENT',
            sourceId: credit.id,
          },
          changeSummary: `Credit balance split: R${((credit.amountCents - amountToApply) / 100).toFixed(2)} remaining from ${credit.id}`,
        });
      }

      // Audit the application
      await this.auditLogService.logAction({
        tenantId,
        userId,
        entityType: 'CreditBalance',
        entityId: credit.id,
        action: AuditAction.UPDATE,
        beforeValue: { isApplied: false, amountCents: credit.amountCents },
        afterValue: {
          isApplied: true,
          amountCents: amountToApply,
          appliedToInvoiceId: invoiceId,
        },
        changeSummary: `Applied R${(amountToApply / 100).toFixed(2)} credit to invoice ${invoiceId}`,
      });

      totalApplied += amountToApply;
      remainingToApply -= amountToApply;
    }

    if (totalApplied > 0) {
      this.logger.log(
        `Total credit applied to invoice ${invoiceId}: R${(totalApplied / 100).toFixed(2)}`,
      );
    }

    return totalApplied;
  }
}
