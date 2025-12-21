/**
 * Transaction Categorizer Agent
 * TASK-AGENT-002: Transaction Categorizer Agent
 *
 * @module agents/transaction-categorizer/categorizer.agent
 * @description Main agent that categorizes bank transactions using pattern matching
 * and historical analysis. Wraps the existing CategorizationService with Claude Code
 * agent capabilities.
 *
 * CRITICAL RULES:
 * - ALL monetary values are CENTS (integers)
 * - 80% confidence threshold for auto-apply (L3 autonomy)
 * - No backwards compatibility - fail fast
 * - Tenant isolation on ALL queries
 */

import { Injectable, Logger } from '@nestjs/common';
import { Transaction } from '@prisma/client';
import { VatType } from '../../database/entities/categorization.entity';
import { ContextLoader } from './context-loader';
import { PatternMatcher } from './pattern-matcher';
import { ConfidenceScorer } from './confidence-scorer';
import { DecisionLogger } from './decision-logger';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  CategorizationResult,
  ConfidenceInput,
} from './interfaces/categorizer.interface';

@Injectable()
export class TransactionCategorizerAgent {
  private readonly logger = new Logger(TransactionCategorizerAgent.name);

  constructor(
    private readonly contextLoader: ContextLoader,
    private readonly patternMatcher: PatternMatcher,
    private readonly confidenceScorer: ConfidenceScorer,
    private readonly decisionLogger: DecisionLogger,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Categorize a transaction using pattern matching and historical analysis
   *
   * @param transaction - Transaction to categorize
   * @param tenantId - Tenant ID for isolation
   * @returns Categorization result with confidence and auto-apply status
   */
  async categorize(
    transaction: Transaction,
    tenantId: string,
  ): Promise<CategorizationResult> {
    const context = this.contextLoader.getContext();
    const payee = transaction.payeeName || '';
    const description = transaction.description || '';

    this.logger.debug(
      `Categorizing transaction ${transaction.id}: ${payee} - ${description}`,
    );

    // 1. Try pattern matching
    const patternMatch = this.patternMatcher.getBestMatch(
      payee,
      description,
      transaction.amountCents,
      transaction.isCredit,
    );

    // 2. Check historical categorizations for this payee
    const historicalMatch = await this.getHistoricalCategorization(
      tenantId,
      payee,
    );

    // 3. Calculate confidence score
    const confidenceInput: ConfidenceInput = {
      patternConfidence: patternMatch?.confidence || 0,
      hasPatternMatch: patternMatch !== null,
      hasHistoricalMatch: historicalMatch !== null,
      historicalMatchCount: historicalMatch?.count || 0,
      isAmountTypical: await this.isAmountTypical(
        tenantId,
        patternMatch?.pattern.accountCode,
        transaction.amountCents,
      ),
      descriptionQuality: this.calculateDescriptionQuality(description),
    };

    const confidence = this.confidenceScorer.calculate(confidenceInput);
    const meetsThreshold = this.confidenceScorer.meetsAutoApplyThreshold(
      confidence,
      context.autoApplyThreshold,
    );

    // 4. Determine account code, name, and VAT type
    let accountCode: string;
    let accountName: string;
    let vatType: VatType;
    let reasoning: string;
    let source: 'PATTERN' | 'HISTORICAL' | 'FALLBACK';
    let patternId: string | undefined;

    if (patternMatch) {
      accountCode = patternMatch.pattern.accountCode;
      accountName = patternMatch.pattern.accountName;
      vatType = this.mapVatType(patternMatch.pattern.vatType);
      reasoning = `Matched pattern "${patternMatch.pattern.id}": ${patternMatch.matchedText}`;
      source = 'PATTERN';
      patternId = patternMatch.pattern.id;
    } else if (historicalMatch) {
      accountCode = historicalMatch.accountCode;
      accountName = historicalMatch.accountName;
      vatType = VatType.STANDARD; // Default for historical - will be reviewed
      reasoning = `Historical match: ${historicalMatch.count} similar transactions for payee "${payee}"`;
      source = 'HISTORICAL';
    } else {
      // Fallback based on credit/debit
      if (transaction.isCredit) {
        accountCode = '4100';
        accountName = 'Other Income';
        vatType = VatType.EXEMPT;
      } else {
        accountCode = '8100';
        accountName = 'Bank Charges';
        vatType = VatType.NO_VAT;
      }
      reasoning = 'No pattern or historical match - using default account';
      source = 'FALLBACK';
    }

    // 5. Check if pattern requires review
    const patternRequiresReview = patternMatch?.pattern.flagForReview || false;
    const reviewReason = patternMatch?.pattern.reviewReason;

    // 6. Check if amount exceeds pattern max
    const amountExceedsMax =
      patternMatch?.pattern.requiresAmountCheck &&
      patternMatch?.pattern.maxAmountCents !== undefined &&
      transaction.amountCents > patternMatch.pattern.maxAmountCents;

    // 7. Determine final auto-apply status
    const autoApplied =
      meetsThreshold && !patternRequiresReview && !amountExceedsMax;

    // 8. Log decision
    await this.decisionLogger.log({
      tenantId,
      transactionId: transaction.id,
      decision: autoApplied ? 'categorize' : 'escalate',
      accountCode,
      accountName,
      confidence,
      source,
      autoApplied,
      reasoning,
      patternId,
    });

    // 9. Log escalation if needed
    if (!autoApplied) {
      let escalationType:
        | 'LOW_CONFIDENCE_CATEGORIZATION'
        | 'PATTERN_FLAGGED'
        | 'AMOUNT_EXCEEDS_MAX';
      let escalationReason: string;

      if (patternRequiresReview) {
        escalationType = 'PATTERN_FLAGGED';
        escalationReason = reviewReason || 'Pattern requires review';
      } else if (amountExceedsMax) {
        escalationType = 'AMOUNT_EXCEEDS_MAX';
        escalationReason = `Amount ${transaction.amountCents} cents exceeds pattern max ${patternMatch?.pattern.maxAmountCents} cents`;
      } else {
        escalationType = 'LOW_CONFIDENCE_CATEGORIZATION';
        escalationReason = `Confidence ${confidence}% below threshold ${context.autoApplyThreshold}%`;
      }

      await this.decisionLogger.logEscalation(
        tenantId,
        transaction.id,
        escalationType,
        escalationReason,
        accountCode,
        accountName,
        confidence,
      );
    }

    return {
      accountCode,
      accountName,
      confidenceScore: confidence,
      reasoning,
      vatType,
      isSplit: false,
      autoApplied,
      patternId,
    };
  }

  /**
   * Get historical categorization for a payee
   */
  private async getHistoricalCategorization(
    tenantId: string,
    payee: string,
  ): Promise<{
    accountCode: string;
    accountName: string;
    count: number;
  } | null> {
    if (!payee || payee.trim() === '') {
      return null;
    }

    try {
      // Use raw query for groupBy since Prisma's groupBy has limitations
      // Note: Use actual database column names (snake_case) not Prisma field names
      const results = await this.prisma.$queryRaw<
        Array<{ account_code: string; account_name: string; count: bigint }>
      >`
        SELECT c."account_code", c."account_name", COUNT(*) as count
        FROM "categorizations" c
        JOIN "transactions" t ON c."transaction_id" = t.id
        WHERE t."tenant_id" = ${tenantId}
          AND t."payee_name" ILIKE ${'%' + payee + '%'}
          AND t."is_deleted" = false
        GROUP BY c."account_code", c."account_name"
        ORDER BY count DESC
        LIMIT 1
      `;

      if (results.length === 0) {
        return null;
      }

      return {
        accountCode: results[0].account_code,
        accountName: results[0].account_name,
        count: Number(results[0].count),
      };
    } catch (error) {
      this.logger.warn(
        `Historical lookup failed for payee "${payee}": ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    }
  }

  /**
   * Check if amount is typical for an account
   */
  private async isAmountTypical(
    tenantId: string,
    accountCode: string | undefined,
    amountCents: number,
  ): Promise<boolean> {
    if (!accountCode) {
      return false;
    }

    try {
      const stats = await this.prisma.transaction.aggregate({
        where: {
          tenantId,
          categorizations: {
            some: {
              accountCode,
            },
          },
          isDeleted: false,
        },
        _avg: { amountCents: true },
        _count: { _all: true },
      });

      // Not enough data to determine typical amount
      const avgAmount = stats._avg?.amountCents;
      const count = stats._count?._all ?? 0;

      if (!avgAmount || count < 3) {
        return true;
      }

      // Consider typical if within 0.5x to 2x of average
      return amountCents >= avgAmount * 0.5 && amountCents <= avgAmount * 2;
    } catch {
      return true; // Default to true if query fails
    }
  }

  /**
   * Calculate description quality score (0-100)
   * Based on word count - more descriptive = higher quality
   */
  private calculateDescriptionQuality(description: string): number {
    if (!description) {
      return 0;
    }

    // Count words with length > 2 (skip noise)
    const words = description.split(/\s+/).filter((w) => w.length > 2).length;

    // More words = better quality, max 100 at 10+ words
    return Math.min(100, words * 10);
  }

  /**
   * Map string VAT type to enum
   */
  private mapVatType(type: string): VatType {
    switch (type.toUpperCase()) {
      case 'STANDARD':
        return VatType.STANDARD;
      case 'ZERO_RATED':
        return VatType.ZERO_RATED;
      case 'EXEMPT':
        return VatType.EXEMPT;
      case 'NO_VAT':
        return VatType.NO_VAT;
      default:
        return VatType.STANDARD;
    }
  }
}
