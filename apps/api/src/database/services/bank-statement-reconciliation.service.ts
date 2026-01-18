/**
 * Bank Statement Reconciliation Service
 * TASK-RECON-019: Bank Statement to Xero Transaction Reconciliation
 * TASK-RECON-004: Duplicate Detection
 * TASK-RECON-005: Manual Match Override with tracking and undo
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
  DuplicateDetectionResult,
  DuplicateResolutionStatus,
  BankMatchType,
  ManualMatchHistory,
} from '../entities/bank-statement-match.entity';
import { ReconciliationStatus } from '@prisma/client';
import { BusinessException, NotFoundException } from '../../shared/exceptions';
import { ToleranceConfigService } from './tolerance-config.service';
import { AccruedBankChargeService } from './accrued-bank-charge.service';
import { BankFeeService } from './bank-fee.service';

/**
 * TASK-RECON-005: Result of a manual match operation
 */
export interface ManualMatchResult {
  id: string;
  status: BankStatementMatchStatus;
  matchConfidence: number | null;
  matchType: BankMatchType;
  previousTransactionId: string | null;
}

/**
 * TASK-RECON-005: Options for manual match operation
 */
export interface ManualMatchOptions {
  /** User ID performing the match */
  userId: string;
  /** Optional reason for the manual match */
  reason?: string;
}

/**
 * TASK-RECON-004: Import result with duplicate information
 */
export interface ImportWithDuplicateCheckResult {
  /** Number of entries imported */
  imported: number;
  /** Number of entries skipped as duplicates */
  skippedDuplicates: number;
  /** Detected duplicates requiring user decision */
  pendingDuplicates: DuplicateDetectionResult[];
  /** Entries that were imported */
  importedEntries: Array<{
    id: string;
    bankDescription: string;
    bankAmountCents: number;
  }>;
}

// Configure Decimal.js for banker's rounding
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

@Injectable()
export class BankStatementReconciliationService {
  private readonly logger = new Logger(BankStatementReconciliationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llmParser: LLMWhispererParser,
    private readonly matchRepo: BankStatementMatchRepository,
    private readonly reconRepo: ReconciliationRepository,
    private readonly toleranceConfig: ToleranceConfigService,
    private readonly accruedChargeService: AccruedBankChargeService,
    private readonly bankFeeService: BankFeeService,
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

    // TASK-RECON-003: Use centralized tolerance configuration
    const status =
      allMatched &&
      this.toleranceConfig.isBalanceWithinTolerance(balanceDiscrepancy)
        ? 'RECONCILED'
        : 'DISCREPANCY';

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
      // TASK-RECON-003: Use centralized tolerance for description matching
      if (
        bestMatch &&
        this.toleranceConfig.isDescriptionMatch(bestMatch.confidence)
      ) {
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
   * TASK-RECON-002: Uses configurable amount tolerance for matching
   * TASK-RECON-003: Now uses centralized ToleranceConfigService
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
    // TASK-RECON-003: Use centralized tolerance configuration
    const amountDiff = Math.abs(bankTx.amountCents - xeroTx.amountCents);
    const maxAmount = Math.max(bankTx.amountCents, xeroTx.amountCents);
    const effectiveTolerance =
      this.toleranceConfig.getEffectiveTolerance(maxAmount);

    const amountMatches =
      this.toleranceConfig.isWithinTolerance(amountDiff, maxAmount) &&
      bankTx.isCredit === xeroTx.isCredit;
    const exactAmountMatch =
      bankTx.amountCents === xeroTx.amountCents &&
      bankTx.isCredit === xeroTx.isCredit;

    // Check date match (within tolerance)
    const daysDiff = Math.abs(
      (bankTx.date.getTime() - xeroTx.date.getTime()) / (1000 * 60 * 60 * 24),
    );
    const dateMatches = this.toleranceConfig.isDateWithinTolerance(daysDiff);

    // Calculate description similarity
    const descSimilarity = this.calculateSimilarity(
      bankTx.description.toLowerCase(),
      xeroTx.description.toLowerCase(),
    );

    // Get description similarity threshold from config
    const descriptionThreshold =
      this.toleranceConfig.descriptionSimilarityThreshold;

    // Determine status and confidence
    if (
      exactAmountMatch &&
      dateMatches &&
      descSimilarity >= descriptionThreshold
    ) {
      // Exact match - highest confidence
      return {
        confidence: descSimilarity,
        status: BankStatementMatchStatus.MATCHED,
        reason: null,
      };
    }

    if (
      amountMatches &&
      !exactAmountMatch &&
      dateMatches &&
      descSimilarity >= descriptionThreshold
    ) {
      // Match within tolerance - still considered matched but with note
      return {
        confidence: descSimilarity * 0.95,
        status: BankStatementMatchStatus.MATCHED,
        reason: `Amount within tolerance: bank ${bankTx.amountCents}c vs Xero ${xeroTx.amountCents}c (diff: ${amountDiff}c)`,
      };
    }

    if (
      !amountMatches &&
      dateMatches &&
      descSimilarity >= descriptionThreshold
    ) {
      // Amount difference exceeds tolerance - check if this could be a fee-adjusted match
      // Fee-adjusted match: Bank shows NET, Xero shows GROSS (Bank + Fee = Xero)
      const feeDifference = xeroTx.amountCents - bankTx.amountCents;

      // If Xero amount is higher and the difference is in typical fee range (R1 - R50)
      if (
        feeDifference > 0 &&
        feeDifference >= 100 &&
        feeDifference <= 5000 &&
        bankTx.isCredit === xeroTx.isCredit
      ) {
        // This could be a fee-adjusted match - flag it as such
        return {
          confidence: descSimilarity * 0.9,
          status: BankStatementMatchStatus.FEE_ADJUSTED_MATCH,
          reason: `Possible fee-adjusted match: bank ${bankTx.amountCents}c (NET) + fee ${feeDifference}c = Xero ${xeroTx.amountCents}c (GROSS)`,
        };
      }

      // Regular amount mismatch
      return {
        confidence: descSimilarity * 0.8,
        status: BankStatementMatchStatus.AMOUNT_MISMATCH,
        reason: `Amount differs: bank ${bankTx.amountCents}c vs Xero ${xeroTx.amountCents}c (exceeds tolerance of ${effectiveTolerance.toFixed(0)}c)`,
      };
    }

    if (
      amountMatches &&
      !dateMatches &&
      descSimilarity >= descriptionThreshold
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
      status: m.status,
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
    const match = await this.matchRepo.findById(matchId, tenantId);
    if (!match) {
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
      status: updatedMatch.status,
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
    const match = await this.matchRepo.findById(matchId, tenantId);
    if (!match) {
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
      this.logger.log(
        `Reset is_reconciled for transaction ${previousTransactionId}`,
      );
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
      matches.map((m) => ({ status: m.status })),
    );

    // Check if all transactions are matched
    const allMatched =
      matchSummary.inBankOnly === 0 &&
      matchSummary.inXeroOnly === 0 &&
      matchSummary.amountMismatch === 0;

    // TASK-RECON-003: Use centralized tolerance for balance validation
    const balanceOk = this.toleranceConfig.isBalanceWithinTolerance(
      reconciliation.discrepancyCents,
    );

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

  // =====================================================
  // TASK-RECON-004: Duplicate Detection Methods
  // =====================================================

  /**
   * Detect duplicate bank statement entries on import
   * Uses composite key: date + amount + reference (description)
   * @param tenantId - Tenant ID for isolation
   * @param entries - Bank statement entries to check
   * @returns Array of detected duplicates with confidence scores
   */
  async detectDuplicates(
    tenantId: string,
    entries: ParsedBankTransaction[],
  ): Promise<DuplicateDetectionResult[]> {
    this.logger.log(
      `Detecting duplicates for ${entries.length} entries in tenant ${tenantId}`,
    );

    const duplicates: DuplicateDetectionResult[] = [];

    for (const entry of entries) {
      const compositeKey = this.generateCompositeKey(entry);

      // Look for existing entries with matching composite key
      const existing = await this.prisma.bankStatementMatch.findFirst({
        where: {
          tenantId,
          bankDate: entry.date,
          bankAmountCents: entry.amountCents,
          bankIsCredit: entry.isCredit,
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existing) {
        const confidence = this.calculateDuplicateConfidence(entry, {
          bankDate: existing.bankDate,
          bankDescription: existing.bankDescription,
          bankAmountCents: existing.bankAmountCents,
          bankIsCredit: existing.bankIsCredit,
        });

        // Only report as duplicate if confidence is high enough
        if (confidence >= 0.8) {
          duplicates.push({
            newEntry: entry,
            existingEntry: {
              id: existing.id,
              bankDate: existing.bankDate,
              bankDescription: existing.bankDescription,
              bankAmountCents: existing.bankAmountCents,
              bankIsCredit: existing.bankIsCredit,
              reconciliationId: existing.reconciliationId,
            },
            confidence,
            compositeKey,
          });
        }
      }
    }

    this.logger.log(`Found ${duplicates.length} potential duplicates`);
    return duplicates;
  }

  /**
   * Generate a composite key for duplicate detection
   * Format: YYYY-MM-DD|amountCents|description_normalized
   */
  private generateCompositeKey(entry: ParsedBankTransaction): string {
    const dateStr = entry.date.toISOString().split('T')[0];
    const normalizedDesc = this.normalizeDescription(entry.description);
    return `${dateStr}|${entry.amountCents}|${normalizedDesc}`;
  }

  /**
   * Normalize description for comparison
   * - Lowercase
   * - Remove extra whitespace
   * - Remove common variable parts (dates, reference numbers)
   */
  private normalizeDescription(description: string): string {
    return description
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/\d{4}[-/]\d{2}[-/]\d{2}/g, '') // Remove dates
      .replace(/ref[:\s]*\w+/gi, '') // Remove reference numbers
      .trim()
      .substring(0, 50); // Truncate for comparison
  }

  /**
   * Calculate confidence that two entries are duplicates
   * @returns Confidence score between 0 and 1
   */
  private calculateDuplicateConfidence(
    newEntry: ParsedBankTransaction,
    existingEntry: {
      bankDate: Date;
      bankDescription: string;
      bankAmountCents: number;
      bankIsCredit: boolean;
    },
  ): number {
    let score = 0;

    // Exact date match: +0.3
    if (newEntry.date.getTime() === existingEntry.bankDate.getTime()) {
      score += 0.3;
    }

    // Exact amount match: +0.4
    if (
      newEntry.amountCents === existingEntry.bankAmountCents &&
      newEntry.isCredit === existingEntry.bankIsCredit
    ) {
      score += 0.4;
    }

    // Description similarity: +0.3 * similarity
    const descSimilarity = this.calculateSimilarity(
      this.normalizeDescription(newEntry.description),
      this.normalizeDescription(existingEntry.bankDescription),
    );
    score += 0.3 * descSimilarity;

    return Math.min(score, 1);
  }

  /**
   * Mark a detected duplicate as a false positive
   * This allows the entry to be imported despite the duplicate detection
   * @param tenantId - Tenant ID for isolation
   * @param compositeKey - The composite key of the duplicate
   * @param userId - User making the decision
   * @param notes - Optional notes about why this is a false positive
   */
  async markDuplicateAsFalsePositive(
    tenantId: string,
    compositeKey: string,
    userId: string,
    notes?: string,
  ): Promise<void> {
    this.logger.log(
      `Marking duplicate as false positive: ${compositeKey} by user ${userId}`,
    );

    // Store the false positive resolution for future imports
    await this.prisma.duplicateResolution.upsert({
      where: {
        tenantId_compositeKey: { tenantId, compositeKey },
      },
      update: {
        status: DuplicateResolutionStatus.FALSE_POSITIVE,
        resolvedBy: userId,
        resolvedAt: new Date(),
        notes,
        updatedAt: new Date(),
      },
      create: {
        tenantId,
        compositeKey,
        status: DuplicateResolutionStatus.FALSE_POSITIVE,
        resolvedBy: userId,
        resolvedAt: new Date(),
        notes,
      },
    });
  }

  /**
   * Confirm a detected entry as a duplicate (skip import)
   * @param tenantId - Tenant ID for isolation
   * @param compositeKey - The composite key of the duplicate
   * @param userId - User making the decision
   * @param notes - Optional notes about the confirmation
   */
  async confirmDuplicate(
    tenantId: string,
    compositeKey: string,
    userId: string,
    notes?: string,
  ): Promise<void> {
    this.logger.log(`Confirming duplicate: ${compositeKey} by user ${userId}`);

    await this.prisma.duplicateResolution.upsert({
      where: {
        tenantId_compositeKey: { tenantId, compositeKey },
      },
      update: {
        status: DuplicateResolutionStatus.CONFIRMED_DUPLICATE,
        resolvedBy: userId,
        resolvedAt: new Date(),
        notes,
        updatedAt: new Date(),
      },
      create: {
        tenantId,
        compositeKey,
        status: DuplicateResolutionStatus.CONFIRMED_DUPLICATE,
        resolvedBy: userId,
        resolvedAt: new Date(),
        notes,
      },
    });
  }

  /**
   * Check if a duplicate resolution exists for a composite key
   */
  async getDuplicateResolution(
    tenantId: string,
    compositeKey: string,
  ): Promise<{
    status: DuplicateResolutionStatus;
    resolvedBy: string | null;
    resolvedAt: Date | null;
  } | null> {
    const resolution = await this.prisma.duplicateResolution.findUnique({
      where: {
        tenantId_compositeKey: { tenantId, compositeKey },
      },
    });

    if (!resolution) return null;

    return {
      status: resolution.status as DuplicateResolutionStatus,
      resolvedBy: resolution.resolvedBy,
      resolvedAt: resolution.resolvedAt,
    };
  }

  /**
   * Get duplicate resolution history for a tenant
   */
  async getDuplicateResolutionHistory(
    tenantId: string,
    options?: {
      limit?: number;
      offset?: number;
      status?: DuplicateResolutionStatus;
    },
  ): Promise<
    Array<{
      compositeKey: string;
      status: DuplicateResolutionStatus;
      resolvedBy: string | null;
      resolvedAt: Date | null;
      notes: string | null;
    }>
  > {
    const where: Record<string, unknown> = { tenantId };
    if (options?.status) {
      where.status = options.status;
    }

    const resolutions = await this.prisma.duplicateResolution.findMany({
      where,
      orderBy: { resolvedAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });

    return resolutions.map((r) => ({
      compositeKey: r.compositeKey,
      status: r.status as DuplicateResolutionStatus,
      resolvedBy: r.resolvedBy,
      resolvedAt: r.resolvedAt,
      notes: r.notes,
    }));
  }

  // =====================================================
  // TASK-RECON-005: Enhanced Manual Match with Tracking
  // =====================================================

  /**
   * Manually match a bank statement record with a transaction (with tracking)
   * Records the match history for audit and undo functionality
   * @throws BusinessException if match or transaction not found
   * @throws BusinessException if amounts are incompatible
   */
  async manualMatchWithTracking(
    tenantId: string,
    matchId: string,
    transactionId: string,
    options: ManualMatchOptions,
  ): Promise<ManualMatchResult> {
    this.logger.log(
      `Manual match with tracking: matchId=${matchId}, transactionId=${transactionId}, userId=${options.userId}`,
    );

    // Get the match record
    const match = await this.matchRepo.findById(matchId, tenantId);
    if (!match) {
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

    // Validate amount compatibility
    const amountDiff = Math.abs(
      match.bankAmountCents - transaction.amountCents,
    );
    const maxAmount = Math.max(match.bankAmountCents, transaction.amountCents);
    const tolerancePercent = 10; // 10% tolerance for manual matches

    if (amountDiff > maxAmount * (tolerancePercent / 100)) {
      throw new BusinessException(
        `Amount difference (${amountDiff} cents) exceeds ${tolerancePercent}% tolerance. ` +
          `Bank: ${match.bankAmountCents} cents, Transaction: ${transaction.amountCents} cents`,
        'AMOUNT_INCOMPATIBLE',
        {
          bankAmountCents: match.bankAmountCents,
          transactionAmountCents: transaction.amountCents,
          differencePercent: ((amountDiff / maxAmount) * 100).toFixed(2),
        },
      );
    }

    // Store previous transaction ID for history
    const previousTransactionId = match.transactionId;

    // Record the match history
    await this.recordManualMatchHistory(
      tenantId,
      matchId,
      previousTransactionId,
      transactionId,
      options.userId,
      'MATCH',
      options.reason,
    );

    // Update the match
    const updatedMatch = await this.matchRepo.update(matchId, {
      transactionId,
      xeroDate: transaction.date,
      xeroDescription: transaction.description,
      xeroAmountCents: transaction.amountCents,
      xeroIsCredit: transaction.isCredit,
      status: BankStatementMatchStatus.MATCHED,
      matchConfidence: 1.0, // Manual match = 100% confidence
      discrepancyReason: options.reason
        ? `Manual match: ${options.reason}`
        : 'Manual match',
    });

    this.logger.log(
      `Manual match with tracking successful: ${matchId} -> ${transactionId} by ${options.userId}`,
    );

    // Re-evaluate reconciliation status
    await this.updateReconciliationStatusAfterMatch(
      tenantId,
      match.reconciliationId,
    );

    return {
      id: updatedMatch.id,
      status: updatedMatch.status,
      matchConfidence: 1.0,
      matchType: BankMatchType.MANUAL,
      previousTransactionId,
    };
  }

  /**
   * Unmatch with tracking - records history for undo
   * @throws BusinessException if match not found
   */
  async unmatchWithTracking(
    tenantId: string,
    matchId: string,
    options: ManualMatchOptions,
  ): Promise<{
    id: string;
    status: BankStatementMatchStatus;
    previousTransactionId: string | null;
  }> {
    this.logger.log(
      `Unmatch with tracking: matchId=${matchId}, userId=${options.userId}`,
    );

    // Get the match record
    const match = await this.matchRepo.findById(matchId, tenantId);
    if (!match) {
      throw new BusinessException(
        'Bank statement match not found',
        'MATCH_NOT_FOUND',
        { matchId },
      );
    }

    // Store the transaction ID before clearing
    const previousTransactionId = match.transactionId;

    if (!previousTransactionId) {
      throw new BusinessException(
        'Match is not currently matched to a transaction',
        'NOT_MATCHED',
        { matchId },
      );
    }

    // Record the unmatch history
    await this.recordManualMatchHistory(
      tenantId,
      matchId,
      previousTransactionId,
      null,
      options.userId,
      'UNMATCH',
      options.reason,
    );

    // Determine new status
    let newStatus: BankStatementMatchStatus;
    if (match.bankAmountCents > 0 && match.bankDescription) {
      newStatus = BankStatementMatchStatus.IN_BANK_ONLY;
    } else if (match.xeroAmountCents && match.xeroDescription) {
      newStatus = BankStatementMatchStatus.IN_XERO_ONLY;
    } else {
      newStatus = BankStatementMatchStatus.IN_BANK_ONLY;
    }

    // Update the match
    const updatedMatch = await this.matchRepo.update(matchId, {
      transactionId: null,
      xeroDate: null,
      xeroDescription: null,
      xeroAmountCents: null,
      xeroIsCredit: null,
      status: newStatus,
      matchConfidence: null,
      discrepancyReason: options.reason
        ? `Manually unmatched: ${options.reason}`
        : 'Manually unmatched',
    });

    // Reset the transaction's is_reconciled flag
    await this.prisma.transaction.update({
      where: { id: previousTransactionId },
      data: { isReconciled: false, updatedAt: new Date() },
    });

    this.logger.log(
      `Unmatch with tracking successful: ${matchId} by ${options.userId}`,
    );

    // Re-evaluate reconciliation status
    await this.updateReconciliationStatusAfterMatch(
      tenantId,
      match.reconciliationId,
    );

    return {
      id: updatedMatch.id,
      status: newStatus,
      previousTransactionId,
    };
  }

  /**
   * Undo the last manual match/unmatch operation for a specific match
   * @throws BusinessException if no history found or undo not possible
   */
  async undoLastManualMatch(
    tenantId: string,
    matchId: string,
    userId: string,
  ): Promise<ManualMatchResult> {
    this.logger.log(
      `Undo last manual match: matchId=${matchId}, userId=${userId}`,
    );

    // Get the most recent history entry for this match
    const lastHistory = await this.prisma.manualMatchHistory.findFirst({
      where: { tenantId, matchId },
      orderBy: { performedAt: 'desc' },
    });

    if (!lastHistory) {
      throw new BusinessException(
        'No manual match history found for this match',
        'NO_HISTORY',
        { matchId },
      );
    }

    // Get the current match state
    const match = await this.matchRepo.findById(matchId, tenantId);
    if (!match) {
      throw new BusinessException(
        'Bank statement match not found',
        'MATCH_NOT_FOUND',
        { matchId },
      );
    }

    // Determine what to restore based on last action
    if (lastHistory.action === 'MATCH') {
      // Last action was a match, so undo by unmatching
      // Restore to previous state (which could be unmatched or a different transaction)
      if (lastHistory.previousTransactionId) {
        // Restore previous match
        return this.manualMatchWithTracking(
          tenantId,
          matchId,
          lastHistory.previousTransactionId,
          { userId, reason: `Undo: restored previous match` },
        );
      } else {
        // Restore to unmatched state
        const result = await this.unmatchWithTracking(tenantId, matchId, {
          userId,
          reason: `Undo: restored to unmatched state`,
        });
        return {
          id: result.id,
          status: result.status,
          matchConfidence: null,
          matchType: BankMatchType.MANUAL,
          previousTransactionId: result.previousTransactionId,
        };
      }
    } else {
      // Last action was an unmatch, so undo by re-matching
      if (!lastHistory.previousTransactionId) {
        throw new BusinessException(
          'Cannot undo: no previous transaction to restore',
          'CANNOT_UNDO',
          { matchId },
        );
      }
      return this.manualMatchWithTracking(
        tenantId,
        matchId,
        lastHistory.previousTransactionId,
        { userId, reason: `Undo: restored match after unmatch` },
      );
    }
  }

  /**
   * Get manual match history for a specific match
   */
  async getManualMatchHistory(
    tenantId: string,
    matchId: string,
  ): Promise<ManualMatchHistory[]> {
    const history = await this.prisma.manualMatchHistory.findMany({
      where: { tenantId, matchId },
      orderBy: { performedAt: 'desc' },
    });

    return history.map((h) => ({
      id: h.id,
      tenantId: h.tenantId,
      matchId: h.matchId,
      previousTransactionId: h.previousTransactionId,
      newTransactionId: h.newTransactionId,
      performedBy: h.performedBy,
      performedAt: h.performedAt,
      action: h.action as 'MATCH' | 'UNMATCH',
      reason: h.reason,
    }));
  }

  /**
   * Get all manual match history for a reconciliation
   */
  async getReconciliationManualMatchHistory(
    tenantId: string,
    reconciliationId: string,
  ): Promise<ManualMatchHistory[]> {
    // First get all match IDs for this reconciliation
    const matches = await this.matchRepo.findByReconciliationId(
      tenantId,
      reconciliationId,
    );
    const matchIds = matches.map((m) => m.id);

    if (matchIds.length === 0) {
      return [];
    }

    const history = await this.prisma.manualMatchHistory.findMany({
      where: {
        tenantId,
        matchId: { in: matchIds },
      },
      orderBy: { performedAt: 'desc' },
    });

    return history.map((h) => ({
      id: h.id,
      tenantId: h.tenantId,
      matchId: h.matchId,
      previousTransactionId: h.previousTransactionId,
      newTransactionId: h.newTransactionId,
      performedBy: h.performedBy,
      performedAt: h.performedAt,
      action: h.action as 'MATCH' | 'UNMATCH',
      reason: h.reason,
    }));
  }

  /**
   * Record a manual match operation in history
   */
  private async recordManualMatchHistory(
    tenantId: string,
    matchId: string,
    previousTransactionId: string | null,
    newTransactionId: string | null,
    performedBy: string,
    action: 'MATCH' | 'UNMATCH',
    reason?: string,
  ): Promise<void> {
    await this.prisma.manualMatchHistory.create({
      data: {
        tenantId,
        matchId,
        previousTransactionId,
        newTransactionId,
        performedBy,
        performedAt: new Date(),
        action,
        reason: reason ?? null,
      },
    });

    this.logger.log(
      `Recorded manual match history: ${action} for match ${matchId} by ${performedBy}`,
    );
  }
}
