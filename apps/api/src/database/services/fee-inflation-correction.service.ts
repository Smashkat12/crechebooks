/**
 * Fee Inflation Correction Service
 *
 * Orchestrator that wires BankFeeService, AccruedBankChargeService, and AuditLogService
 * to correct FNB bank feed fee inflation in reconciled transactions.
 *
 * Problem: FNB's Xero bank feed reports GROSS amounts (net + per-transaction fee).
 * CrecheBooks stores the gross amount, overstating income/expenses.
 * Monthly fee transactions (#Cash Deposit Fee, #Service Fees) also exist, double-counting.
 *
 * Solution: Detect fee-inflated matches, correct transaction amounts to NET,
 * create AccruedBankCharge records, and match monthly fee aggregates.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BankFeeService, TransactionType } from './bank-fee.service';
import { AccruedBankChargeService } from './accrued-bank-charge.service';
import { AuditLogService } from './audit-log.service';
import { AuditAction } from '../entities/audit-log.entity';
import { BankStatementMatchStatus } from '@prisma/client';

/** Result of fee match detection and validation */
export interface FeeMatchDetectionResult {
  isMatch: boolean;
  confidence: number;
  transactionType: TransactionType;
  feeType: string;
  expectedFeeCents: number;
  actualFeeCents: number;
  explanation: string;
}

/** Result of a single fee correction */
export interface FeeCorrectionResult {
  matchId: string;
  transactionId: string;
  previousAmountCents: number;
  correctedAmountCents: number;
  feeAmountCents: number;
  feeType: string;
  accruedChargeId: string;
}

/** Preview result for dry-run */
export interface FeeCorrectionPreview {
  totalMatches: number;
  correctableMatches: number;
  totalFeesCents: number;
  corrections: Array<{
    matchId: string;
    transactionId: string;
    bankAmountCents: number;
    xeroAmountCents: number;
    feeAmountCents: number;
    feeType: string;
    confidence: number;
    description: string;
  }>;
  skipped: Array<{
    matchId: string;
    reason: string;
    confidence: number;
  }>;
}

/** Result of applying corrections */
export interface FeeCorrectionApplyResult {
  corrected: number;
  skipped: number;
  totalFeesCents: number;
  corrections: FeeCorrectionResult[];
  errors: Array<{ matchId: string; error: string }>;
}

/** Result of monthly fee matching */
export interface MonthlyFeeMatchResult {
  matchedCount: number;
  totalMatchedCents: number;
  matches: Array<{
    feeType: string;
    accruedTotalCents: number;
    chargeTransactionId: string;
    chargeAmountCents: number;
  }>;
  unmatched: Array<{
    feeType: string;
    accruedTotalCents: number;
    reason: string;
  }>;
}

/** Minimum confidence threshold for auto-applying corrections */
const MIN_CORRECTION_CONFIDENCE = 0.85;

/** Fee transaction description patterns for monthly fee matching */
const FEE_DESCRIPTION_PATTERNS = [
  /^#?CASH\s*DEPOSIT\s*FEE/i,
  /^#?SERVICE\s*FEE/i,
  /^#?MONTHLY\s*FEE/i,
  /^#?BANK\s*CHARGE/i,
  /^#?TRANSACTION\s*FEE/i,
  /^#?ADT\s*(CASH\s*)?DEP(OSIT)?\s*FEE/i,
  /^#?CARD\s*FEE/i,
  /^#?EFT\s*FEE/i,
];

/** Tolerance for matching monthly fee aggregates to charge transactions (cents) */
const MONTHLY_FEE_TOLERANCE_CENTS = 100; // R1.00

@Injectable()
export class FeeInflationCorrectionService {
  private readonly logger = new Logger(FeeInflationCorrectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bankFeeService: BankFeeService,
    private readonly accruedChargeService: AccruedBankChargeService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Detect and validate whether a bank/Xero amount difference represents
   * an embedded bank fee.
   */
  async detectAndValidateFeeMatch(
    tenantId: string,
    bankAmountCents: number,
    xeroAmountCents: number,
    description: string,
  ): Promise<FeeMatchDetectionResult> {
    const feeDifference = xeroAmountCents - bankAmountCents;

    if (feeDifference <= 0) {
      return {
        isMatch: false,
        confidence: 0,
        transactionType: TransactionType.UNKNOWN,
        feeType: 'NONE',
        expectedFeeCents: 0,
        actualFeeCents: 0,
        explanation: 'Xero amount is not higher than bank amount',
      };
    }

    // Detect transaction type from description
    const transactionType =
      this.bankFeeService.detectTransactionType(description);

    // Get expected fee for this transaction type
    const calculatedFees = await this.bankFeeService.calculateFees(
      tenantId,
      transactionType,
      bankAmountCents,
    );

    const expectedFeeCents = calculatedFees.reduce(
      (sum, f) => sum + f.feeAmountCents,
      0,
    );

    const feeType =
      calculatedFees.length > 0
        ? calculatedFees[0].feeType
        : 'UNKNOWN_FEE';

    // Calculate confidence based on how closely the difference matches expected fee
    let confidence = 0;
    let explanation = '';

    if (expectedFeeCents > 0) {
      const feeDelta = Math.abs(feeDifference - expectedFeeCents);
      if (feeDelta <= 50) {
        // Within R0.50 tolerance
        confidence = 0.95;
        explanation = `Fee difference (R${(feeDifference / 100).toFixed(2)}) matches expected ${transactionType} fee (R${(expectedFeeCents / 100).toFixed(2)})`;
      } else if (feeDelta <= 200) {
        // Within R2.00
        confidence = 0.85;
        explanation = `Fee difference (R${(feeDifference / 100).toFixed(2)}) is close to expected ${transactionType} fee (R${(expectedFeeCents / 100).toFixed(2)})`;
      } else {
        confidence = 0.6;
        explanation = `Fee difference (R${(feeDifference / 100).toFixed(2)}) does not closely match expected fee (R${(expectedFeeCents / 100).toFixed(2)})`;
      }
    } else if (
      feeDifference > 0 &&
      feeDifference <= xeroAmountCents * 0.1
    ) {
      // No configured fee but difference is within 10% - could still be a fee
      confidence = 0.5;
      explanation = `No configured fee for ${transactionType}, but difference (R${(feeDifference / 100).toFixed(2)}) is within 10% of amount`;
    } else {
      confidence = 0.1;
      explanation = `Fee difference (R${(feeDifference / 100).toFixed(2)}) exceeds typical fee range`;
    }

    return {
      isMatch: confidence >= MIN_CORRECTION_CONFIDENCE,
      confidence,
      transactionType,
      feeType,
      expectedFeeCents,
      actualFeeCents: feeDifference,
      explanation,
    };
  }

  /**
   * Apply a fee correction to a single matched transaction.
   * In a single Prisma $transaction:
   * 1. Update transaction.amountCents → bankAmountCents (NET)
   * 2. Create AccruedBankCharge (preserves xeroAmountCents as gross)
   * 3. Update BankStatementMatch with fee metadata
   * 4. Create audit log
   */
  async applyFeeCorrection(
    tenantId: string,
    matchId: string,
    transactionId: string,
    bankAmountCents: number,
    xeroAmountCents: number,
    feeAmountCents: number,
    feeType: string,
    userId: string,
  ): Promise<FeeCorrectionResult> {
    this.logger.log(
      `Applying fee correction: match=${matchId}, tx=${transactionId}, ` +
        `xero=${xeroAmountCents}c → bank=${bankAmountCents}c (fee=${feeAmountCents}c)`,
    );

    // Get the current transaction for audit before-value
    const currentTransaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!currentTransaction || currentTransaction.tenantId !== tenantId) {
      throw new Error(`Transaction ${transactionId} not found for tenant`);
    }

    // Get the current match for audit
    const currentMatch = await this.prisma.bankStatementMatch.findFirst({
      where: { id: matchId, tenantId },
    });

    if (!currentMatch) {
      throw new Error(`Match ${matchId} not found for tenant`);
    }

    // Execute all updates atomically
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Correct transaction amount to NET (bank) amount
      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          amountCents: bankAmountCents,
          updatedAt: new Date(),
        },
      });

      // 2. Create AccruedBankCharge record
      const accruedCharge = await tx.accruedBankCharge.create({
        data: {
          tenantId,
          sourceTransactionId: transactionId,
          sourceDescription: currentMatch.bankDescription,
          sourceDate: currentMatch.bankDate,
          sourceAmountCents: bankAmountCents,
          accruedAmountCents: feeAmountCents,
          feeType,
          feeDescription: `Fee extracted from Xero gross amount (R${(xeroAmountCents / 100).toFixed(2)} → R${(bankAmountCents / 100).toFixed(2)})`,
          status: 'ACCRUED',
          bankStatementMatchId: matchId,
          xeroTransactionId: currentTransaction.xeroTransactionId ?? null,
          xeroAmountCents,
        },
      });

      // 3. Update BankStatementMatch with fee metadata
      await tx.bankStatementMatch.update({
        where: { id: matchId },
        data: {
          isFeeAdjustedMatch: true,
          accruedFeeAmountCents: feeAmountCents,
          feeType,
          status: BankStatementMatchStatus.FEE_ADJUSTED_MATCH,
        },
      });

      // 4. Audit log
      await this.auditLogService.logAction({
        tenantId,
        userId,
        entityType: 'Transaction',
        entityId: transactionId,
        action: AuditAction.UPDATE,
        beforeValue: {
          amountCents: currentTransaction.amountCents,
          source: 'xero_gross',
        },
        afterValue: {
          amountCents: bankAmountCents,
          source: 'bank_net',
          feeAmountCents,
          feeType,
          accruedChargeId: accruedCharge.id,
          matchId,
        },
        changeSummary: `Fee inflation correction: R${(currentTransaction.amountCents / 100).toFixed(2)} (Xero GROSS) → R${(bankAmountCents / 100).toFixed(2)} (Bank NET). Fee R${(feeAmountCents / 100).toFixed(2)} accrued as ${feeType}`,
      });

      return { accruedChargeId: accruedCharge.id };
    });

    return {
      matchId,
      transactionId,
      previousAmountCents: currentTransaction.amountCents,
      correctedAmountCents: bankAmountCents,
      feeAmountCents,
      feeType,
      accruedChargeId: result.accruedChargeId,
    };
  }

  /**
   * Scan existing matches and correct fee-inflated amounts.
   * Supports dry-run to preview without persisting.
   */
  async correctExistingMatches(
    tenantId: string,
    userId: string,
    options?: { dryRun?: boolean },
  ): Promise<FeeCorrectionPreview | FeeCorrectionApplyResult> {
    const dryRun = options?.dryRun ?? false;
    this.logger.log(
      `Correcting existing matches for tenant ${tenantId} (dryRun=${dryRun})`,
    );

    // Find matches where Xero amount > bank amount and currently matched
    const candidates = await this.prisma.bankStatementMatch.findMany({
      where: {
        tenantId,
        status: {
          in: [
            BankStatementMatchStatus.MATCHED,
            BankStatementMatchStatus.AMOUNT_MISMATCH,
            BankStatementMatchStatus.FEE_ADJUSTED_MATCH,
          ],
        },
        transactionId: { not: null },
        isFeeAdjustedMatch: false, // Not already corrected
      },
    });

    // Filter to those with Xero > Bank
    const feeInflated = candidates.filter(
      (m) =>
        m.xeroAmountCents !== null &&
        m.xeroAmountCents > m.bankAmountCents &&
        m.bankAmountCents > 0,
    );

    if (dryRun) {
      return this.buildPreview(tenantId, feeInflated);
    }

    return this.applyCorrections(tenantId, userId, feeInflated);
  }

  /**
   * Build a dry-run preview of corrections
   */
  private async buildPreview(
    tenantId: string,
    matches: Array<{
      id: string;
      transactionId: string | null;
      bankAmountCents: number;
      xeroAmountCents: number | null;
      bankDescription: string;
    }>,
  ): Promise<FeeCorrectionPreview> {
    const corrections: FeeCorrectionPreview['corrections'] = [];
    const skipped: FeeCorrectionPreview['skipped'] = [];

    for (const match of matches) {
      if (!match.transactionId || !match.xeroAmountCents) {
        skipped.push({
          matchId: match.id,
          reason: 'Missing transaction or Xero amount',
          confidence: 0,
        });
        continue;
      }

      const detection = await this.detectAndValidateFeeMatch(
        tenantId,
        match.bankAmountCents,
        match.xeroAmountCents,
        match.bankDescription,
      );

      if (detection.confidence >= MIN_CORRECTION_CONFIDENCE) {
        corrections.push({
          matchId: match.id,
          transactionId: match.transactionId,
          bankAmountCents: match.bankAmountCents,
          xeroAmountCents: match.xeroAmountCents,
          feeAmountCents: detection.actualFeeCents,
          feeType: detection.feeType,
          confidence: detection.confidence,
          description: detection.explanation,
        });
      } else {
        skipped.push({
          matchId: match.id,
          reason: detection.explanation,
          confidence: detection.confidence,
        });
      }
    }

    return {
      totalMatches: matches.length,
      correctableMatches: corrections.length,
      totalFeesCents: corrections.reduce((s, c) => s + c.feeAmountCents, 0),
      corrections,
      skipped,
    };
  }

  /**
   * Apply corrections to all qualifying matches
   */
  private async applyCorrections(
    tenantId: string,
    userId: string,
    matches: Array<{
      id: string;
      transactionId: string | null;
      bankAmountCents: number;
      xeroAmountCents: number | null;
      bankDescription: string;
    }>,
  ): Promise<FeeCorrectionApplyResult> {
    const corrections: FeeCorrectionResult[] = [];
    const errors: Array<{ matchId: string; error: string }> = [];
    let skipped = 0;

    for (const match of matches) {
      if (!match.transactionId || !match.xeroAmountCents) {
        skipped++;
        continue;
      }

      const detection = await this.detectAndValidateFeeMatch(
        tenantId,
        match.bankAmountCents,
        match.xeroAmountCents,
        match.bankDescription,
      );

      if (detection.confidence < MIN_CORRECTION_CONFIDENCE) {
        skipped++;
        continue;
      }

      try {
        const result = await this.applyFeeCorrection(
          tenantId,
          match.id,
          match.transactionId,
          match.bankAmountCents,
          match.xeroAmountCents,
          detection.actualFeeCents,
          detection.feeType,
          userId,
        );
        corrections.push(result);
      } catch (error) {
        errors.push({
          matchId: match.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.logger.log(
      `Fee corrections applied: ${corrections.length} corrected, ${skipped} skipped, ${errors.length} errors`,
    );

    return {
      corrected: corrections.length,
      skipped,
      totalFeesCents: corrections.reduce((s, c) => s + c.feeAmountCents, 0),
      corrections,
      errors,
    };
  }

  /**
   * Match monthly fee transactions against accrued fee totals.
   *
   * Groups accrued charges by feeType, sums for the period,
   * then finds unmatched fee transactions and matches totals within tolerance.
   */
  async matchMonthlyFeeTransactions(
    tenantId: string,
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<MonthlyFeeMatchResult> {
    this.logger.log(
      `Matching monthly fee transactions for tenant ${tenantId}: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`,
    );

    // 1. Get accrued charges for the period, grouped by feeType
    const accruedCharges = await this.prisma.accruedBankCharge.findMany({
      where: {
        tenantId,
        status: 'ACCRUED',
        sourceDate: { gte: startDate, lte: endDate },
      },
    });

    // Group by feeType and sum
    const accruedByType = new Map<string, { total: number; ids: string[] }>();
    for (const charge of accruedCharges) {
      const existing = accruedByType.get(charge.feeType) ?? {
        total: 0,
        ids: [],
      };
      existing.total += charge.accruedAmountCents;
      existing.ids.push(charge.id);
      accruedByType.set(charge.feeType, existing);
    }

    if (accruedByType.size === 0) {
      return {
        matchedCount: 0,
        totalMatchedCents: 0,
        matches: [],
        unmatched: [],
      };
    }

    // 2. Find unmatched fee transactions in the period
    const feeTransactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        isCredit: false,
        isDeleted: false,
        date: { gte: startDate, lte: endDate },
        // Not already matched to an accrued charge
        accruedChargesAsCharge: { none: {} },
      },
    });

    // Filter to fee-like descriptions
    const feeOnlyTransactions = feeTransactions.filter((tx) =>
      FEE_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(tx.description)),
    );

    // 3. Match accrued totals to fee transactions
    const matches: MonthlyFeeMatchResult['matches'] = [];
    const unmatched: MonthlyFeeMatchResult['unmatched'] = [];
    const usedTransactions = new Set<string>();

    for (const [feeType, accrued] of accruedByType) {
      let matched = false;

      for (const tx of feeOnlyTransactions) {
        if (usedTransactions.has(tx.id)) continue;

        const diff = Math.abs(tx.amountCents - accrued.total);
        if (diff <= MONTHLY_FEE_TOLERANCE_CENTS) {
          // Match found - update all accrued charges in this group
          for (const chargeId of accrued.ids) {
            await this.prisma.accruedBankCharge.update({
              where: { id: chargeId },
              data: {
                chargeTransactionId: tx.id,
                chargeDate: tx.date,
                status: 'MATCHED',
                matchedAt: new Date(),
                matchedBy: userId,
              },
            });
          }

          matches.push({
            feeType,
            accruedTotalCents: accrued.total,
            chargeTransactionId: tx.id,
            chargeAmountCents: tx.amountCents,
          });

          usedTransactions.add(tx.id);
          matched = true;
          break;
        }
      }

      if (!matched) {
        unmatched.push({
          feeType,
          accruedTotalCents: accrued.total,
          reason: `No matching fee transaction found (expected ~R${(accrued.total / 100).toFixed(2)})`,
        });
      }
    }

    this.logger.log(
      `Monthly fee matching: ${matches.length} matched, ${unmatched.length} unmatched`,
    );

    return {
      matchedCount: matches.length,
      totalMatchedCents: matches.reduce((s, m) => s + m.accruedTotalCents, 0),
      matches,
      unmatched,
    };
  }
}
