/**
 * Payment Matcher Agent
 * TASK-AGENT-003: Payment Matcher Agent
 *
 * @module agents/payment-matcher/matcher.agent
 * @description Makes match decisions for payment transactions.
 * Uses confidence scoring to determine auto-apply vs review required.
 *
 * Decision Rules:
 * - Single match >= 80%: AUTO_APPLY
 * - Multiple matches >= 80%: REVIEW_REQUIRED (ambiguous)
 * - Best match < 80%: REVIEW_REQUIRED (low confidence)
 * - No matches >= 20%: NO_MATCH
 *
 * CRITICAL RULES:
 * - ALL monetary values are CENTS (integers)
 * - 80% confidence threshold for auto-apply (L3 autonomy)
 * - No backwards compatibility - fail fast
 * - Tenant isolation on ALL queries
 */

import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Transaction } from '@prisma/client';
import { PrismaService } from '../../database/prisma/prisma.service';
import { MatchDecisionLogger } from './decision-logger';
import {
  MatchDecision,
  InvoiceCandidate,
} from './interfaces/matcher.interface';
import { SdkPaymentMatcher } from './sdk-matcher';
import type { MatchSource } from './interfaces/sdk-matcher.interface';
import { HybridScorer } from '../shared/hybrid-scorer';
import { AgentMemoryService } from '../memory/agent-memory.service';
import { ShadowRunner } from '../rollout/shadow-runner';
import type { ComparisonResult } from '../rollout/interfaces/rollout.interface';

/** Confidence threshold for auto-apply */
const AUTO_APPLY_THRESHOLD = 80;

/** Minimum confidence to include as candidate */
const CANDIDATE_THRESHOLD = 20;

/**
 * High-value threshold in cents (R50,000).
 * Transactions above this amount force REVIEW_REQUIRED even if SDK is confident.
 */
const HIGH_VALUE_THRESHOLD_CENTS = 5_000_000;

/** Maximum additive boost from ruvector similarity */
const RUVECTOR_MAX_BOOST = 10;

@Injectable()
export class PaymentMatcherAgent {
  private readonly logger = new Logger(PaymentMatcherAgent.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly decisionLogger: MatchDecisionLogger,
    @Optional()
    @Inject(SdkPaymentMatcher)
    private readonly sdkMatcher?: SdkPaymentMatcher,
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
   * Make a match decision for a transaction against invoice candidates
   *
   * @param transaction - Credit transaction to match
   * @param candidates - Invoice candidates with confidence scores
   * @param tenantId - Tenant ID for isolation
   * @param autoApplyThreshold - Threshold for auto-apply (default 80)
   * @returns Match decision with action and reasoning
   */
  async makeMatchDecision(
    transaction: Transaction,
    candidates: InvoiceCandidate[],
    tenantId: string,
    autoApplyThreshold: number = AUTO_APPLY_THRESHOLD,
  ): Promise<MatchDecision> {
    if (this.shadowRunner && this.sdkMatcher) {
      return this.shadowRunner.run<MatchDecision>({
        tenantId,
        agentType: 'matcher',
        sdkFn: () =>
          this._makeMatchDecisionCore(
            transaction,
            candidates.map((c) => ({
              ...c,
              invoice: { ...c.invoice },
              matchReasons: [...c.matchReasons],
            })),
            tenantId,
            autoApplyThreshold,
            false,
          ),
        heuristicFn: () =>
          this._makeMatchDecisionCore(
            transaction,
            candidates.map((c) => ({
              ...c,
              invoice: { ...c.invoice },
              matchReasons: [...c.matchReasons],
            })),
            tenantId,
            autoApplyThreshold,
            true,
          ),
        compareFn: (
          sdk: MatchDecision,
          heuristic: MatchDecision,
        ): ComparisonResult => ({
          tenantId,
          agentType: 'matcher',
          sdkResult: sdk,
          heuristicResult: heuristic,
          sdkDurationMs: 0,
          heuristicDurationMs: 0,
          resultsMatch:
            sdk.action === heuristic.action &&
            sdk.invoiceId === heuristic.invoiceId,
          sdkConfidence: sdk.confidence,
          heuristicConfidence: heuristic.confidence,
          details: {
            sdkAction: sdk.action,
            heuristicAction: heuristic.action,
            sdkInvoiceId: sdk.invoiceId,
            heuristicInvoiceId: heuristic.invoiceId,
          },
        }),
      });
    }
    return this._makeMatchDecisionCore(
      transaction,
      candidates,
      tenantId,
      autoApplyThreshold,
      false,
    );
  }

  private async _makeMatchDecisionCore(
    transaction: Transaction,
    candidates: InvoiceCandidate[],
    tenantId: string,
    autoApplyThreshold: number,
    skipSdk: boolean,
  ): Promise<MatchDecision> {
    const startTime = Date.now();

    const highConfidenceCandidates = candidates.filter(
      (c) => c.confidence >= autoApplyThreshold,
    );
    const validCandidates = candidates.filter(
      (c) => c.confidence >= CANDIDATE_THRESHOLD,
    );

    let decision: MatchDecision;
    let source: MatchSource = 'deterministic';

    if (candidates.length === 0) {
      // No candidates at all
      decision = {
        transactionId: transaction.id,
        confidence: 0,
        action: 'NO_MATCH',
        reasoning: 'No matching invoices found',
        alternatives: [],
      };

      await this.decisionLogger.logDecision({
        tenantId,
        transactionId: transaction.id,
        transactionAmountCents: transaction.amountCents,
        decision: 'no_match',
        confidence: 0,
        autoApplied: false,
        reasoning: 'No matching invoices found',
        candidateCount: 0,
        source,
        durationMs: Date.now() - startTime,
      });
    } else if (highConfidenceCandidates.length === 1) {
      // Single high-confidence match - AUTO APPLY (fast path, unchanged)
      const best = highConfidenceCandidates[0];
      decision = {
        transactionId: transaction.id,
        invoiceId: best.invoice.id,
        invoiceNumber: best.invoice.invoiceNumber,
        confidence: best.confidence,
        action: 'AUTO_APPLY',
        reasoning: best.matchReasons.join('; '),
        alternatives: validCandidates
          .filter((c) => c.invoice.id !== best.invoice.id)
          .slice(0, 4)
          .map((c) => ({
            invoiceId: c.invoice.id,
            invoiceNumber: c.invoice.invoiceNumber,
            confidence: c.confidence,
          })),
      };

      await this.decisionLogger.logDecision({
        tenantId,
        transactionId: transaction.id,
        transactionAmountCents: transaction.amountCents,
        decision: 'match',
        invoiceId: best.invoice.id,
        invoiceNumber: best.invoice.invoiceNumber,
        confidence: best.confidence,
        autoApplied: true,
        reasoning: best.matchReasons.join('; '),
        candidateCount: validCandidates.length,
        source,
        durationMs: Date.now() - startTime,
      });
    } else {
      // ── SDK-004: Hybrid matching flow ──────────────────────────────
      // Before falling through to existing ambiguous/low-confidence logic,
      // attempt ruvector boost and LLM resolution if sdkMatcher is available.

      // Phase 1: Ruvector boost (try to promote one candidate above threshold)
      const ruvectorDecision = skipSdk
        ? null
        : await this.tryRuvectorBoost(
            transaction,
            candidates,
            validCandidates,
            tenantId,
            autoApplyThreshold,
            startTime,
          );
      if (ruvectorDecision) {
        return ruvectorDecision;
      }

      // Phase 2: LLM ambiguity resolution (for ambiguous or moderate-confidence cases)
      const sdkDecision = skipSdk
        ? null
        : await this.trySdkResolution(
            transaction,
            candidates,
            validCandidates,
            tenantId,
            autoApplyThreshold,
            startTime,
          );
      if (sdkDecision) {
        return sdkDecision;
      }

      // ── Fallback: existing deterministic logic (unchanged) ──────────
      // Re-compute high-confidence after any boost attempts
      const currentHighConfidence = candidates.filter(
        (c) => c.confidence >= autoApplyThreshold,
      );
      source = 'deterministic';

      if (currentHighConfidence.length > 1) {
        // Multiple high-confidence matches - AMBIGUOUS, need review
        const best = candidates.sort((a, b) => b.confidence - a.confidence)[0];
        decision = {
          transactionId: transaction.id,
          invoiceId: best.invoice.id,
          invoiceNumber: best.invoice.invoiceNumber,
          confidence: best.confidence,
          action: 'REVIEW_REQUIRED',
          reasoning: `Ambiguous: ${currentHighConfidence.length} high-confidence matches found`,
          alternatives: validCandidates.slice(0, 5).map((c) => ({
            invoiceId: c.invoice.id,
            invoiceNumber: c.invoice.invoiceNumber,
            confidence: c.confidence,
          })),
        };

        await this.decisionLogger.logDecision({
          tenantId,
          transactionId: transaction.id,
          transactionAmountCents: transaction.amountCents,
          decision: 'escalate',
          invoiceId: best.invoice.id,
          invoiceNumber: best.invoice.invoiceNumber,
          confidence: best.confidence,
          autoApplied: false,
          reasoning: `Ambiguous: ${currentHighConfidence.length} high-confidence matches`,
          candidateCount: validCandidates.length,
          source,
          durationMs: Date.now() - startTime,
        });

        await this.decisionLogger.logEscalation(
          tenantId,
          transaction.id,
          'AMBIGUOUS_MATCH',
          `${currentHighConfidence.length} invoices with confidence >= ${autoApplyThreshold}%`,
          currentHighConfidence.map((c) => c.invoice.id),
          currentHighConfidence.map((c) => c.invoice.invoiceNumber),
        );
      } else {
        // No high-confidence match - LOW CONFIDENCE, need review
        const best = candidates.sort((a, b) => b.confidence - a.confidence)[0];
        decision = {
          transactionId: transaction.id,
          invoiceId: best.invoice.id,
          invoiceNumber: best.invoice.invoiceNumber,
          confidence: best.confidence,
          action: 'REVIEW_REQUIRED',
          reasoning: `Confidence ${best.confidence}% below threshold ${autoApplyThreshold}%`,
          alternatives: validCandidates.slice(0, 5).map((c) => ({
            invoiceId: c.invoice.id,
            invoiceNumber: c.invoice.invoiceNumber,
            confidence: c.confidence,
          })),
        };

        await this.decisionLogger.logDecision({
          tenantId,
          transactionId: transaction.id,
          transactionAmountCents: transaction.amountCents,
          decision: 'escalate',
          invoiceId: best.invoice.id,
          invoiceNumber: best.invoice.invoiceNumber,
          confidence: best.confidence,
          autoApplied: false,
          reasoning: `Confidence ${best.confidence}% below threshold`,
          candidateCount: validCandidates.length,
          source,
          durationMs: Date.now() - startTime,
        });

        await this.decisionLogger.logEscalation(
          tenantId,
          transaction.id,
          'LOW_CONFIDENCE',
          `Best match ${best.invoice.invoiceNumber} at ${best.confidence}%`,
          validCandidates.map((c) => c.invoice.id),
          validCandidates.map((c) => c.invoice.invoiceNumber),
        );
      }
    }

    return decision;
  }

  // ────────────────────────────────────────────────────────────────────
  // SDK-004: Hybrid matching helper methods
  // ────────────────────────────────────────────────────────────────────

  /**
   * Phase 1: Attempt ruvector similarity boost on candidate confidence.
   *
   * If sdkMatcher is available and the transaction has a reference,
   * searches for similar invoice references and boosts matching candidates
   * by up to RUVECTOR_MAX_BOOST points (additive). If a single candidate
   * is then promoted above the auto-apply threshold, returns an AUTO_APPLY decision.
   *
   * @returns MatchDecision if ruvector boost produces a clear winner, otherwise null
   */
  private async tryRuvectorBoost(
    transaction: Transaction,
    candidates: InvoiceCandidate[],
    validCandidates: InvoiceCandidate[],
    tenantId: string,
    autoApplyThreshold: number,
    startTime: number,
  ): Promise<MatchDecision | null> {
    if (!this.sdkMatcher || !transaction.reference) {
      return null;
    }

    try {
      const similarRefs = await this.sdkMatcher.findSimilarReferences(
        transaction.reference,
        tenantId,
      );

      if (similarRefs.length === 0) {
        return null;
      }

      // Build a lookup of invoiceId → similarity score
      const similarityMap = new Map<string, number>();
      for (const ref of similarRefs) {
        similarityMap.set(ref.invoiceId, ref.similarity);
      }

      // Boost candidate confidence (additive, capped at +RUVECTOR_MAX_BOOST, total max 100)
      for (const candidate of candidates) {
        const similarity = similarityMap.get(candidate.invoice.id);
        if (similarity !== undefined) {
          const boost = Math.round(similarity * RUVECTOR_MAX_BOOST);
          candidate.confidence = Math.min(100, candidate.confidence + boost);
          candidate.matchReasons.push(
            `Ruvector similarity boost +${String(boost)}`,
          );
        }
      }

      // Re-check: did the boost produce a single clear winner?
      const boostedHigh = candidates.filter(
        (c) => c.confidence >= autoApplyThreshold,
      );

      if (boostedHigh.length === 1) {
        const best = boostedHigh[0];
        const source: MatchSource = 'deterministic+ruvector';

        const decision: MatchDecision = {
          transactionId: transaction.id,
          invoiceId: best.invoice.id,
          invoiceNumber: best.invoice.invoiceNumber,
          confidence: best.confidence,
          action: 'AUTO_APPLY',
          reasoning: best.matchReasons.join('; '),
          alternatives: validCandidates
            .filter((c) => c.invoice.id !== best.invoice.id)
            .slice(0, 4)
            .map((c) => ({
              invoiceId: c.invoice.id,
              invoiceNumber: c.invoice.invoiceNumber,
              confidence: c.confidence,
            })),
        };

        await this.decisionLogger.logDecision({
          tenantId,
          transactionId: transaction.id,
          transactionAmountCents: transaction.amountCents,
          decision: 'match',
          invoiceId: best.invoice.id,
          invoiceNumber: best.invoice.invoiceNumber,
          confidence: best.confidence,
          autoApplied: true,
          reasoning: best.matchReasons.join('; '),
          candidateCount: validCandidates.length,
          source,
          durationMs: Date.now() - startTime,
        });

        this.logger.log(
          `Ruvector boost resolved match for ${transaction.id} → ${best.invoice.invoiceNumber} (${String(best.confidence)}%)`,
        );

        return decision;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Ruvector boost failed for ${transaction.id}, continuing with deterministic: ${msg}`,
      );
    }

    return null;
  }

  /**
   * Phase 2: Attempt LLM-based ambiguity resolution via SDK.
   *
   * Called when deterministic + ruvector boost did not produce a single
   * high-confidence match. Uses the LLM to analyze candidates and resolve
   * ambiguity.
   *
   * Conditions for attempting SDK resolution:
   * - sdkMatcher is available
   * - Multiple candidates at >= autoApplyThreshold (ambiguous), OR
   * - Best candidate is in moderate range (40-79%)
   *
   * HIGH VALUE CHECK: If |amountCents| > HIGH_VALUE_THRESHOLD_CENTS,
   * forces REVIEW_REQUIRED even if the LLM is confident.
   *
   * @returns MatchDecision if SDK resolution succeeds, otherwise null
   */
  private async trySdkResolution(
    transaction: Transaction,
    candidates: InvoiceCandidate[],
    validCandidates: InvoiceCandidate[],
    tenantId: string,
    autoApplyThreshold: number,
    startTime: number,
  ): Promise<MatchDecision | null> {
    if (!this.sdkMatcher) {
      return null;
    }

    const currentHighConfidence = candidates.filter(
      (c) => c.confidence >= autoApplyThreshold,
    );
    const bestCandidate = [...candidates].sort(
      (a, b) => b.confidence - a.confidence,
    )[0];

    // Only attempt SDK if ambiguous (multiple high) or moderate confidence (40-79)
    const isAmbiguous = currentHighConfidence.length > 1;
    const isModerate =
      bestCandidate &&
      bestCandidate.confidence >= 40 &&
      bestCandidate.confidence < autoApplyThreshold;

    if (!isAmbiguous && !isModerate) {
      return null;
    }

    try {
      const sdkResult = await this.sdkMatcher.resolveAmbiguity(
        transaction,
        candidates,
        tenantId,
      );

      // If SDK returned no match or zero confidence, let fallback handle it
      if (!sdkResult.bestMatchInvoiceId || sdkResult.confidence === 0) {
        return null;
      }

      // HIGH VALUE CHECK: force REVIEW_REQUIRED for high-value transactions
      const isHighValue =
        Math.abs(transaction.amountCents) > HIGH_VALUE_THRESHOLD_CENTS;

      const matchedCandidate = candidates.find(
        (c) => c.invoice.id === sdkResult.bestMatchInvoiceId,
      );

      const action: MatchDecision['action'] =
        isHighValue || sdkResult.confidence < autoApplyThreshold
          ? 'REVIEW_REQUIRED'
          : 'AUTO_APPLY';

      const reasonParts = [sdkResult.reasoning];
      if (isHighValue) {
        reasonParts.push(
          `High-value transaction (${String(Math.abs(transaction.amountCents))} cents) forced to review`,
        );
      }

      const source: MatchSource = 'sdk';
      const decision: MatchDecision = {
        transactionId: transaction.id,
        invoiceId: sdkResult.bestMatchInvoiceId,
        invoiceNumber: matchedCandidate?.invoice.invoiceNumber,
        confidence: sdkResult.confidence,
        action,
        reasoning: reasonParts.join('; '),
        alternatives: validCandidates
          .filter((c) => c.invoice.id !== sdkResult.bestMatchInvoiceId)
          .slice(0, 4)
          .map((c) => ({
            invoiceId: c.invoice.id,
            invoiceNumber: c.invoice.invoiceNumber,
            confidence: c.confidence,
          })),
      };

      const logDecision: 'match' | 'escalate' =
        action === 'AUTO_APPLY' ? 'match' : 'escalate';

      await this.decisionLogger.logDecision({
        tenantId,
        transactionId: transaction.id,
        transactionAmountCents: transaction.amountCents,
        decision: logDecision,
        invoiceId: sdkResult.bestMatchInvoiceId,
        invoiceNumber: matchedCandidate?.invoice.invoiceNumber,
        confidence: sdkResult.confidence,
        autoApplied: action === 'AUTO_APPLY',
        reasoning: reasonParts.join('; '),
        candidateCount: validCandidates.length,
        source,
        durationMs: Date.now() - startTime,
      });

      this.logger.log(
        `SDK resolved match for ${transaction.id} → ${matchedCandidate?.invoice.invoiceNumber ?? 'unknown'} (${String(sdkResult.confidence)}%, action=${action}, source=sdk)`,
      );

      return decision;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `SDK resolution failed for ${transaction.id}, falling through to deterministic: ${msg}`,
      );
    }

    return null;
  }

  /**
   * Find invoice candidates for a transaction
   * Uses reference matching, amount matching, and name similarity
   */
  async findCandidates(
    transaction: Transaction,
    tenantId: string,
  ): Promise<InvoiceCandidate[]> {
    // Get outstanding invoices
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        isDeleted: false,
        status: { in: ['SENT', 'PARTIALLY_PAID', 'OVERDUE'] },
      },
      include: {
        parent: true,
        child: true,
      },
    });

    const candidates: InvoiceCandidate[] = [];
    const transactionAmount = Math.abs(transaction.amountCents);

    for (const invoice of invoices) {
      const outstandingCents = invoice.totalCents - invoice.amountPaidCents;
      if (outstandingCents <= 0) continue;

      let confidence = 0;
      const reasons: string[] = [];

      // 1. Reference match (0-40 points)
      if (transaction.reference) {
        const refScore = this.calculateReferenceScore(
          transaction.reference,
          invoice.invoiceNumber,
        );
        confidence += refScore.score;
        if (refScore.reason) reasons.push(refScore.reason);
      }

      // 2. Amount match (0-40 points)
      const amountScore = this.calculateAmountScore(
        transactionAmount,
        outstandingCents,
      );
      confidence += amountScore.score;
      if (amountScore.reason) reasons.push(amountScore.reason);

      // 3. Name similarity (0-20 points)
      if (transaction.payeeName) {
        const nameScore = this.calculateNameScore(
          transaction.payeeName,
          `${invoice.parent.firstName} ${invoice.parent.lastName}`,
        );
        confidence += nameScore.score;
        if (nameScore.reason) reasons.push(nameScore.reason);
      }

      // Only include if meets minimum threshold
      if (confidence >= CANDIDATE_THRESHOLD) {
        candidates.push({
          invoice: {
            id: invoice.id,
            invoiceNumber: invoice.invoiceNumber,
            totalCents: invoice.totalCents,
            amountPaidCents: invoice.amountPaidCents,
            parentId: invoice.parentId,
            parent: {
              firstName: invoice.parent.firstName,
              lastName: invoice.parent.lastName,
            },
            child: {
              firstName: invoice.child.firstName,
            },
          },
          confidence: Math.min(100, confidence),
          matchReasons: reasons,
        });
      }
    }

    // Sort by confidence descending
    return candidates.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Calculate reference match score
   */
  private calculateReferenceScore(
    reference: string,
    invoiceNumber: string,
  ): { score: number; reason?: string } {
    const normRef = this.normalize(reference);
    const normInv = this.normalize(invoiceNumber);

    if (normRef === normInv) {
      return { score: 40, reason: 'Exact reference match' };
    }

    if (normRef.includes(normInv)) {
      return { score: 30, reason: 'Reference contains invoice number' };
    }

    if (normInv.length >= 4 && normRef.endsWith(normInv.slice(-4))) {
      return { score: 15, reason: 'Reference ends with invoice suffix' };
    }

    return { score: 0 };
  }

  /**
   * Calculate amount match score
   */
  private calculateAmountScore(
    transactionCents: number,
    outstandingCents: number,
  ): { score: number; reason?: string } {
    const diff = Math.abs(transactionCents - outstandingCents);
    const percentDiff = outstandingCents > 0 ? diff / outstandingCents : 1;

    if (diff === 0) {
      return { score: 40, reason: 'Exact amount match' };
    }

    if (percentDiff <= 0.01 || diff <= 100) {
      return { score: 35, reason: 'Amount within 1% or R1' };
    }

    if (percentDiff <= 0.05) {
      return { score: 25, reason: 'Amount within 5%' };
    }

    if (percentDiff <= 0.1) {
      return { score: 15, reason: 'Amount within 10%' };
    }

    if (transactionCents < outstandingCents) {
      return { score: 10, reason: 'Partial payment' };
    }

    return { score: 0 };
  }

  /**
   * Calculate name similarity score
   */
  private calculateNameScore(
    payeeName: string,
    parentName: string,
  ): { score: number; reason?: string } {
    const normPayee = this.normalize(payeeName);
    const normParent = this.normalize(parentName);

    const similarity = this.calculateStringSimilarity(normPayee, normParent);

    if (similarity === 1) {
      return { score: 20, reason: 'Exact name match' };
    }

    if (similarity > 0.8) {
      return {
        score: 15,
        reason: `Strong name similarity (${Math.round(similarity * 100)}%)`,
      };
    }

    if (similarity > 0.6) {
      return {
        score: 10,
        reason: `Good name similarity (${Math.round(similarity * 100)}%)`,
      };
    }

    if (similarity > 0.4) {
      return {
        score: 5,
        reason: `Weak name similarity (${Math.round(similarity * 100)}%)`,
      };
    }

    return { score: 0 };
  }

  /**
   * Normalize string for comparison
   */
  private normalize(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Calculate string similarity using Levenshtein distance
   */
  private calculateStringSimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length === 0 || str2.length === 0) return 0;

    const matrix: number[][] = [];

    for (let i = 0; i <= str1.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str2.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str1.length; i++) {
      for (let j = 1; j <= str2.length; j++) {
        const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost,
        );
      }
    }

    const distance = matrix[str1.length][str2.length];
    const maxLength = Math.max(str1.length, str2.length);
    return 1 - distance / maxLength;
  }
}
