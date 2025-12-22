/**
 * Reconciliation Service
 * TASK-RECON-011: Bank Reconciliation Service
 *
 * @module database/services/reconciliation
 * @description Service for bank account reconciliation.
 * Handles matching transactions to bank statements and detecting discrepancies.
 * All amounts are in CENTS as integers. Uses Decimal.js for precise calculations.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  Transaction,
  ReconciliationStatus,
  Reconciliation,
} from '@prisma/client';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationRepository } from '../repositories/reconciliation.repository';
import {
  ReconcileDto,
  ReconcileResult,
  BalanceCalculation,
  MatchResult,
} from '../dto/reconciliation-service.dto';
import {
  ConflictException,
  NotFoundException,
  BusinessException,
} from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reconciliationRepo: ReconciliationRepository,
  ) {}

  /**
   * Reconcile a bank account for a period
   * Formula: opening + credits - debits = calculated closing
   * Status = RECONCILED if |discrepancy| <= 1 cent, else DISCREPANCY
   *
   * @param dto - Reconciliation parameters
   * @param userId - User performing the reconciliation
   * @returns ReconcileResult with status and discrepancy information
   * @throws BusinessException if period dates are invalid
   * @throws ConflictException if period is already reconciled
   */
  async reconcile(dto: ReconcileDto, userId: string): Promise<ReconcileResult> {
    this.logger.log(
      `Starting reconciliation for tenant ${dto.tenantId}, account ${dto.bankAccount}, period ${dto.periodStart} to ${dto.periodEnd}`,
    );

    // Validate inputs
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);

    if (periodStart > periodEnd) {
      throw new BusinessException(
        'Period start must be before period end',
        'INVALID_PERIOD',
        { periodStart: dto.periodStart, periodEnd: dto.periodEnd },
      );
    }

    // Check existing reconciliation
    const existing = await this.reconciliationRepo.findByTenantAndAccount(
      dto.tenantId,
      dto.bankAccount,
      periodStart,
    );

    if (existing?.status === ReconciliationStatus.RECONCILED) {
      throw new ConflictException(
        `Period already reconciled for bank account ${dto.bankAccount}`,
        { periodStart: dto.periodStart, status: existing.status },
      );
    }

    // Calculate balance from transactions
    const calculation = await this.calculateBalance(
      dto.tenantId,
      dto.bankAccount,
      periodStart,
      periodEnd,
      dto.openingBalanceCents,
    );

    // Determine discrepancy and status
    const discrepancyCents =
      dto.closingBalanceCents - calculation.calculatedBalanceCents;
    const status =
      Math.abs(discrepancyCents) <= 1
        ? ReconciliationStatus.RECONCILED
        : ReconciliationStatus.DISCREPANCY;

    // Transactional: create record and mark transactions
    return await this.prisma.$transaction(
      async (tx): Promise<ReconcileResult> => {
        // Create or update reconciliation record
        let reconciliation: Reconciliation;
        if (existing) {
          reconciliation = await tx.reconciliation.update({
            where: { id: existing.id },
            data: {
              closingBalanceCents: dto.closingBalanceCents,
              calculatedBalanceCents: calculation.calculatedBalanceCents,
              discrepancyCents,
              status,
              reconciledBy:
                status === ReconciliationStatus.RECONCILED ? userId : null,
              reconciledAt:
                status === ReconciliationStatus.RECONCILED ? new Date() : null,
            },
          });
        } else {
          reconciliation = await tx.reconciliation.create({
            data: {
              tenantId: dto.tenantId,
              bankAccount: dto.bankAccount,
              periodStart,
              periodEnd,
              openingBalanceCents: dto.openingBalanceCents,
              closingBalanceCents: dto.closingBalanceCents,
              calculatedBalanceCents: calculation.calculatedBalanceCents,
              discrepancyCents,
              status,
              reconciledBy:
                status === ReconciliationStatus.RECONCILED ? userId : null,
              reconciledAt:
                status === ReconciliationStatus.RECONCILED ? new Date() : null,
            },
          });
        }

        // If reconciled, mark all transactions in period as reconciled
        let matchedCount = 0;
        if (status === ReconciliationStatus.RECONCILED) {
          const result = await tx.transaction.updateMany({
            where: {
              tenantId: dto.tenantId,
              bankAccount: dto.bankAccount,
              date: { gte: periodStart, lte: periodEnd },
              isReconciled: false,
              isDeleted: false,
            },
            data: {
              isReconciled: true,
              reconciledAt: new Date(),
            },
          });
          matchedCount = result.count;
        }

        this.logger.log(
          `Reconciliation ${reconciliation.id}: status=${status}, discrepancy=${discrepancyCents}c, matched=${matchedCount}`,
        );

        return {
          id: reconciliation.id,
          status: reconciliation.status,
          openingBalanceCents: reconciliation.openingBalanceCents,
          closingBalanceCents: reconciliation.closingBalanceCents,
          calculatedBalanceCents: calculation.calculatedBalanceCents,
          discrepancyCents,
          matchedCount,
          unmatchedCount: calculation.transactionCount - matchedCount,
        };
      },
    );
  }

  /**
   * Calculate balance from transactions in period
   * Formula: opening + credits - debits = calculated
   *
   * @param tenantId - Tenant ID for isolation
   * @param bankAccount - Bank account identifier
   * @param periodStart - Period start date
   * @param periodEnd - Period end date
   * @param openingBalanceCents - Opening balance in cents
   * @returns BalanceCalculation with totals and transaction count
   */
  async calculateBalance(
    tenantId: string,
    bankAccount: string,
    periodStart: Date,
    periodEnd: Date,
    openingBalanceCents: number,
  ): Promise<BalanceCalculation> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        bankAccount,
        date: { gte: periodStart, lte: periodEnd },
        isDeleted: false,
      },
    });

    let totalCredits = new Decimal(0);
    let totalDebits = new Decimal(0);

    for (const tx of transactions) {
      if (tx.isCredit) {
        totalCredits = totalCredits.plus(tx.amountCents);
      } else {
        totalDebits = totalDebits.plus(tx.amountCents);
      }
    }

    const calculatedBalance = new Decimal(openingBalanceCents)
      .plus(totalCredits)
      .minus(totalDebits);

    return {
      openingBalanceCents,
      totalCreditsCents: totalCredits.toNumber(),
      totalDebitsCents: totalDebits.toNumber(),
      calculatedBalanceCents: calculatedBalance.round().toNumber(),
      transactionCount: transactions.length,
    };
  }

  /**
   * Get all reconciliations for a tenant
   *
   * @param tenantId - Tenant ID for isolation
   * @returns Array of reconciliations
   */
  async getReconciliationsByTenant(
    tenantId: string,
  ): Promise<Reconciliation[]> {
    return await this.reconciliationRepo.findByTenantId(tenantId);
  }

  /**
   * Get unreconciled transactions for a period
   *
   * @param tenantId - Tenant ID for isolation
   * @param bankAccount - Bank account identifier
   * @param periodStart - Period start date
   * @param periodEnd - Period end date
   * @returns Array of unreconciled transactions ordered by date
   */
  async getUnmatched(
    tenantId: string,
    bankAccount: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<Transaction[]> {
    return await this.prisma.transaction.findMany({
      where: {
        tenantId,
        bankAccount,
        date: { gte: periodStart, lte: periodEnd },
        isReconciled: false,
        isDeleted: false,
      },
      orderBy: { date: 'asc' },
    });
  }

  /**
   * Manually match specific transactions to reconciliation
   * Cannot be used on reconciled periods (immutable)
   *
   * @param tenantId - Tenant ID for isolation
   * @param reconId - Reconciliation ID
   * @param transactionIds - Array of transaction IDs to match
   * @returns MatchResult with counts of matched/unmatched
   * @throws NotFoundException if reconciliation not found
   * @throws ConflictException if reconciliation is already RECONCILED
   */
  async matchTransactions(
    tenantId: string,
    reconId: string,
    transactionIds: string[],
  ): Promise<MatchResult> {
    if (transactionIds.length === 0) {
      return { matchedCount: 0, unmatchedCount: 0, matchedTransactionIds: [] };
    }

    const recon = await this.reconciliationRepo.findById(reconId);
    if (!recon) {
      throw new NotFoundException('Reconciliation', reconId);
    }
    if (recon.tenantId !== tenantId) {
      throw new NotFoundException('Reconciliation', reconId);
    }
    if (recon.status === ReconciliationStatus.RECONCILED) {
      throw new ConflictException(
        'Cannot modify transactions in a reconciled period',
        { reconId, status: recon.status },
      );
    }

    // Validate transactions
    const transactions = await this.prisma.transaction.findMany({
      where: {
        id: { in: transactionIds },
        tenantId,
        bankAccount: recon.bankAccount,
        date: { gte: recon.periodStart, lte: recon.periodEnd },
        isDeleted: false,
      },
    });

    if (transactions.length === 0) {
      return {
        matchedCount: 0,
        unmatchedCount: transactionIds.length,
        matchedTransactionIds: [],
      };
    }

    // Mark as reconciled
    const validIds = transactions.map((t) => t.id);
    await this.prisma.transaction.updateMany({
      where: { id: { in: validIds } },
      data: { isReconciled: true, reconciledAt: new Date() },
    });

    return {
      matchedCount: validIds.length,
      unmatchedCount: transactionIds.length - validIds.length,
      matchedTransactionIds: validIds,
    };
  }
}
