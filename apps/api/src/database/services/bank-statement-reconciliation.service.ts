/**
 * Bank Statement Reconciliation Service
 * TASK-RECON-019: Bank Statement to Xero Transaction Reconciliation
 *
 * Matches bank statement transactions with Xero/CrecheBooks transactions
 * and performs balance reconciliation.
 */

import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { LLMWhispererParser } from '../parsers/llmwhisperer-parser';
import { BankStatementMatchRepository } from '../repositories/bank-statement-match.repository';
import { ReconciliationRepository } from '../repositories/reconciliation.repository';
import {
  BankStatementMatchStatus,
  ParsedBankTransaction,
  BankStatementReconciliationResult,
} from '../entities/bank-statement-match.entity';
import { ReconciliationStatus } from '@prisma/client';
import { BusinessException, NotFoundException } from '../../shared/exceptions';

// Configure Decimal.js for banker's rounding
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

// Match thresholds
const DATE_TOLERANCE_DAYS = 1;
const DESCRIPTION_MATCH_THRESHOLD = 0.7; // 70% similarity

@Injectable()
export class BankStatementReconciliationService {
  private readonly logger = new Logger(BankStatementReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmParser: LLMWhispererParser,
    private readonly matchRepo: BankStatementMatchRepository,
    private readonly reconRepo: ReconciliationRepository,
  ) {}

  /**
   * Reconcile bank statement PDF with Xero transactions
   * @throws BusinessException if period is already reconciled
   * @throws ValidationException if PDF parsing fails
   */
  async reconcileStatement(
    tenantId: string,
    bankAccount: string,
    pdfBuffer: Buffer,
    userId: string,
  ): Promise<BankStatementReconciliationResult> {
    this.logger.log(
      `Starting bank statement reconciliation for tenant ${tenantId}`,
    );

    // 1. Parse bank statement PDF
    const statement = await this.llmParser.parseWithBalances(pdfBuffer);
    this.logger.log(
      `Parsed statement: ${statement.accountNumber}, ${statement.statementPeriod.start.toISOString()} to ${statement.statementPeriod.end.toISOString()}, ${statement.transactions.length} transactions`,
    );

    // 2. Get Xero transactions for the same period
    const xeroTransactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        bankAccount,
        date: {
          gte: statement.statementPeriod.start,
          lte: statement.statementPeriod.end,
        },
        isDeleted: false,
      },
      orderBy: { date: 'asc' },
    });
    this.logger.log(
      `Found ${xeroTransactions.length} Xero transactions for period`,
    );

    // 3. Create or update reconciliation record
    const reconciliation = await this.prisma.$transaction(async (tx) => {
      // Check for existing reconciliation - use date range to handle off-by-one issues
      // Look for reconciliations within 5 days of the statement period start
      const periodStartDate = statement.statementPeriod.start;
      const searchRangeStart = new Date(periodStartDate);
      searchRangeStart.setDate(searchRangeStart.getDate() - 5);
      const searchRangeEnd = new Date(periodStartDate);
      searchRangeEnd.setDate(searchRangeEnd.getDate() + 5);

      const existingReconciliations = await tx.reconciliation.findMany({
        where: {
          tenantId,
          bankAccount,
          periodStart: {
            gte: searchRangeStart,
            lte: searchRangeEnd,
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });

      const existing = existingReconciliations[0] || null;

      this.logger.log(
        existing
          ? `Found existing reconciliation ${existing.id} with period ${existing.periodStart.toISOString()} - ${existing.periodEnd.toISOString()}`
          : `No existing reconciliation found for period around ${periodStartDate.toISOString()}`,
      );

      if (existing?.status === ReconciliationStatus.RECONCILED) {
        throw new BusinessException(
          'Period already reconciled',
          'PERIOD_ALREADY_RECONCILED',
          { reconciliationId: existing.id },
        );
      }

      // Calculate balance
      const calculatedBalanceCents = this.calculateBalance(
        statement.openingBalanceCents,
        statement.transactions,
      );

      const discrepancyCents =
        statement.closingBalanceCents - calculatedBalanceCents;

      // Create/update reconciliation
      if (existing) {
        return await tx.reconciliation.update({
          where: { id: existing.id },
          data: {
            // Always update period dates from the PDF - source of truth
            periodStart: statement.statementPeriod.start,
            periodEnd: statement.statementPeriod.end,
            openingBalanceCents: statement.openingBalanceCents,
            closingBalanceCents: statement.closingBalanceCents,
            calculatedBalanceCents,
            discrepancyCents,
            status: ReconciliationStatus.IN_PROGRESS,
          },
        });
      } else {
        return await tx.reconciliation.create({
          data: {
            tenantId,
            bankAccount,
            periodStart: statement.statementPeriod.start,
            periodEnd: statement.statementPeriod.end,
            openingBalanceCents: statement.openingBalanceCents,
            closingBalanceCents: statement.closingBalanceCents,
            calculatedBalanceCents,
            discrepancyCents,
            status: ReconciliationStatus.IN_PROGRESS,
          },
        });
      }
    });

    // 4. Clear existing matches for this reconciliation
    await this.matchRepo.deleteByReconciliationId(reconciliation.id);

    // 5. Match transactions
    const matches = await this.matchTransactions(
      tenantId,
      reconciliation.id,
      statement.transactions,
      xeroTransactions,
    );

    // 6. Calculate match summary
    const matchSummary = this.calculateMatchSummary(matches);

    // 7. Determine final status
    const balanceDiscrepancy = Math.abs(
      statement.closingBalanceCents -
        this.calculateBalance(
          statement.openingBalanceCents,
          statement.transactions,
        ),
    );

    const allMatched =
      matchSummary.inBankOnly === 0 &&
      matchSummary.inXeroOnly === 0 &&
      matchSummary.amountMismatch === 0;

    const status =
      allMatched && balanceDiscrepancy <= 100 ? 'RECONCILED' : 'DISCREPANCY';

    // 8. Update reconciliation status
    await this.prisma.reconciliation.update({
      where: { id: reconciliation.id },
      data: {
        status:
          status === 'RECONCILED'
            ? ReconciliationStatus.RECONCILED
            : ReconciliationStatus.DISCREPANCY,
        reconciledBy: status === 'RECONCILED' ? userId : null,
        reconciledAt: status === 'RECONCILED' ? new Date() : null,
      },
    });

    // 9. If reconciled, mark matched transactions
    if (status === 'RECONCILED') {
      const matchedTxIds = matches
        .filter(
          (m) =>
            m.status === BankStatementMatchStatus.MATCHED && m.transactionId,
        )
        .map((m) => m.transactionId!);

      if (matchedTxIds.length > 0) {
        await this.prisma.transaction.updateMany({
          where: { id: { in: matchedTxIds } },
          data: {
            isReconciled: true,
            reconciledAt: new Date(),
          },
        });
      }
    }

    this.logger.log(
      `Reconciliation ${reconciliation.id}: status=${status}, matched=${matchSummary.matched}/${matchSummary.total}`,
    );

    return {
      reconciliationId: reconciliation.id,
      statementPeriod: statement.statementPeriod,
      openingBalanceCents: statement.openingBalanceCents,
      closingBalanceCents: statement.closingBalanceCents,
      calculatedBalanceCents: this.calculateBalance(
        statement.openingBalanceCents,
        statement.transactions,
      ),
      discrepancyCents: balanceDiscrepancy,
      matchSummary,
      status,
    };
  }

  /**
   * Match bank transactions with Xero transactions
   */
  private async matchTransactions(
    tenantId: string,
    reconciliationId: string,
    bankTransactions: ParsedBankTransaction[],
    xeroTransactions: Array<{
      id: string;
      date: Date;
      description: string;
      amountCents: number;
      isCredit: boolean;
    }>,
  ): Promise<
    Array<{
      status: BankStatementMatchStatus;
      transactionId: string | null;
      matchConfidence: number | null;
      discrepancyReason: string | null;
    }>
  > {
    const matches: Array<{
      status: BankStatementMatchStatus;
      transactionId: string | null;
      matchConfidence: number | null;
      discrepancyReason: string | null;
    }> = [];

    const usedXeroIds = new Set<string>();

    // First pass: Match bank transactions to Xero
    for (const bankTx of bankTransactions) {
      let bestMatch: {
        xeroTx: (typeof xeroTransactions)[0];
        confidence: number;
        status: BankStatementMatchStatus;
        reason: string | null;
      } | null = null;

      for (const xeroTx of xeroTransactions) {
        if (usedXeroIds.has(xeroTx.id)) continue;

        const matchResult = this.evaluateMatch(bankTx, xeroTx);
        if (matchResult.confidence > (bestMatch?.confidence ?? 0)) {
          bestMatch = {
            xeroTx,
            confidence: matchResult.confidence,
            status: matchResult.status,
            reason: matchResult.reason,
          };
        }
      }

      // Create match record
      if (bestMatch && bestMatch.confidence >= DESCRIPTION_MATCH_THRESHOLD) {
        usedXeroIds.add(bestMatch.xeroTx.id);

        await this.matchRepo.create({
          tenantId,
          reconciliationId,
          bankDate: bankTx.date,
          bankDescription: bankTx.description,
          bankAmountCents: bankTx.amountCents,
          bankIsCredit: bankTx.isCredit,
          transactionId: bestMatch.xeroTx.id,
          xeroDate: bestMatch.xeroTx.date,
          xeroDescription: bestMatch.xeroTx.description,
          xeroAmountCents: bestMatch.xeroTx.amountCents,
          xeroIsCredit: bestMatch.xeroTx.isCredit,
          status: bestMatch.status,
          matchConfidence: bestMatch.confidence,
          discrepancyReason: bestMatch.reason,
        });

        matches.push({
          status: bestMatch.status,
          transactionId: bestMatch.xeroTx.id,
          matchConfidence: bestMatch.confidence,
          discrepancyReason: bestMatch.reason,
        });
      } else {
        // No match - bank only
        await this.matchRepo.create({
          tenantId,
          reconciliationId,
          bankDate: bankTx.date,
          bankDescription: bankTx.description,
          bankAmountCents: bankTx.amountCents,
          bankIsCredit: bankTx.isCredit,
          transactionId: null,
          xeroDate: null,
          xeroDescription: null,
          xeroAmountCents: null,
          xeroIsCredit: null,
          status: BankStatementMatchStatus.IN_BANK_ONLY,
          matchConfidence: null,
          discrepancyReason: 'No matching Xero transaction found',
        });

        matches.push({
          status: BankStatementMatchStatus.IN_BANK_ONLY,
          transactionId: null,
          matchConfidence: null,
          discrepancyReason: 'No matching Xero transaction found',
        });
      }
    }

    // Second pass: Record unmatched Xero transactions
    for (const xeroTx of xeroTransactions) {
      if (usedXeroIds.has(xeroTx.id)) continue;

      await this.matchRepo.create({
        tenantId,
        reconciliationId,
        bankDate: xeroTx.date, // Use Xero date as reference
        bankDescription: '',
        bankAmountCents: 0,
        bankIsCredit: false,
        transactionId: xeroTx.id,
        xeroDate: xeroTx.date,
        xeroDescription: xeroTx.description,
        xeroAmountCents: xeroTx.amountCents,
        xeroIsCredit: xeroTx.isCredit,
        status: BankStatementMatchStatus.IN_XERO_ONLY,
        matchConfidence: null,
        discrepancyReason: 'Transaction in Xero but not in bank statement',
      });

      matches.push({
        status: BankStatementMatchStatus.IN_XERO_ONLY,
        transactionId: xeroTx.id,
        matchConfidence: null,
        discrepancyReason: 'Transaction in Xero but not in bank statement',
      });
    }

    return matches;
  }

  /**
   * Evaluate match between bank and Xero transaction
   */
  private evaluateMatch(
    bankTx: ParsedBankTransaction,
    xeroTx: {
      date: Date;
      description: string;
      amountCents: number;
      isCredit: boolean;
    },
  ): {
    confidence: number;
    status: BankStatementMatchStatus;
    reason: string | null;
  } {
    // Check amount match
    const amountMatches =
      bankTx.amountCents === xeroTx.amountCents &&
      bankTx.isCredit === xeroTx.isCredit;

    // Check date match (within tolerance)
    const daysDiff = Math.abs(
      (bankTx.date.getTime() - xeroTx.date.getTime()) / (1000 * 60 * 60 * 24),
    );
    const dateMatches = daysDiff <= DATE_TOLERANCE_DAYS;

    // Calculate description similarity
    const descSimilarity = this.calculateSimilarity(
      bankTx.description.toLowerCase(),
      xeroTx.description.toLowerCase(),
    );

    // Determine status and confidence
    if (
      amountMatches &&
      dateMatches &&
      descSimilarity >= DESCRIPTION_MATCH_THRESHOLD
    ) {
      return {
        confidence: descSimilarity,
        status: BankStatementMatchStatus.MATCHED,
        reason: null,
      };
    }

    if (
      !amountMatches &&
      dateMatches &&
      descSimilarity >= DESCRIPTION_MATCH_THRESHOLD
    ) {
      return {
        confidence: descSimilarity * 0.8,
        status: BankStatementMatchStatus.AMOUNT_MISMATCH,
        reason: `Amount differs: bank ${bankTx.amountCents}c vs Xero ${xeroTx.amountCents}c`,
      };
    }

    if (
      amountMatches &&
      !dateMatches &&
      descSimilarity >= DESCRIPTION_MATCH_THRESHOLD
    ) {
      return {
        confidence: descSimilarity * 0.9,
        status: BankStatementMatchStatus.DATE_MISMATCH,
        reason: `Date differs by ${daysDiff.toFixed(0)} days`,
      };
    }

    // No match
    return {
      confidence: descSimilarity * 0.5,
      status: BankStatementMatchStatus.IN_BANK_ONLY,
      reason: null,
    };
  }

  /**
   * Calculate Levenshtein similarity between two strings
   */
  calculateSimilarity(a: string, b: string): number {
    if (a === b) return 1;
    if (a.length === 0 || b.length === 0) return 0;

    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    const maxLen = Math.max(a.length, b.length);
    return 1 - matrix[b.length][a.length] / maxLen;
  }

  /**
   * Calculate balance from opening + transactions
   */
  calculateBalance(
    openingBalanceCents: number,
    transactions: ParsedBankTransaction[],
  ): number {
    let balance = new Decimal(openingBalanceCents);

    for (const tx of transactions) {
      if (tx.isCredit) {
        balance = balance.plus(tx.amountCents);
      } else {
        balance = balance.minus(tx.amountCents);
      }
    }

    return balance.round().toNumber();
  }

  /**
   * Calculate match summary statistics
   */
  private calculateMatchSummary(
    matches: Array<{ status: BankStatementMatchStatus }>,
  ): {
    matched: number;
    inBankOnly: number;
    inXeroOnly: number;
    amountMismatch: number;
    dateMismatch: number;
    total: number;
  } {
    const summary = {
      matched: 0,
      inBankOnly: 0,
      inXeroOnly: 0,
      amountMismatch: 0,
      dateMismatch: 0,
      total: matches.length,
    };

    for (const match of matches) {
      switch (match.status) {
        case BankStatementMatchStatus.MATCHED:
          summary.matched++;
          break;
        case BankStatementMatchStatus.IN_BANK_ONLY:
          summary.inBankOnly++;
          break;
        case BankStatementMatchStatus.IN_XERO_ONLY:
          summary.inXeroOnly++;
          break;
        case BankStatementMatchStatus.AMOUNT_MISMATCH:
          summary.amountMismatch++;
          break;
        case BankStatementMatchStatus.DATE_MISMATCH:
          summary.dateMismatch++;
          break;
      }
    }

    return summary;
  }

  /**
   * Get reconciliation matches by reconciliation ID
   */
  async getMatchesByReconciliationId(
    tenantId: string,
    reconciliationId: string,
  ): Promise<
    Array<{
      id: string;
      bankDate: Date;
      bankDescription: string;
      bankAmountCents: number;
      bankIsCredit: boolean;
      transactionId: string | null;
      xeroDate: Date | null;
      xeroDescription: string | null;
      xeroAmountCents: number | null;
      xeroIsCredit: boolean | null;
      status: BankStatementMatchStatus;
      matchConfidence: number | null;
      discrepancyReason: string | null;
    }>
  > {
    const matches = await this.matchRepo.findByReconciliationId(
      tenantId,
      reconciliationId,
    );
    return matches.map((m) => ({
      id: m.id,
      bankDate: m.bankDate,
      bankDescription: m.bankDescription,
      bankAmountCents: m.bankAmountCents,
      bankIsCredit: m.bankIsCredit,
      transactionId: m.transactionId,
      xeroDate: m.xeroDate,
      xeroDescription: m.xeroDescription,
      xeroAmountCents: m.xeroAmountCents,
      xeroIsCredit: m.xeroIsCredit,
      status: m.status as BankStatementMatchStatus,
      matchConfidence: m.matchConfidence ? Number(m.matchConfidence) : null,
      discrepancyReason: m.discrepancyReason,
    }));
  }

  /**
   * Get unmatched transactions summary
   */
  async getUnmatchedSummary(
    tenantId: string,
    reconciliationId: string,
  ): Promise<{
    inBankOnly: Array<{ date: Date; description: string; amount: number }>;
    inXeroOnly: Array<{
      date: Date;
      description: string;
      amount: number;
      transactionId: string;
    }>;
  }> {
    const matches = await this.matchRepo.findByReconciliationId(
      tenantId,
      reconciliationId,
    );

    const inBankOnly = matches
      .filter((m) => m.status === BankStatementMatchStatus.IN_BANK_ONLY)
      .map((m) => ({
        date: m.bankDate,
        description: m.bankDescription,
        amount: m.bankAmountCents / 100,
      }));

    const inXeroOnly = matches
      .filter(
        (m) =>
          m.status === BankStatementMatchStatus.IN_XERO_ONLY && m.transactionId,
      )
      .map((m) => ({
        date: m.xeroDate!,
        description: m.xeroDescription!,
        amount: m.xeroAmountCents! / 100,
        transactionId: m.transactionId!,
      }));

    return { inBankOnly, inXeroOnly };
  }

  /**
   * Manually match a bank statement record with a transaction
   * @throws NotFoundException if match or transaction not found
   */
  async manualMatch(
    tenantId: string,
    matchId: string,
    transactionId: string,
  ): Promise<{
    id: string;
    status: BankStatementMatchStatus;
    matchConfidence: number | null;
  }> {
    this.logger.log(
      `Manual match: matchId=${matchId}, transactionId=${transactionId}`,
    );

    // Get the match record
    const match = await this.matchRepo.findById(matchId);
    if (!match || match.tenantId !== tenantId) {
      throw new BusinessException(
        'Bank statement match not found',
        'MATCH_NOT_FOUND',
        { matchId },
      );
    }

    // Get the transaction
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction || transaction.tenantId !== tenantId) {
      throw new BusinessException(
        'Transaction not found',
        'TRANSACTION_NOT_FOUND',
        { transactionId },
      );
    }

    // Update the match
    const updatedMatch = await this.matchRepo.update(matchId, {
      transactionId,
      xeroDate: transaction.date,
      xeroDescription: transaction.description,
      xeroAmountCents: transaction.amountCents,
      xeroIsCredit: transaction.isCredit,
      status: BankStatementMatchStatus.MATCHED,
      matchConfidence: 1.0, // Manual match = 100% confidence
      discrepancyReason: null,
    });

    this.logger.log(`Manual match successful: ${matchId} -> ${transactionId}`);

    // Re-evaluate reconciliation status after manual match
    await this.updateReconciliationStatusAfterMatch(
      tenantId,
      match.reconciliationId,
    );

    return {
      id: updatedMatch.id,
      status: updatedMatch.status as BankStatementMatchStatus,
      matchConfidence: 1.0,
    };
  }

  /**
   * Unmatch a previously matched bank statement record
   * @throws NotFoundException if match not found
   */
  async unmatch(
    tenantId: string,
    matchId: string,
  ): Promise<{
    id: string;
    status: BankStatementMatchStatus;
  }> {
    this.logger.log(`Unmatch: matchId=${matchId}`);

    // Get the match record
    const match = await this.matchRepo.findById(matchId);
    if (!match || match.tenantId !== tenantId) {
      throw new BusinessException(
        'Bank statement match not found',
        'MATCH_NOT_FOUND',
        { matchId },
      );
    }

    // Store the transaction ID before clearing it (needed to reset is_reconciled)
    const previousTransactionId = match.transactionId;

    // Determine new status based on what data exists
    let newStatus: BankStatementMatchStatus;
    if (match.bankAmountCents > 0 && match.bankDescription) {
      newStatus = BankStatementMatchStatus.IN_BANK_ONLY;
    } else if (match.xeroAmountCents && match.xeroDescription) {
      newStatus = BankStatementMatchStatus.IN_XERO_ONLY;
    } else {
      newStatus = BankStatementMatchStatus.IN_BANK_ONLY;
    }

    // Update the match to remove the transaction link
    const updatedMatch = await this.matchRepo.update(matchId, {
      transactionId: null,
      xeroDate: null,
      xeroDescription: null,
      xeroAmountCents: null,
      xeroIsCredit: null,
      status: newStatus,
      matchConfidence: null,
      discrepancyReason: 'Manually unmatched',
    });

    // Reset the Xero transaction's is_reconciled flag so it appears in available transactions
    if (previousTransactionId) {
      await this.prisma.transaction.update({
        where: { id: previousTransactionId },
        data: { isReconciled: false, updatedAt: new Date() },
      });
      this.logger.log(`Reset is_reconciled for transaction ${previousTransactionId}`);
    }

    this.logger.log(`Unmatch successful: ${matchId} -> ${newStatus}`);

    // Re-evaluate reconciliation status after unmatch
    await this.updateReconciliationStatusAfterMatch(
      tenantId,
      match.reconciliationId,
    );

    return {
      id: updatedMatch.id,
      status: newStatus,
    };
  }

  /**
   * Re-evaluate and update reconciliation status after match/unmatch operations
   * Status is RECONCILED only if:
   * - All transactions are matched (no IN_BANK_ONLY, IN_XERO_ONLY, or mismatches)
   * - Balance discrepancy is <= R1.00 (100 cents)
   */
  private async updateReconciliationStatusAfterMatch(
    tenantId: string,
    reconciliationId: string,
  ): Promise<void> {
    // Get all matches for this reconciliation
    const matches = await this.matchRepo.findByReconciliationId(
      tenantId,
      reconciliationId,
    );

    // Get the reconciliation record for balance info
    const reconciliation = await this.prisma.reconciliation.findUnique({
      where: { id: reconciliationId },
    });

    if (!reconciliation) {
      this.logger.warn(
        `Cannot update status: reconciliation ${reconciliationId} not found`,
      );
      return;
    }

    // Calculate match summary
    const matchSummary = this.calculateMatchSummary(
      matches.map((m) => ({ status: m.status as BankStatementMatchStatus })),
    );

    // Check if all transactions are matched
    const allMatched =
      matchSummary.inBankOnly === 0 &&
      matchSummary.inXeroOnly === 0 &&
      matchSummary.amountMismatch === 0;

    // Check balance discrepancy (already stored in reconciliation)
    const balanceOk = Math.abs(reconciliation.discrepancyCents) <= 100;

    // Determine new status
    const newStatus =
      allMatched && balanceOk
        ? ReconciliationStatus.RECONCILED
        : ReconciliationStatus.DISCREPANCY;

    // Only update if status changed
    if (reconciliation.status !== newStatus) {
      await this.prisma.reconciliation.update({
        where: { id: reconciliationId },
        data: {
          status: newStatus,
          // Note: reconciledBy left null for auto-reconciliation (no user context)
          // User can see it was system-reconciled via the reconciledAt timestamp
          reconciledAt:
            newStatus === ReconciliationStatus.RECONCILED ? new Date() : null,
        },
      });

      this.logger.log(
        `Reconciliation ${reconciliationId} status updated: ${reconciliation.status} -> ${newStatus}`,
      );

      // If now reconciled, mark matched transactions as reconciled
      if (newStatus === ReconciliationStatus.RECONCILED) {
        const matchedTxIds = matches
          .filter(
            (m) =>
              m.status === BankStatementMatchStatus.MATCHED && m.transactionId,
          )
          .map((m) => m.transactionId!);

        if (matchedTxIds.length > 0) {
          await this.prisma.transaction.updateMany({
            where: { id: { in: matchedTxIds } },
            data: {
              isReconciled: true,
              reconciledAt: new Date(),
            },
          });
          this.logger.log(
            `Marked ${matchedTxIds.length} transactions as reconciled`,
          );
        }
      }
    }
  }

  /**
   * Get available transactions for manual matching
   * Returns transactions that are not already matched in the given reconciliation
   * Automatically filters by the reconciliation period if no date filters provided
   */
  async getAvailableTransactionsForMatching(
    tenantId: string,
    reconciliationId: string,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      searchTerm?: string;
    },
  ): Promise<
    Array<{
      id: string;
      date: Date;
      description: string;
      amountCents: number;
      isCredit: boolean;
    }>
  > {
    // Get reconciliation to use its period dates
    const reconciliation = await this.prisma.reconciliation.findUnique({
      where: { id: reconciliationId },
      select: { periodStart: true, periodEnd: true },
    });

    if (!reconciliation) {
      throw new NotFoundException('Reconciliation', reconciliationId);
    }

    // Get already matched transaction IDs in this reconciliation
    const matches = await this.matchRepo.findByReconciliationId(
      tenantId,
      reconciliationId,
    );
    const matchedTxIds = new Set(
      matches.filter((m) => m.transactionId).map((m) => m.transactionId!),
    );

    // Use reconciliation period dates if no explicit filters provided
    const startDate = filters?.startDate ?? reconciliation.periodStart;
    const endDate = filters?.endDate ?? reconciliation.periodEnd;

    // Build where clause - always filter by reconciliation period
    // Exclude already reconciled transactions to prevent duplicates across periods
    const where: any = {
      tenantId,
      isDeleted: false,
      isReconciled: false, // Exclude already reconciled transactions
      id: { notIn: Array.from(matchedTxIds) },
      date: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (filters?.searchTerm) {
      where.description = {
        contains: filters.searchTerm,
        mode: 'insensitive',
      };
    }

    // Fetch all transactions within the period (no artificial limit)
    // since we're filtering by the reconciliation's date range
    const transactions = await this.prisma.transaction.findMany({
      where,
      orderBy: { date: 'asc' }, // Chronological order for easier matching
    });

    this.logger.log(
      `Found ${transactions.length} available transactions for reconciliation ${reconciliationId} ` +
        `(period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]})`,
    );

    return transactions.map((t) => ({
      id: t.id,
      date: t.date,
      description: t.description,
      amountCents: t.amountCents,
      isCredit: t.isCredit,
    }));
  }
}
