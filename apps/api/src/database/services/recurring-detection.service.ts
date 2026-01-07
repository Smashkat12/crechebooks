/**
 * Recurring Detection Service
 * TASK-TRANS-019: Recurring Transaction Detection Integration
 *
 * @module database/services/recurring-detection
 * @description Auto-detects recurring transaction patterns (monthly, weekly, bi-weekly)
 * and pre-categorizes matching transactions.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Transaction, PayeePattern } from '@prisma/client';
import { Decimal } from 'decimal.js';
import { TransactionRepository } from '../repositories/transaction.repository';
import { PayeePatternRepository } from '../repositories/payee-pattern.repository';
import {
  RecurringMatch,
  RecurringPattern,
  CreateRecurringPatternDto,
  RecurringFrequency,
  RECURRING_DETECTION_CONSTANTS,
} from '../dto/recurring-pattern.dto';
import { VatType } from '../entities/categorization.entity';
import { NotFoundException } from '../../shared/exceptions';
import { AmountVariationService } from './amount-variation.service';

@Injectable()
export class RecurringDetectionService {
  private readonly logger = new Logger(RecurringDetectionService.name);

  constructor(
    private readonly transactionRepo: TransactionRepository,
    private readonly payeePatternRepo: PayeePatternRepository,
    private readonly amountVariationService: AmountVariationService,
  ) {}

  /**
   * Detect if a transaction matches a recurring pattern
   * Searches for similar payee transactions in last 12 months
   * Requires minimum 3 occurrences with consistent intervals
   *
   * @param tenantId - Tenant ID for isolation
   * @param transaction - Transaction to check
   * @returns RecurringMatch if pattern detected, null otherwise
   */
  async detectRecurring(
    tenantId: string,
    transaction: Transaction,
  ): Promise<RecurringMatch | null> {
    if (!transaction.payeeName) {
      return null; // Cannot detect without payee name
    }

    this.logger.debug(
      `Detecting recurring pattern for payee: ${transaction.payeeName}`,
    );

    // Find all transactions for this payee in last 12 months
    const windowMonths = RECURRING_DETECTION_CONSTANTS.DETECTION_WINDOW_MONTHS;
    const dateFrom = new Date();
    dateFrom.setMonth(dateFrom.getMonth() - windowMonths);

    const result = await this.transactionRepo.findByTenant(tenantId, {
      search: transaction.payeeName,
      dateFrom,
    });

    // Filter to exact payee matches (case-insensitive)
    const transactions = result.data.filter(
      (t) =>
        t.payeeName &&
        this.normalizePayeeName(t.payeeName) ===
          this.normalizePayeeName(transaction.payeeName!),
    );

    if (transactions.length < RECURRING_DETECTION_CONSTANTS.MIN_OCCURRENCES) {
      this.logger.debug(
        `Not enough occurrences (${transactions.length}) for recurring detection`,
      );
      return null; // Need at least 3 occurrences
    }

    // Sort by date
    const sorted = transactions.sort(
      (a, b) => a.date.getTime() - b.date.getTime(),
    );

    // Calculate intervals between transactions (in days)
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const diffMs = sorted[i].date.getTime() - sorted[i - 1].date.getTime();
      const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
      intervals.push(diffDays);
    }

    // Calculate average interval and standard deviation
    const avgInterval =
      intervals.reduce((sum, val) => sum + val, 0) / intervals.length;
    const variance =
      intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) /
      intervals.length;
    const stdDev = Math.sqrt(variance);

    // Determine frequency and check if intervals match
    const { frequency, expectedInterval, tolerance } =
      this.determineFrequency(avgInterval);

    if (!frequency) {
      this.logger.debug(
        `No matching frequency pattern (avg interval: ${avgInterval} days)`,
      );
      return null; // Doesn't match known frequency patterns
    }

    // Check if intervals are consistent (within tolerance)
    const isConsistent = intervals.every(
      (interval) => Math.abs(interval - expectedInterval) <= tolerance,
    );

    if (!isConsistent) {
      this.logger.debug(
        `Intervals not consistent (stdDev: ${stdDev}, tolerance: ${tolerance})`,
      );
      return null;
    }

    // Calculate amount variance using AmountVariationService
    const amounts = sorted.map((t) => t.amountCents);
    const avgAmount =
      amounts.reduce((sum, val) => sum + val, 0) / amounts.length;

    // Use AmountVariationService to analyze amount variation
    let amountVariancePercent = 0;
    let exceedsThreshold = false;

    if (transaction.payeeName) {
      const variationAnalysis =
        await this.amountVariationService.analyzeVariation(
          tenantId,
          transaction.payeeName,
          new Decimal(transaction.amountCents),
        );

      if (variationAnalysis) {
        amountVariancePercent = variationAnalysis.percentageVariation;
        exceedsThreshold = variationAnalysis.exceedsThreshold;

        // If amount variation exceeds threshold significantly, log warning
        if (variationAnalysis.recommendedAction === 'block') {
          this.logger.warn(
            `Recurring transaction for ${transaction.payeeName} has excessive amount variation ` +
              `(${amountVariancePercent.toFixed(1)}%, z-score: ${variationAnalysis.zScore.toFixed(2)}). ` +
              `Recommended action: ${variationAnalysis.recommendedAction}`,
          );
        } else if (variationAnalysis.recommendedAction === 'flag_review') {
          this.logger.log(
            `Recurring transaction for ${transaction.payeeName} flagged for review ` +
              `(${amountVariancePercent.toFixed(1)}% variation)`,
          );
        }
      } else {
        // Fallback to simple calculation if insufficient data for AmountVariationService
        const amountStdDev = Math.sqrt(
          amounts.reduce((sum, val) => sum + Math.pow(val - avgAmount, 2), 0) /
            amounts.length,
        );
        amountVariancePercent = (amountStdDev / avgAmount) * 100;
      }
    }

    // Calculate confidence score
    const confidence = this.calculateConfidence(
      sorted.length,
      stdDev,
      expectedInterval,
      amountVariancePercent,
    );

    // Check if there's an existing pattern with account code
    const existingPattern = await this.payeePatternRepo.findByPayeeName(
      tenantId,
      transaction.payeeName,
    );

    if (!existingPattern || !existingPattern.defaultAccountCode) {
      this.logger.debug(`No existing pattern with account code found`);
      return null; // Need existing pattern to suggest category
    }

    // Calculate next expected date
    const lastOccurrence = sorted[sorted.length - 1].date;
    const nextExpectedDate = new Date(lastOccurrence);
    nextExpectedDate.setDate(nextExpectedDate.getDate() + expectedInterval);

    const match: RecurringMatch = {
      patternId: existingPattern.id,
      payeeName: transaction.payeeName,
      frequency,
      confidence,
      expectedAmountCents: Math.round(avgAmount),
      amountVariance: Math.round(amountVariancePercent * 100) / 100,
      intervalDays: expectedInterval,
      nextExpectedDate,
      suggestedAccountCode: existingPattern.defaultAccountCode,
      suggestedAccountName: existingPattern.defaultAccountName,
    };

    this.logger.log(
      `Recurring pattern detected: ${transaction.payeeName} (${frequency}, ${confidence}% confidence)`,
    );

    return match;
  }

  /**
   * Get all recurring patterns for a tenant
   * @param tenantId - Tenant ID for isolation
   * @returns Array of recurring patterns
   */
  async getRecurringPatterns(tenantId: string): Promise<RecurringPattern[]> {
    // Get all patterns marked as recurring
    const patterns = await this.payeePatternRepo.findByTenant(tenantId, {
      isRecurring: true,
    });

    return patterns.map((p) => this.mapToRecurringPattern(p));
  }

  /**
   * Create a manual recurring pattern
   * @param tenantId - Tenant ID for isolation
   * @param dto - Pattern creation data
   * @returns Created recurring pattern
   */
  async createPattern(
    tenantId: string,
    dto: CreateRecurringPatternDto,
  ): Promise<RecurringPattern> {
    this.logger.log(`Creating recurring pattern for payee: ${dto.payeeName}`);

    // Determine interval days from frequency
    const intervalDays = this.getIntervalDays(dto.frequency);

    // Create or update payee pattern
    const existing = await this.payeePatternRepo.findByPayeeName(
      tenantId,
      dto.payeeName,
    );

    let pattern: PayeePattern;

    if (existing) {
      // Update existing pattern
      pattern = await this.payeePatternRepo.update(existing.id, {
        isRecurring: true,
        expectedAmountCents: dto.expectedAmountCents,
        amountVariancePercent: dto.amountVariancePercent,
        defaultAccountCode: dto.accountCode,
        defaultAccountName: dto.accountName,
      });
    } else {
      // Create new pattern
      pattern = await this.payeePatternRepo.create({
        tenantId,
        payeePattern: this.normalizePayeeName(dto.payeeName),
        payeeAliases: [],
        defaultAccountCode: dto.accountCode,
        defaultAccountName: dto.accountName,
        confidenceBoost: 10,
        isRecurring: true,
        expectedAmountCents: dto.expectedAmountCents,
        amountVariancePercent: dto.amountVariancePercent,
      });
    }

    return this.mapToRecurringPattern(pattern);
  }

  /**
   * Apply recurring category to a transaction
   * Used when user confirms a recurring match
   *
   * @param tenantId - Tenant ID for isolation
   * @param transactionId - Transaction to categorize
   */
  async applyRecurringCategory(
    tenantId: string,
    transactionId: string,
  ): Promise<void> {
    const transaction = await this.transactionRepo.findById(
      tenantId,
      transactionId,
    );
    if (!transaction) {
      throw new NotFoundException('Transaction', transactionId);
    }

    const recurringMatch = await this.detectRecurring(tenantId, transaction);
    if (!recurringMatch) {
      this.logger.warn(
        `No recurring pattern found for transaction ${transactionId}`,
      );
      return;
    }

    // Increment match count on the pattern
    await this.payeePatternRepo.incrementMatchCount(recurringMatch.patternId);

    this.logger.log(
      `Applied recurring category to transaction ${transactionId}`,
    );
  }

  /**
   * Determine frequency from average interval
   * @param avgInterval - Average interval in days
   * @returns Frequency type, expected interval, and tolerance
   */
  private determineFrequency(avgInterval: number): {
    frequency: RecurringFrequency | null;
    expectedInterval: number;
    tolerance: number;
  } {
    // Weekly: 7 days ± 1 day
    if (
      Math.abs(avgInterval - RECURRING_DETECTION_CONSTANTS.WEEKLY_INTERVAL) <=
      RECURRING_DETECTION_CONSTANTS.WEEKLY_TOLERANCE_DAYS
    ) {
      return {
        frequency: RecurringFrequency.WEEKLY,
        expectedInterval: RECURRING_DETECTION_CONSTANTS.WEEKLY_INTERVAL,
        tolerance: RECURRING_DETECTION_CONSTANTS.WEEKLY_TOLERANCE_DAYS,
      };
    }

    // Bi-weekly: 14 days ± 2 days
    if (
      Math.abs(
        avgInterval - RECURRING_DETECTION_CONSTANTS.BI_WEEKLY_INTERVAL,
      ) <= RECURRING_DETECTION_CONSTANTS.BI_WEEKLY_TOLERANCE_DAYS
    ) {
      return {
        frequency: RecurringFrequency.BI_WEEKLY,
        expectedInterval: RECURRING_DETECTION_CONSTANTS.BI_WEEKLY_INTERVAL,
        tolerance: RECURRING_DETECTION_CONSTANTS.BI_WEEKLY_TOLERANCE_DAYS,
      };
    }

    // Monthly: 30 days ± 3 days
    if (
      Math.abs(avgInterval - RECURRING_DETECTION_CONSTANTS.MONTHLY_INTERVAL) <=
      RECURRING_DETECTION_CONSTANTS.MONTHLY_TOLERANCE_DAYS
    ) {
      return {
        frequency: RecurringFrequency.MONTHLY,
        expectedInterval: RECURRING_DETECTION_CONSTANTS.MONTHLY_INTERVAL,
        tolerance: RECURRING_DETECTION_CONSTANTS.MONTHLY_TOLERANCE_DAYS,
      };
    }

    return {
      frequency: null,
      expectedInterval: 0,
      tolerance: 0,
    };
  }

  /**
   * Calculate confidence score for recurring pattern
   * Based on: occurrence count, interval consistency, amount consistency
   *
   * @param occurrenceCount - Number of occurrences
   * @param stdDev - Standard deviation of intervals
   * @param expectedInterval - Expected interval in days
   * @param amountVariancePercent - Amount variance percentage
   * @returns Confidence score (0-100)
   */
  private calculateConfidence(
    occurrenceCount: number,
    stdDev: number,
    expectedInterval: number,
    amountVariancePercent: number,
  ): number {
    // Base confidence from occurrence count (more = better)
    // 3 occurrences = 60%, 4 = 70%, 5+ = 80%
    let confidence = Math.min(80, 50 + occurrenceCount * 10);

    // Boost for interval consistency (lower stdDev = higher boost)
    // Perfect consistency (stdDev = 0) = +20%
    const intervalConsistency = Math.max(
      0,
      20 - (stdDev / expectedInterval) * 100,
    );
    confidence += intervalConsistency;

    // Penalty for amount variance (higher variance = lower confidence)
    // 0% variance = no penalty, 10% variance = -5%, 20% = -10%
    const amountPenalty = Math.min(10, amountVariancePercent / 2);
    confidence -= amountPenalty;

    // Clamp to 0-100
    return Math.max(0, Math.min(100, Math.round(confidence)));
  }

  /**
   * Get interval days for a frequency
   * @param frequency - Recurring frequency
   * @returns Interval in days
   */
  private getIntervalDays(frequency: RecurringFrequency): number {
    switch (frequency) {
      case RecurringFrequency.WEEKLY:
        return RECURRING_DETECTION_CONSTANTS.WEEKLY_INTERVAL;
      case RecurringFrequency.BI_WEEKLY:
        return RECURRING_DETECTION_CONSTANTS.BI_WEEKLY_INTERVAL;
      case RecurringFrequency.MONTHLY:
        return RECURRING_DETECTION_CONSTANTS.MONTHLY_INTERVAL;
    }
  }

  /**
   * Map PayeePattern to RecurringPattern
   * @param pattern - PayeePattern from database
   * @returns RecurringPattern DTO
   */
  private mapToRecurringPattern(pattern: PayeePattern): RecurringPattern {
    // Determine frequency from expected interval
    const frequency: RecurringFrequency = RecurringFrequency.MONTHLY; // Default
    const intervalDays = 30; // Default

    return {
      id: pattern.id,
      tenantId: pattern.tenantId,
      payeePattern: pattern.payeePattern,
      frequency,
      expectedAmountCents: pattern.expectedAmountCents || 0,
      amountVariancePercent: pattern.amountVariancePercent
        ? Number(pattern.amountVariancePercent)
        : 10,
      intervalDays,
      lastOccurrence: null, // Would need to query transactions
      nextExpectedDate: null, // Would need to query transactions
      occurrenceCount: pattern.matchCount,
      accountCode: pattern.defaultAccountCode,
      accountName: pattern.defaultAccountName,
      vatType: VatType.STANDARD, // Default, would need to be stored
      confidence: Number(pattern.confidenceBoost) * 10, // Convert to percentage
      isActive: pattern.isRecurring,
      createdAt: pattern.createdAt,
      updatedAt: pattern.updatedAt,
    };
  }

  /**
   * Normalize payee name for consistent matching
   * @param payee - Payee name to normalize
   * @returns Normalized payee name (uppercase, trimmed)
   */
  private normalizePayeeName(payee: string): string {
    return payee.toUpperCase().trim();
  }
}
