/**
 * Transaction Categorizer Agent
 * TASK-AGENT-002: Transaction Categorizer Agent
 * TASK-SDK-003: TransactionCategorizer SDK Migration (Pilot)
 *
 * @module agents/transaction-categorizer/categorizer.agent
 * @description Main agent that categorizes bank transactions using pattern matching,
 * historical analysis, and optionally SDK-powered LLM inference via SdkCategorizer.
 *
 * Hybrid categorization flow:
 * 1. Pattern match (>=80% confidence) -> use pattern directly
 * 2. Ruvector semantic search (cosine >= 0.85) -> use semantic match
 * 3. LLM inference via agentic-flow -> use LLM result
 * 4. Historical match -> use historical categorization
 * 5. Fallback -> default account codes (4100 credit / 8100 debit)
 *
 * CRITICAL RULES:
 * - ALL monetary values are CENTS (integers)
 * - 80% confidence threshold for auto-apply (L3 autonomy)
 * - No backwards compatibility - fail fast
 * - Tenant isolation on ALL queries
 * - SdkCategorizer is @Optional() — works without SDK
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
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
import { SdkCategorizer } from './sdk-categorizer';
import { HybridScorer } from '../shared/hybrid-scorer';
import { AgentMemoryService, computeInputHash } from '../memory/agent-memory.service';
import { ShadowRunner } from '../rollout/shadow-runner';
import type { ComparisonResult } from '../rollout/interfaces/rollout.interface';

@Injectable()
export class TransactionCategorizerAgent {
  private readonly logger = new Logger(TransactionCategorizerAgent.name);

  constructor(
    private readonly contextLoader: ContextLoader,
    private readonly patternMatcher: PatternMatcher,
    private readonly confidenceScorer: ConfidenceScorer,
    private readonly decisionLogger: DecisionLogger,
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(SdkCategorizer)
    private readonly sdkCategorizer?: SdkCategorizer,
    @Optional()
    @Inject(HybridScorer)
    private readonly hybridScorer?: HybridScorer,
    @Optional()
    @Inject(AgentMemoryService)
    private readonly agentMemory?: AgentMemoryService,
    @Optional()
    @Inject(ShadowRunner)
    private readonly shadowRunner?: ShadowRunner,
  ) {}

  /**
   * Categorize a transaction using hybrid flow:
   * pattern -> ruvector semantic search -> LLM inference -> historical -> fallback
   *
   * When sdkCategorizer is not injected, behaves exactly as before:
   * pattern -> historical -> fallback
   *
   * When sdkCategorizer is injected and pattern confidence < 80%:
   * pattern (<80%) -> ruvector -> LLM -> historical -> fallback
   *
   * @param transaction - Transaction to categorize
   * @param tenantId - Tenant ID for isolation
   * @returns Categorization result with confidence and auto-apply status
   */
  async categorize(
    transaction: Transaction,
    tenantId: string,
  ): Promise<CategorizationResult> {
    if (this.shadowRunner && this.sdkCategorizer) {
      return this.shadowRunner.run<CategorizationResult>({
        tenantId,
        agentType: 'categorizer',
        sdkFn: () => this._categorizeCore(transaction, tenantId, false),
        heuristicFn: () => this._categorizeCore(transaction, tenantId, true),
        compareFn: (sdk: CategorizationResult, heuristic: CategorizationResult): ComparisonResult => ({
          tenantId,
          agentType: 'categorizer',
          sdkResult: sdk,
          heuristicResult: heuristic,
          sdkDurationMs: 0,
          heuristicDurationMs: 0,
          resultsMatch: sdk.accountCode === heuristic.accountCode && sdk.autoApplied === heuristic.autoApplied,
          sdkConfidence: sdk.confidenceScore,
          heuristicConfidence: heuristic.confidenceScore,
          details: {
            sdkAccountCode: sdk.accountCode,
            heuristicAccountCode: heuristic.accountCode,
            sdkReasoning: sdk.reasoning,
            heuristicReasoning: heuristic.reasoning,
          },
        }),
      });
    }
    return this._categorizeCore(transaction, tenantId, false);
  }

  private async _categorizeCore(
    transaction: Transaction,
    tenantId: string,
    skipSdk: boolean,
  ): Promise<CategorizationResult> {
    const context = this.contextLoader.getContext();
    const payee = transaction.payeeName || '';
    const description = transaction.description || '';

    this.logger.debug(
      `Categorizing transaction ${transaction.id}: ${payee} - ${description}`,
    );

    // 1. Try pattern matching (fast, free, deterministic)
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

    // 3. Calculate heuristic confidence score (same as original)
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

    const heuristicConfidence =
      this.confidenceScorer.calculate(confidenceInput);

    // 4. Determine account code, name, and VAT type
    let accountCode: string;
    let accountName: string;
    let vatType: VatType;
    let reasoning: string;
    let source: 'PATTERN' | 'HISTORICAL' | 'FALLBACK' | 'LLM';
    let patternId: string | undefined;
    let sdkModel: string | undefined;
    let sdkDurationMs: number | undefined;
    let sdkLlmConfidence: number | undefined;

    // Determine if we should try SDK paths:
    // Only when sdkCategorizer is available AND pattern match is absent or low confidence
    const shouldTrySdk =
      !skipSdk &&
      this.sdkCategorizer !== undefined &&
      (!patternMatch || patternMatch.confidence < 80);

    if (patternMatch && !shouldTrySdk) {
      // Use pattern match directly (original behavior when no SDK)
      accountCode = patternMatch.pattern.accountCode;
      accountName = patternMatch.pattern.accountName;
      vatType = this.mapVatType(patternMatch.pattern.vatType);
      reasoning = `Matched pattern "${patternMatch.pattern.id}": ${patternMatch.matchedText}`;
      source = 'PATTERN';
      patternId = patternMatch.pattern.id;
    } else if (shouldTrySdk) {
      // SDK is available and pattern is absent or low confidence
      let sdkResolved = false;

      const sdk = this.sdkCategorizer;

      // 2a. Ruvector semantic search (fast vector similarity)
      try {
        const semanticResult = await sdk.searchSimilarCategorizations(
          description || payee,
          tenantId,
        );

        if (semanticResult && semanticResult.confidence >= 80) {
          accountCode = semanticResult.accountCode;
          accountName = semanticResult.accountName;
          vatType = this.mapVatType(semanticResult.vatType);
          reasoning = semanticResult.reasoning;
          source = 'LLM'; // ruvector is non-deterministic path
          sdkModel = semanticResult.model;
          sdkDurationMs = semanticResult.durationMs;
          sdkLlmConfidence = semanticResult.confidence;
          sdkResolved = true;
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Ruvector semantic search failed: ${msg}`);
      }

      // 2b. LLM inference via agentic-flow (for novel/low-confidence)
      if (!sdkResolved) {
        try {
          const sdkResult = await sdk.executeWithFallback(
            async () =>
              sdk.categorize(
                {
                  tenantId,
                  payeeName: payee,
                  description: description || undefined,
                  amountCents: transaction.amountCents,
                  isCredit: transaction.isCredit,
                  transactionDate: transaction.date
                    ? transaction.date.toISOString()
                    : undefined,
                },
                tenantId,
              ),
            () => Promise.resolve(null),
          );

          if (sdkResult.data && sdkResult.source === 'SDK') {
            accountCode = sdkResult.data.accountCode;
            accountName = sdkResult.data.accountName;
            vatType = this.mapVatType(sdkResult.data.vatType);
            reasoning = sdkResult.data.reasoning;
            source = 'LLM';
            sdkModel = sdkResult.data.model ?? sdkResult.model;
            sdkDurationMs = sdkResult.durationMs;
            sdkLlmConfidence = sdkResult.data.confidence;
            sdkResolved = true;
          }
        } catch (error: unknown) {
          const msg = error instanceof Error ? error.message : String(error);
          this.logger.warn(`SDK categorization failed: ${msg}`);
        }
      }

      // 2c. SDK didn't resolve — fall back to original pattern -> historical -> fallback
      if (!sdkResolved) {
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
          vatType = VatType.STANDARD;
          reasoning = `Historical match: ${String(historicalMatch.count)} similar transactions for payee "${payee}"`;
          source = 'HISTORICAL';
        } else {
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
      }
    } else if (historicalMatch) {
      // No pattern match, no SDK — use historical (original behavior)
      accountCode = historicalMatch.accountCode;
      accountName = historicalMatch.accountName;
      vatType = VatType.STANDARD;
      reasoning = `Historical match: ${String(historicalMatch.count)} similar transactions for payee "${payee}"`;
      source = 'HISTORICAL';
    } else {
      // Fallback based on credit/debit (original behavior)
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

    // 5. Confidence weighting: LLM = 70% LLM confidence + 30% heuristic
    let finalConfidence: number;
    if (source === 'LLM' && sdkLlmConfidence !== undefined) {
      finalConfidence = Math.round(
        sdkLlmConfidence * 0.7 + heuristicConfidence * 0.3,
      );
    } else {
      finalConfidence = heuristicConfidence;
    }

    // 5b. If HybridScorer is available, use it for the final confidence (SDK-009)
    if (this.hybridScorer && source === 'LLM' && sdkLlmConfidence !== undefined) {
      try {
        const hybridResult = await this.hybridScorer.combine(
          sdkLlmConfidence,
          heuristicConfidence,
          { tenantId, agentType: 'categorizer' },
        );
        finalConfidence = hybridResult.score;
      } catch {
        // HybridScorer failed, keep existing confidence
      }
    }

    const meetsThreshold = this.confidenceScorer.meetsAutoApplyThreshold(
      finalConfidence,
      context.autoApplyThreshold,
    );

    // 6. Check if pattern requires review
    const patternRequiresReview = patternMatch?.pattern.flagForReview || false;
    const reviewReason = patternMatch?.pattern.reviewReason;

    // 7. Check if amount exceeds pattern max
    const amountExceedsMax =
      patternMatch?.pattern.requiresAmountCheck &&
      patternMatch?.pattern.maxAmountCents !== undefined &&
      transaction.amountCents > patternMatch.pattern.maxAmountCents;

    // 8. Determine final auto-apply status
    const autoApplied =
      meetsThreshold && !patternRequiresReview && !amountExceedsMax;

    // 9. Log decision (extended with SDK fields)
    await this.decisionLogger.log({
      tenantId,
      transactionId: transaction.id,
      decision: autoApplied ? 'categorize' : 'escalate',
      accountCode: accountCode!,
      accountName: accountName!,
      confidence: finalConfidence,
      source,
      autoApplied,
      reasoning: reasoning!,
      patternId,
      model: sdkModel,
      durationMs: sdkDurationMs,
    });

    // 10. Log escalation if needed
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
        escalationReason = `Amount ${String(transaction.amountCents)} cents exceeds pattern max ${String(patternMatch?.pattern.maxAmountCents)} cents`;
      } else {
        escalationType = 'LOW_CONFIDENCE_CATEGORIZATION';
        escalationReason = `Confidence ${String(finalConfidence)}% below threshold ${String(context.autoApplyThreshold)}%`;
      }

      await this.decisionLogger.logEscalation(
        tenantId,
        transaction.id,
        escalationType,
        escalationReason,
        accountCode!,
        accountName!,
        finalConfidence,
      );
    }

    // TASK-SDK-010: Store decision in memory (non-blocking, never blocks response)
    if (this.agentMemory) {
      const memInputHash = computeInputHash({
        payeeName: transaction.payeeName ?? '',
        description: transaction.description ?? '',
        amountCents: transaction.amountCents,
        isCredit: transaction.isCredit,
      });
      this.agentMemory
        .storeDecision({
          tenantId,
          agentType: 'categorizer',
          inputHash: memInputHash,
          inputText: transaction.description ?? '',
          decision: {
            accountCode: accountCode!,
            accountName: accountName!,
            vatType: vatType!,
          },
          confidence: finalConfidence,
          source:
            source === 'FALLBACK'
              ? 'PATTERN'
              : (source as 'LLM' | 'PATTERN' | 'HISTORICAL' | 'HYBRID'),
          transactionId: transaction.id,
        })
        .catch((err: Error) => {
          this.logger.warn(
            `Non-critical: failed to store decision: ${err.message}`,
          );
        });
    }

    return {
      accountCode: accountCode!,
      accountName: accountName!,
      confidenceScore: finalConfidence,
      reasoning: reasoning!,
      vatType: vatType!,
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
