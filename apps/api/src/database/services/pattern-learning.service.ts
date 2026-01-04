/**
 * Pattern Learning Service
 * TASK-TRANS-013: Payee Pattern Learning Service
 *
 * @module database/services/pattern-learning
 * @description Learns from user categorization corrections to improve future
 * auto-categorization accuracy. Creates and updates PayeePattern records.
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { PayeePattern, Transaction } from '@prisma/client';
import { TransactionRepository } from '../repositories/transaction.repository';
import { CategorizationRepository } from '../repositories/categorization.repository';
import { PayeePatternRepository } from '../repositories/payee-pattern.repository';
import {
  PatternMatch,
  RecurringInfo,
  PatternStats,
  PATTERN_LEARNING_CONSTANTS,
} from '../dto/pattern-learning.dto';
import { NotFoundException } from '../../shared/exceptions';
import { PayeePatternFilterDto } from '../dto/payee-pattern.dto';
import { PayeeAliasService } from './payee-alias.service';
import { CorrectionConflictService } from './correction-conflict.service';

@Injectable()
export class PatternLearningService {
  private readonly logger = new Logger(PatternLearningService.name);

  constructor(
    private readonly patternRepo: PayeePatternRepository,
    private readonly transactionRepo: TransactionRepository,
    private readonly categorizationRepo: CategorizationRepository,
    @Inject(forwardRef(() => PayeeAliasService))
    private readonly payeeAliasService: PayeeAliasService,
    @Inject(forwardRef(() => CorrectionConflictService))
    private readonly conflictService: CorrectionConflictService,
  ) {}

  /**
   * Learn from user categorization correction
   * Creates new pattern or updates existing one
   * TASK-TRANS-018: Creates alias if payee name variation detected
   * TASK-EC-002: Detects conflicts and throws error with conflict data
   *
   * @param transactionId - Transaction that was corrected
   * @param accountCode - Account code user selected
   * @param accountName - Account name for the code
   * @param tenantId - Tenant ID for isolation
   * @returns Created or updated PayeePattern
   * @throws Error with conflict data if categorization conflicts with existing pattern
   */
  async learnFromCorrection(
    transactionId: string,
    accountCode: string,
    accountName: string,
    tenantId: string,
  ): Promise<PayeePattern> {
    this.logger.log(
      `Learning from correction for transaction ${transactionId}`,
    );

    // 1. Load transaction
    const transaction = await this.transactionRepo.findById(
      tenantId,
      transactionId,
    );
    if (!transaction) {
      throw new NotFoundException('Transaction', transactionId);
    }

    // 2. Extract payee and keywords
    const payeeName = this.extractPayeeName(
      transaction.payeeName || transaction.description,
    );
    const keywords = this.extractKeywords(transaction.description);

    // 2a. TASK-EC-002: Check for conflicting categorization
    const conflict = await this.conflictService.detectConflict(
      tenantId,
      payeeName,
      accountCode,
      accountName,
    );

    if (conflict) {
      // Throw error with conflict data - caller should handle this
      const error = new Error('CATEGORIZATION_CONFLICT');
      (error as any).conflict = conflict;
      throw error;
    }

    // TASK-TRANS-018: Check if this is a similar payee (potential alias)
    const similarPayees = await this.payeeAliasService.findSimilar(
      tenantId,
      payeeName,
    );

    let canonicalName = payeeName;
    if (similarPayees.length > 0) {
      // Use the first similar payee as canonical
      canonicalName = similarPayees[0];

      // Create alias if payee name differs from canonical
      if (
        this.normalizePayeeName(payeeName) !==
        this.normalizePayeeName(canonicalName)
      ) {
        try {
          await this.payeeAliasService.createAlias(
            tenantId,
            payeeName,
            canonicalName,
          );
          this.logger.log(
            `Created alias "${payeeName}" for canonical name "${canonicalName}"`,
          );
        } catch (error) {
          // Log but don't fail - alias might already exist
          this.logger.warn(
            `Could not create alias: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }

    // 3. Check if pattern exists for this payee (using canonical name)
    const existing = await this.patternRepo.findByPayeeName(
      tenantId,
      canonicalName,
    );

    if (existing) {
      // 4a. Update existing pattern
      if (existing.defaultAccountCode !== accountCode) {
        // User changed their mind - reset to new account
        this.logger.log(
          `Updating pattern ${existing.id} with new account code ${accountCode}`,
        );
        return await this.patternRepo.update(existing.id, {
          defaultAccountCode: accountCode,
          defaultAccountName: accountName,
          confidenceBoost: PATTERN_LEARNING_CONSTANTS.BASE_CONFIDENCE_BOOST,
        });
      } else {
        // Same account - increment match count and boost confidence
        const newMatchCount = existing.matchCount + 1;
        const newConfidence = this.calculateConfidenceBoost(newMatchCount);

        this.logger.log(
          `Incrementing pattern ${existing.id} match count to ${newMatchCount}`,
        );
        return await this.patternRepo.update(existing.id, {
          confidenceBoost: newConfidence,
        });
      }
    } else {
      // 4b. Create new pattern
      this.logger.log(
        `Creating new pattern for payee: ${canonicalName} with account ${accountCode}`,
      );
      return await this.patternRepo.create({
        tenantId,
        payeePattern: this.normalizePayeeName(canonicalName),
        payeeAliases: keywords.slice(0, 5), // Store top 5 keywords as aliases
        defaultAccountCode: accountCode,
        defaultAccountName: accountName,
        confidenceBoost: PATTERN_LEARNING_CONSTANTS.BASE_CONFIDENCE_BOOST,
        isRecurring: false,
      });
    }
  }

  /**
   * Update pattern based on match result
   *
   * @param patternId - Pattern ID to update
   * @param matchSuccess - Whether the match was successful
   * @param tenantId - Tenant ID for isolation
   * @returns Updated PayeePattern
   */
  async updatePattern(
    patternId: string,
    matchSuccess: boolean,
    tenantId: string,
  ): Promise<PayeePattern> {
    const pattern = await this.patternRepo.findById(patternId);
    if (!pattern || pattern.tenantId !== tenantId) {
      throw new NotFoundException('PayeePattern', patternId);
    }

    if (matchSuccess) {
      // Increment match count and boost confidence
      const newMatchCount = pattern.matchCount + 1;
      const newConfidence = this.calculateConfidenceBoost(newMatchCount);

      await this.patternRepo.incrementMatchCount(patternId);
      return await this.patternRepo.update(patternId, {
        confidenceBoost: newConfidence,
      });
    } else {
      // Match failed - decrease confidence slightly
      const newConfidence = Math.max(
        PATTERN_LEARNING_CONSTANTS.MIN_CONFIDENCE_BOOST,
        Number(pattern.confidenceBoost) -
          PATTERN_LEARNING_CONSTANTS.CONFIDENCE_PENALTY,
      );

      return await this.patternRepo.update(patternId, {
        confidenceBoost: newConfidence,
      });
    }
  }

  /**
   * Find matching patterns for a transaction
   * Returns ranked list of pattern matches
   *
   * @param transaction - Transaction to match
   * @param tenantId - Tenant ID for isolation
   * @returns Array of PatternMatch sorted by matchScore
   */
  async findMatchingPatterns(
    transaction: Transaction,
    tenantId: string,
  ): Promise<PatternMatch[]> {
    // Get all patterns for tenant
    const emptyFilter: PayeePatternFilterDto = {};
    const allPatterns = await this.patternRepo.findByTenant(
      tenantId,
      emptyFilter,
    );

    const matches: PatternMatch[] = [];

    for (const pattern of allPatterns) {
      let matchScore = 0;
      let matchType: PatternMatch['matchType'] = 'DESCRIPTION';

      // 1. Exact payee name match
      if (transaction.payeeName) {
        const normalizedTxPayee = this.normalizePayeeName(
          transaction.payeeName,
        );
        const normalizedPatternPayee = this.normalizePayeeName(
          pattern.payeePattern,
        );

        if (normalizedTxPayee === normalizedPatternPayee) {
          matchScore = 100;
          matchType = 'EXACT_PAYEE';
        } else if (normalizedTxPayee.includes(normalizedPatternPayee)) {
          matchScore = 80;
          matchType = 'PARTIAL_PAYEE';
        } else if (normalizedPatternPayee.includes(normalizedTxPayee)) {
          matchScore = 75;
          matchType = 'PARTIAL_PAYEE';
        }
      }

      // 2. Check aliases
      if (matchScore === 0 && transaction.payeeName) {
        const normalizedTxPayee = this.normalizePayeeName(
          transaction.payeeName,
        );
        const aliases = pattern.payeeAliases as string[];
        for (const alias of aliases) {
          if (this.normalizePayeeName(alias) === normalizedTxPayee) {
            matchScore = 90;
            matchType = 'EXACT_PAYEE';
            break;
          }
        }
      }

      // 3. Keyword match in description
      if (matchScore === 0) {
        const aliases = pattern.payeeAliases as string[];
        if (aliases.length > 0) {
          const description = transaction.description.toLowerCase();
          const matchedKeywords = aliases.filter((kw) =>
            description.includes(kw.toLowerCase()),
          );

          if (matchedKeywords.length > 0) {
            matchScore = (matchedKeywords.length / aliases.length) * 70;
            matchType = 'KEYWORD';
          }
        }
      }

      // 4. Description similarity (payee pattern in description)
      if (matchScore === 0) {
        const normalizedDesc = transaction.description.toLowerCase();
        if (normalizedDesc.includes(pattern.payeePattern.toLowerCase())) {
          matchScore = 50;
          matchType = 'DESCRIPTION';
        }
      }

      // Add to matches if score > 0
      if (matchScore > 0) {
        matches.push({
          pattern: {
            id: pattern.id,
            tenantId: pattern.tenantId,
            payeePattern: pattern.payeePattern,
            payeeAliases: pattern.payeeAliases as string[],
            defaultAccountCode: pattern.defaultAccountCode,
            defaultAccountName: pattern.defaultAccountName,
            confidenceBoost: Number(pattern.confidenceBoost),
            matchCount: pattern.matchCount,
            isRecurring: pattern.isRecurring,
            expectedAmountCents: pattern.expectedAmountCents,
            amountVariancePercent: pattern.amountVariancePercent
              ? Number(pattern.amountVariancePercent)
              : null,
            createdAt: pattern.createdAt,
            updatedAt: pattern.updatedAt,
          },
          matchScore,
          matchType,
          confidenceBoost: Number(pattern.confidenceBoost),
        });
      }
    }

    // Sort by match score descending
    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  /**
   * Detect if a payee has recurring transactions
   *
   * @param payeeName - Payee name to check
   * @param tenantId - Tenant ID for isolation
   * @returns RecurringInfo or null if not recurring
   */
  async detectRecurring(
    payeeName: string,
    tenantId: string,
  ): Promise<RecurringInfo | null> {
    // Find all transactions for this payee in last 12 months
    const windowMonths = PATTERN_LEARNING_CONSTANTS.RECURRING_WINDOW_MONTHS;
    const dateFrom = new Date();
    dateFrom.setMonth(dateFrom.getMonth() - windowMonths);

    const result = await this.transactionRepo.findByTenant(tenantId, {
      search: payeeName,
      dateFrom,
    });

    const transactions = result.data.filter(
      (t) =>
        t.payeeName &&
        this.normalizePayeeName(t.payeeName) ===
          this.normalizePayeeName(payeeName),
    );

    if (
      transactions.length < PATTERN_LEARNING_CONSTANTS.MIN_RECURRING_OCCURRENCES
    ) {
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

    // Calculate average interval
    const avgInterval =
      intervals.reduce((sum, val) => sum + val, 0) / intervals.length;

    // Calculate standard deviation
    const variance =
      intervals.reduce((sum, val) => sum + Math.pow(val - avgInterval, 2), 0) /
      intervals.length;
    const stdDev = Math.sqrt(variance);

    // Check if regular (low variance)
    const isRecurring =
      stdDev < avgInterval * PATTERN_LEARNING_CONSTANTS.RECURRING_TOLERANCE;

    // Determine frequency
    let frequency: RecurringInfo['frequency'];
    if (avgInterval <= 10) {
      frequency = 'WEEKLY';
    } else if (avgInterval <= 35) {
      frequency = 'MONTHLY';
    } else if (avgInterval <= 100) {
      frequency = 'QUARTERLY';
    } else {
      frequency = 'ANNUAL';
    }

    // Calculate average amount (in cents)
    const avgAmountCents = Math.round(
      transactions.reduce((sum, tx) => sum + tx.amountCents, 0) /
        transactions.length,
    );

    return {
      payeeName,
      frequency,
      averageAmountCents: avgAmountCents,
      lastOccurrence: sorted[sorted.length - 1].date,
      occurrenceCount: transactions.length,
      isRecurring,
      intervalDays: Math.round(avgInterval),
      standardDeviation: Math.round(stdDev * 100) / 100,
    };
  }

  /**
   * Get pattern statistics for a tenant
   *
   * @param tenantId - Tenant ID for isolation
   * @returns PatternStats
   */
  async getPatternStats(tenantId: string): Promise<PatternStats> {
    const emptyFilter: PayeePatternFilterDto = {};
    const patterns = await this.patternRepo.findByTenant(tenantId, emptyFilter);

    const active = patterns.filter((p) => p.matchCount > 0);

    const avgMatchCount =
      patterns.length > 0
        ? patterns.reduce((sum, p) => sum + p.matchCount, 0) / patterns.length
        : 0;

    const topPatterns = patterns
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 10)
      .map((p) => ({
        payeeName: p.payeePattern,
        matchCount: p.matchCount,
        accountCode: p.defaultAccountCode,
        accountName: p.defaultAccountName,
      }));

    return {
      totalPatterns: patterns.length,
      activePatterns: active.length,
      avgMatchCount: Math.round(avgMatchCount * 100) / 100,
      topPatterns,
    };
  }

  /**
   * Extract payee name from description
   * Removes common prefixes and extracts merchant name
   *
   * @param description - Transaction description
   * @returns Extracted payee name
   */
  extractPayeeName(description: string): string {
    // Remove common prefixes
    const cleaned = description
      .replace(
        /^(POS PURCHASE|POS|ATM|EFT|DEBIT ORDER|PAYMENT|DEPOSIT|TRANSFER)\s+/i,
        '',
      )
      .replace(/^\d{2}\/\d{2}\s+/i, '') // Remove date prefixes like "15/01"
      .replace(/^\d+\s+/i, '') // Remove leading numbers
      .trim();

    // Take first significant word(s) (usually merchant name)
    const words = cleaned.split(/\s+/);

    // Filter out common words
    const stopWords = [
      'THE',
      'AND',
      'FOR',
      'FROM',
      'TO',
      'AT',
      'IN',
      'OF',
      'PTY',
      'LTD',
    ];
    const significant = words.filter(
      (w) =>
        w.length >= PATTERN_LEARNING_CONSTANTS.MIN_KEYWORD_LENGTH &&
        !stopWords.includes(w.toUpperCase()),
    );

    // Return first 3 significant words joined
    return significant.slice(0, 3).join(' ') || words[0] || 'UNKNOWN';
  }

  /**
   * Extract keywords from description
   *
   * @param description - Transaction description
   * @returns Array of unique keywords
   */
  extractKeywords(description: string): string[] {
    // Tokenize and filter
    const words = description
      .toUpperCase()
      .replace(/[^\w\s]/g, ' ') // Remove punctuation
      .split(/\s+/)
      .filter((w) => w.length >= PATTERN_LEARNING_CONSTANTS.MIN_KEYWORD_LENGTH);

    // Remove common stop words
    const stopWords = new Set([
      'THE',
      'AND',
      'FOR',
      'FROM',
      'TO',
      'AT',
      'IN',
      'OF',
      'PTY',
      'LTD',
      'PAYMENT',
      'PURCHASE',
      'TRANSFER',
    ]);

    const filtered = words.filter((w) => !stopWords.has(w));

    // Remove duplicates
    return [...new Set(filtered)];
  }

  /**
   * Calculate confidence boost based on match count
   * Base: 10%, increase 1% per match, max 15%
   *
   * @param matchCount - Number of successful matches
   * @returns Confidence boost percentage
   */
  calculateConfidenceBoost(matchCount: number): number {
    return Math.min(
      PATTERN_LEARNING_CONSTANTS.MAX_CONFIDENCE_BOOST,
      PATTERN_LEARNING_CONSTANTS.BASE_CONFIDENCE_BOOST +
        (matchCount - 1) * PATTERN_LEARNING_CONSTANTS.CONFIDENCE_INCREMENT,
    );
  }

  /**
   * Normalize payee name for consistent matching
   *
   * @param payee - Payee name to normalize
   * @returns Normalized payee name (uppercase, trimmed)
   */
  normalizePayeeName(payee: string): string {
    return payee.toUpperCase().trim();
  }
}
