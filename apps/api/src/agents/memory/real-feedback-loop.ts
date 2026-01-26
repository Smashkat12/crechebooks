/**
 * Real Feedback Loop
 * TASK-STUB-004: FeedbackLoop Real Integration
 *
 * @module agents/memory/real-feedback-loop
 * @description Propagates human corrections to learning subsystems:
 * 1. LearningEngine (negative reward for routing RL)
 * 2. SONA (trajectory recording, forward-compatible)
 *
 * Does NOT call FastAgentDB.recordCorrection() -- that is already done
 * in AgentMemoryService.recordCorrection() (TASK-STUB-002). This avoids
 * duplicate episode storage.
 *
 * CRITICAL RULES:
 * - ALL subsystem writes are non-blocking (.catch() pattern)
 * - ALL subsystems are @Optional() -- works with 0, 1, or 2 available
 * - Only negative rewards (corrections are errors by definition)
 * - No PII in feedback data (only IDs, codes, confidence, correctness)
 * - Tenant isolation enforced via context keys
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import type {
  FeedbackLoopInterface,
  FeedbackData,
  FeedbackResult,
  FeedbackTarget,
  SonaEngineInterface,
} from './interfaces/feedback-loop.interface';
import type { LearningRouterInterface } from '../shared/interfaces/learning-router.interface';

// ────────────────────────────────────────────────────────────────────
// Reward Constants
// ────────────────────────────────────────────────────────────────────

/** Standard correction: original decision was wrong (different category) */
const REWARD_STANDARD_CORRECTION = -0.5;

/** Partial correction: right category, wrong sub-account (same first 2 digits) */
const REWARD_PARTIAL_CORRECTION = -0.3;

/** SONA step reward for corrections: always -1.0 (strong negative signal) */
const REWARD_SONA_STEP = -1.0;

/** SONA trajectory quality for corrections: 0.0 (failure) */
const QUALITY_CORRECTION_TRAJECTORY = 0.0;

/** Placeholder embedding dimension for SONA (real embeddings from TASK-STUB-005) */
const SONA_EMBEDDING_DIMENSION = 384;

// ────────────────────────────────────────────────────────────────────
// Injection Tokens
// ────────────────────────────────────────────────────────────────────

export const SONA_ENGINE_TOKEN = 'SonaEngine';

// ────────────────────────────────────────────────────────────────────
// Service
// ────────────────────────────────────────────────────────────────────

@Injectable()
export class RealFeedbackLoop implements FeedbackLoopInterface {
  private readonly logger = new Logger(RealFeedbackLoop.name);

  constructor(
    @Optional()
    @Inject('LearningRouter')
    private readonly learningRouter?: LearningRouterInterface,
    @Optional()
    @Inject(SONA_ENGINE_TOKEN)
    private readonly sonaEngine?: SonaEngineInterface,
  ) {}

  /**
   * Process a correction feedback through all learning subsystems.
   *
   * Execution order (all non-blocking):
   * 1. Send negative reward to LearningEngine (routing learns from mistake)
   * 2. Record SONA trajectory (when available, quality=0 for corrections)
   *
   * NOTE: FastAgentDB.recordCorrection() is NOT called here -- it is already
   * called from AgentMemoryService.recordCorrection() (TASK-STUB-002).
   *
   * Each write is independent -- failure in one does not block others.
   * All writes use .catch() pattern (fire-and-forget).
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- fire-and-forget: .then()/.catch() by design
  async processFeedback(data: FeedbackData): Promise<FeedbackResult> {
    const targets: FeedbackTarget[] = [];
    const errors: string[] = [];

    // 1. LearningEngine reward signal
    if (this.learningRouter) {
      this.sendLearningReward(data)
        .then(() => targets.push('LEARNING_ENGINE'))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`LearningEngine: ${msg}`);
          this.logger.warn(`Feedback to LearningEngine failed: ${msg}`);
        });
    }

    // 2. SONA trajectory (optional, forward-compatible)
    if (this.sonaEngine) {
      this.recordSonaTrajectory(data)
        .then(() => targets.push('SONA_ENGINE'))
        .catch((err: unknown) => {
          const msg = err instanceof Error ? err.message : String(err);
          errors.push(`SonaEngine: ${msg}`);
          this.logger.warn(`Feedback to SonaEngine failed: ${msg}`);
        });
    }

    return {
      processed: true,
      targets,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Send a negative reward signal to the LearningEngine.
   *
   * Reward values for corrections:
   *   -0.5 -- standard correction (original decision was wrong)
   *   -0.3 -- partial correction (right category, wrong sub-account)
   *
   * The reward magnitude is determined by the correction type.
   */
  private async sendLearningReward(data: FeedbackData): Promise<void> {
    if (!this.learningRouter) return;

    const reward = this.computeReward(data);

    await this.learningRouter.recordReward({
      context: {
        tenantId: data.tenantId,
        agentType: this.resolveAgentType(data),
      },
      action: (data.originalDecision?.source ?? 'HYBRID') as
        | 'LLM_PRIMARY'
        | 'HEURISTIC_PRIMARY'
        | 'HYBRID',
      reward,
      done: true,
    });

    this.logger.debug(
      `Sent reward ${String(reward)} to LearningEngine for correction ${data.agentDecisionId}`,
    );
  }

  /**
   * Compute reward magnitude based on correction type.
   *
   * Returns:
   *   -0.3 for partial corrections (same category = same first 2 digits of accountCode)
   *   -0.5 for standard corrections (different categories)
   */
  private computeReward(data: FeedbackData): number {
    const original = data.originalValue;
    const corrected = data.correctedValue;

    // Check if it's a partial correction (same category, different sub-account)
    if (
      original &&
      corrected &&
      typeof original === 'object' &&
      typeof corrected === 'object' &&
      'accountCode' in original &&
      'accountCode' in corrected
    ) {
      const origCode = String(
        (original as Record<string, unknown>)['accountCode'],
      );
      const corrCode = String(
        (corrected as Record<string, unknown>)['accountCode'],
      );

      // Same first 2 digits = same category, different sub-account
      if (origCode.substring(0, 2) === corrCode.substring(0, 2)) {
        return REWARD_PARTIAL_CORRECTION;
      }
    }

    return REWARD_STANDARD_CORRECTION;
  }

  /**
   * Record a correction as a SONA trajectory with quality=0.
   * Quality=0 means "this was a failure" -- SONA will learn to avoid
   * similar patterns in the future.
   */
  private async recordSonaTrajectory(data: FeedbackData): Promise<void> {
    if (!this.sonaEngine) return;

    // SONA needs an embedding to begin a trajectory.
    // Use a zero-vector placeholder (real embeddings from TASK-STUB-005).
    const placeholderEmbedding = new Array<number>(
      SONA_EMBEDDING_DIMENSION,
    ).fill(0);

    const trajId = await this.sonaEngine.beginTrajectory(placeholderEmbedding);

    await this.sonaEngine.addStep(trajId, {
      state: {
        tenantId: data.tenantId,
        originalValue: data.originalValue,
      },
      action: JSON.stringify(data.correctedValue),
      reward: REWARD_SONA_STEP,
    });

    await this.sonaEngine.endTrajectory(trajId, QUALITY_CORRECTION_TRAJECTORY);

    this.logger.debug(
      `Recorded SONA correction trajectory ${trajId} for decision ${data.agentDecisionId}`,
    );
  }

  /**
   * Resolve the agent type from feedback data.
   * Falls back to 'categorizer' if not specified.
   */
  private resolveAgentType(data: FeedbackData): 'categorizer' | 'matcher' {
    const agentType = data.originalDecision?.agentType;
    if (agentType === 'categorizer' || agentType === 'matcher') {
      return agentType;
    }
    // Default to categorizer (most common correction type)
    return 'categorizer';
  }
}
