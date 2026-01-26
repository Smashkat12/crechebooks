/**
 * Hybrid Scorer
 * TASK-SDK-009: Hybrid Scoring System Implementation
 *
 * @module agents/shared/hybrid-scorer
 * @description Combines LLM confidence with heuristic confidence using
 * SONA-optimized weights. Falls back to 60/40 default when SONA is unavailable.
 *
 * CRITICAL RULES:
 * - Min 20% heuristic weight enforced in all paths (safety floor)
 * - Score is Math.round of weighted combination
 * - Score is clamped 0-100
 * - When LLM is unavailable, returns heuristic-only result
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import type {
  HybridScore,
  ScoringWeights,
} from './interfaces/hybrid-scoring.interface';
import type { LearningRouterInterface } from './interfaces/learning-router.interface';

// ────────────────────────────────────────────────────────────────────────────
// Local stub for SONAScorer (agentic-flow not installed)
// Returns null to trigger default weights fallback.
// ────────────────────────────────────────────────────────────────────────────

interface SONAScorerWeights {
  llm: number;
  heuristic: number;
}

class SONAScorer {
  // eslint-disable-next-line @typescript-eslint/require-await
  async getOptimalWeights(_context: {
    tenantId: string;
    agentType: string;
  }): Promise<SONAScorerWeights | null> {
    // Stub: agentic-flow not installed. Returns null to trigger default weights.
    return null;
  }
}

/** Injection token for SONAScorer */
const SONA_SCORER_TOKEN = 'SONA_SCORER';

/** Default weights: 60% LLM, 40% heuristic */
const DEFAULT_LLM_WEIGHT = 0.6;
const DEFAULT_HEURISTIC_WEIGHT = 0.4;

/** Minimum heuristic weight for financial operations (safety floor) */
const MIN_HEURISTIC_WEIGHT = 0.2;

@Injectable()
export class HybridScorer {
  private readonly logger = new Logger(HybridScorer.name);
  private readonly sonaScorer: SONAScorer;
  private readonly learningRouter?: LearningRouterInterface;

  constructor(
    @Optional()
    @Inject(SONA_SCORER_TOKEN)
    sonaScorer?: SONAScorer,
    @Optional()
    learningRouter?: LearningRouterInterface,
  ) {
    this.sonaScorer = sonaScorer ?? new SONAScorer();
    this.learningRouter = learningRouter;
  }

  /**
   * Combine LLM and heuristic confidence scores into a single hybrid score.
   *
   * When llmConfidence is null, returns heuristic-only result.
   * When both are available, applies SONA-optimized weights (or 60/40 default)
   * with a min 20% heuristic safety floor.
   *
   * @param llmConfidence - LLM confidence (0-100) or null if unavailable
   * @param heuristicConfidence - Heuristic confidence (0-100)
   * @param context - Tenant and agent context for SONA weight lookup
   * @returns HybridScore with combined score and metadata
   */
  async combine(
    llmConfidence: number | null,
    heuristicConfidence: number,
    context: { tenantId: string; agentType: 'categorizer' | 'matcher' },
  ): Promise<HybridScore> {
    // When LLM is unavailable, return heuristic-only
    if (llmConfidence === null) {
      return {
        score: heuristicConfidence,
        source: 'HEURISTIC_ONLY',
        llmAvailable: false,
        llmScore: null,
        heuristicScore: heuristicConfidence,
      };
    }

    // Get SONA-optimized weights (falls back to default)
    let weights = await this.getWeights(context);

    // Enforce min 20% heuristic weight (safety floor)
    weights = this.enforceMinHeuristicWeight(weights);

    // Compute weighted combination
    const rawScore =
      llmConfidence * weights.llm + heuristicConfidence * weights.heuristic;

    // Round and clamp to 0-100
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));

    return {
      score,
      source: 'HYBRID',
      llmAvailable: true,
      llmScore: llmConfidence,
      heuristicScore: heuristicConfidence,
      sonaWeights: weights,
    };
  }

  /**
   * Get weights from LearningRouter → SONA → defaults.
   */
  private async getWeights(context: {
    tenantId: string;
    agentType: string;
  }): Promise<ScoringWeights> {
    // Try LearningRouter first (if available)
    if (this.learningRouter?.isAvailable()) {
      try {
        const lrWeights = await this.learningRouter.getOptimalWeights(
          context as { tenantId: string; agentType: 'categorizer' | 'matcher' },
        );
        if (lrWeights !== null) {
          return { llm: lrWeights.llm, heuristic: lrWeights.heuristic };
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`LearningRouter weight lookup failed: ${msg}`);
      }
    }

    // Try SONA next
    try {
      const sonaWeights = await this.sonaScorer.getOptimalWeights(context);
      if (sonaWeights !== null) {
        return { llm: sonaWeights.llm, heuristic: sonaWeights.heuristic };
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`SONA weight lookup failed, using defaults: ${msg}`);
    }

    return { llm: DEFAULT_LLM_WEIGHT, heuristic: DEFAULT_HEURISTIC_WEIGHT };
  }

  /**
   * Enforce minimum 20% heuristic weight and normalize so weights sum to 1.0.
   */
  private enforceMinHeuristicWeight(weights: ScoringWeights): ScoringWeights {
    let { llm, heuristic } = weights;

    // Enforce minimum heuristic weight
    if (heuristic < MIN_HEURISTIC_WEIGHT) {
      heuristic = MIN_HEURISTIC_WEIGHT;
      llm = 1.0 - heuristic;
    }

    // Normalize to sum = 1.0
    const total = llm + heuristic;
    if (total !== 1.0 && total > 0) {
      llm = llm / total;
      heuristic = heuristic / total;
    }

    // Re-check after normalization
    if (heuristic < MIN_HEURISTIC_WEIGHT) {
      heuristic = MIN_HEURISTIC_WEIGHT;
      llm = 1.0 - heuristic;
    }

    return { llm, heuristic };
  }
}
