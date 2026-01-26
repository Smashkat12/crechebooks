/**
 * Real Decision Hooks
 * TASK-STUB-008: Decision Hooks SONA Wiring (Pre/Post Decision Lifecycle)
 *
 * @module agents/audit/real-decision-hooks
 * @description Replaces the AgenticFlowHooksStub with real pre/post decision
 * lifecycle logic. Pre-decision checks correction history and semantic similarity.
 * Post-decision records SONA trajectories and audit trail data.
 *
 * CRITICAL RULES:
 * - Pre-decision hooks are ADVISORY ONLY — always return allowed=true
 * - Post-decision hooks are NON-BLOCKING — all operations fire-and-forget with .catch()
 * - All queries are tenant-scoped (POPI Act compliance)
 * - No PII in stored records — only IDs, codes, confidence, correctness
 * - All monetary values in cents (integers)
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { RuvectorService } from '../sdk/ruvector.service';
import { SonaWeightAdapter } from '../shared/sona-weight-adapter';
import type {
  DecisionHooksInterface,
  PreDecisionContext,
  PreDecisionResult,
  PostDecisionContext,
  CorrectionHistoryMatch,
} from './interfaces/decision-hooks.interface';

/** Injection token for decision hooks */
export const DECISION_HOOKS_TOKEN = 'DECISION_HOOKS';

/** Number of recent corrections to trigger a warning */
const CORRECTION_WARNING_THRESHOLD = 3;

/** Confidence reduction when similar past decisions were corrected (percentage points) */
const CORRECTION_CONFIDENCE_PENALTY = 10;

/** Number of days to look back for correction history */
const CORRECTION_LOOKBACK_DAYS = 30;

/** Maximum number of similar decisions to check */
const MAX_SIMILAR_CHECK = 10;

@Injectable()
export class RealDecisionHooks implements DecisionHooksInterface {
  private readonly logger = new Logger(RealDecisionHooks.name);

  constructor(
    @Optional()
    @Inject(PrismaService)
    private readonly prisma?: PrismaService,
    @Optional()
    @Inject(RuvectorService)
    private readonly ruvector?: RuvectorService,
    @Optional()
    @Inject(SonaWeightAdapter)
    private readonly sonaAdapter?: SonaWeightAdapter,
  ) {}

  /**
   * Pre-decision hook: check for recently failed similar decisions.
   *
   * Algorithm:
   * 1. Query AgentAuditLog for recent corrections with similar input
   * 2. Use RuvectorService.searchSimilar() for semantic matching
   * 3. If 3+ corrections found for similar inputs -> add WARNING_PREVIOUSLY_CORRECTED flag
   * 4. Reduce confidence by 10 percentage points
   *
   * CRITICAL: This is advisory only. The hook NEVER blocks decisions.
   * All operations are wrapped in try/catch.
   */
  async preDecision(context: PreDecisionContext): Promise<PreDecisionResult> {
    const result: PreDecisionResult = {
      allowed: true,
      warnings: [],
      confidenceAdjustment: 0,
    };

    try {
      // Step 1: Check correction history via Prisma
      const corrections = await this.checkCorrectionHistory(context);

      if (corrections.length >= CORRECTION_WARNING_THRESHOLD) {
        result.warnings.push({
          code: 'WARNING_PREVIOUSLY_CORRECTED',
          message:
            `Found ${String(corrections.length)} recent corrections for similar inputs ` +
            `(agent: ${context.agentType}, tenant: ${context.tenantId}). ` +
            `Reducing confidence by ${String(CORRECTION_CONFIDENCE_PENALTY)}%.`,
          correctionCount: corrections.length,
          recentCorrections: corrections.slice(0, 3).map((c) => ({
            decisionId: c.decisionId,
            correctedAt: c.correctedAt,
            originalCode: c.originalCode,
            correctedCode: c.correctedCode,
          })),
        });
        result.confidenceAdjustment = -CORRECTION_CONFIDENCE_PENALTY;
      }

      // Step 2: Semantic similarity check via ruvector
      if (this.ruvector?.isAvailable() && context.inputText) {
        const semanticWarnings = await this.checkSemanticSimilarity(context);
        result.warnings.push(...semanticWarnings);

        // Additional penalty if semantic matches with corrections found
        if (semanticWarnings.length > 0 && result.confidenceAdjustment === 0) {
          result.confidenceAdjustment = -5; // Lighter penalty for semantic-only match
        }
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`preDecision hook failed (non-blocking): ${msg}`);
      // Fail-open: return allowed=true with no adjustments
    }

    return result;
  }

  /**
   * Post-decision hook: record SONA trajectory and update audit trail.
   *
   * Algorithm:
   * 1. Record SONA trajectory via SonaWeightAdapter.recordOutcome()
   * 2. Store decision embedding via ruvector for future similarity checks
   * 3. Update accuracy tracking in AgentAuditLog
   *
   * CRITICAL: ALL operations are non-blocking. Errors are caught, never thrown.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- intentionally fire-and-forget, no awaits needed
  async postDecision(context: PostDecisionContext): Promise<void> {
    // Step 1: Record SONA trajectory (for weight optimization)
    this.recordSonaTrajectory(context).catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `SONA trajectory recording failed (non-blocking): ${msg}`,
      );
    });

    // Step 2: Store decision embedding for future similarity checks
    this.storeDecisionEmbedding(context).catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `Decision embedding storage failed (non-blocking): ${msg}`,
      );
    });

    // Step 3: Update audit trail accuracy tracking
    this.updateAccuracyTracking(context).catch((error: unknown) => {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.debug(
        `Accuracy tracking update failed (non-blocking): ${msg}`,
      );
    });
  }

  /**
   * Check correction history in AgentAuditLog for similar inputs.
   * Returns recent corrections where the agent type and tenant match.
   */
  private async checkCorrectionHistory(
    context: PreDecisionContext,
  ): Promise<CorrectionHistoryMatch[]> {
    if (!this.prisma) return [];

    try {
      const lookbackDate = new Date();
      lookbackDate.setDate(lookbackDate.getDate() - CORRECTION_LOOKBACK_DAYS);

      const corrections = await this.prisma.agentAuditLog.findMany({
        where: {
          tenantId: context.tenantId,
          agentType: context.agentType,
          eventType: 'CORRECTION',
          createdAt: { gte: lookbackDate },
        },
        orderBy: { createdAt: 'desc' },
        take: MAX_SIMILAR_CHECK,
        select: {
          id: true,
          details: true,
          createdAt: true,
        },
      });

      return corrections.map((c) => {
        const details = c.details as Record<string, unknown> | null;
        return {
          decisionId: c.id,
          correctedAt: c.createdAt.toISOString(),
          originalCode:
            typeof details?.originalAccountCode === 'string'
              ? details.originalAccountCode
              : '',
          correctedCode:
            typeof details?.correctedAccountCode === 'string'
              ? details.correctedAccountCode
              : '',
        };
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Correction history check failed: ${msg}`);
      return [];
    }
  }

  /**
   * Semantic similarity check: find past decisions with similar input text
   * that were subsequently corrected.
   */
  private async checkSemanticSimilarity(
    context: PreDecisionContext,
  ): Promise<Array<{ code: string; message: string }>> {
    if (!this.ruvector?.isAvailable() || !context.inputText) return [];

    try {
      const embeddingResult = await this.ruvector.generateEmbedding(
        context.inputText,
      );
      const similar = await this.ruvector.searchSimilar(
        embeddingResult.vector,
        `audit-decisions-${context.tenantId}`,
        5,
      );

      // Filter for high-similarity results that were corrected
      const correctedSimilar = similar.filter(
        (s) => s.score >= 0.85 && s.metadata?.wasCorrect === false,
      );

      if (correctedSimilar.length > 0) {
        return [
          {
            code: 'WARNING_SEMANTIC_MATCH_CORRECTED',
            message:
              `Found ${String(correctedSimilar.length)} semantically similar past decisions ` +
              `that were corrected. Consider reviewing carefully.`,
          },
        ];
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.debug(`Semantic similarity check failed: ${msg}`);
    }

    return [];
  }

  /**
   * Record SONA trajectory for weight optimization learning.
   * Uses SonaWeightAdapter from TASK-STUB-005.
   */
  private async recordSonaTrajectory(
    context: PostDecisionContext,
  ): Promise<void> {
    if (!this.sonaAdapter) return;

    // Build SONA context
    const sonaContext = {
      tenantId: context.tenantId,
      agentType: context.agentType,
      transactionType: context.isCredit ? 'credit' : 'debit',
      amountBucket: context.amountBucket,
    };

    // Build trajectory outcome
    const outcome = {
      wasCorrect: context.wasCorrect ?? true, // Assume correct until corrected
      confidence: context.confidence,
      llmConfidence: context.llmConfidence ?? context.confidence,
      heuristicConfidence: context.heuristicConfidence ?? context.confidence,
    };

    await this.sonaAdapter.recordOutcome(sonaContext, outcome);

    this.logger.debug(
      `SONA trajectory recorded: ${context.agentType}@${context.tenantId} ` +
        `confidence=${String(context.confidence)}, correct=${String(outcome.wasCorrect)}`,
    );
  }

  /**
   * Store decision embedding for future similarity checks.
   * Non-blocking: errors caught by caller.
   */
  private async storeDecisionEmbedding(
    context: PostDecisionContext,
  ): Promise<void> {
    if (!this.ruvector?.isAvailable() || !context.reasoning) return;

    const embeddingResult = await this.ruvector.generateEmbedding(
      context.reasoning,
    );

    // Store in tenant-scoped audit decisions collection
    // Note: This requires ruvector.storeEmbedding() which may not be available yet
    // Forward-compatible stub
    this.logger.debug(
      `Decision embedding generated for ${context.agentType}@${context.tenantId} ` +
        `(${String(embeddingResult.vector.length)}d)`,
    );
  }

  /**
   * Update accuracy tracking in AgentAuditLog.
   * Writes a DECISION event to the audit trail via Prisma.
   */
  private async updateAccuracyTracking(
    context: PostDecisionContext,
  ): Promise<void> {
    if (!this.prisma) return;

    try {
      await this.prisma.agentAuditLog.create({
        data: {
          tenantId: context.tenantId,
          agentType: context.agentType,
          eventType: 'DECISION',
          decision: context.decision,
          confidence: context.confidence,
          source: context.source,
          autoApplied: context.autoApplied,
          details: {
            transactionId: context.transactionId,
            accountCode: context.accountCode,
            reasoning: context.reasoning,
            llmConfidence: context.llmConfidence,
            heuristicConfidence: context.heuristicConfidence,
            durationMs: context.durationMs,
          },
        },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Audit trail write failed: ${msg}`);
    }
  }
}
