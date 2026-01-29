/**
 * Scoring Router
 * TASK-SDK-009: Hybrid Scoring System Implementation
 *
 * @module agents/shared/scoring-router
 * @description Routes to the most accurate scoring path based on historical
 * accuracy data. Uses MultiModelRouter (stub) with fallback to accuracy-based
 * recommendation.
 *
 * CRITICAL RULES:
 * - Min 20% heuristic weight in all path configurations
 * - Default path is HYBRID when insufficient data
 * - MultiModelRouter stub returns null to trigger accuracy-based fallback
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type {
  ScoringPath,
  ScoringWeights,
} from './interfaces/hybrid-scoring.interface';
import { AccuracyTracker } from './accuracy-tracker';
import type { LearningRouterInterface } from './interfaces/learning-router.interface';

// ────────────────────────────────────────────────────────────────────────────
// Local stub for MultiModelRouter (agentic-flow not installed)
// Returns null to trigger accuracy-based fallback.
// ────────────────────────────────────────────────────────────────────────────

class MultiModelRouter {
  // eslint-disable-next-line @typescript-eslint/require-await
  async selectPath(_context: {
    tenantId: string;
    agentType: string;
  }): Promise<string | null> {
    // Stub: returns null to trigger fallback
    return null;
  }
}

/** Static weight mappings for each scoring path */
const PATH_WEIGHTS: Record<ScoringPath, ScoringWeights> = {
  LLM_PRIMARY: { llm: 0.8, heuristic: 0.2 },
  HEURISTIC_PRIMARY: { llm: 0.2, heuristic: 0.8 },
  HYBRID: { llm: 0.6, heuristic: 0.4 },
};

@Injectable()
export class ScoringRouter {
  private readonly logger = new Logger(ScoringRouter.name);
  private readonly multiModelRouter: MultiModelRouter;
  private readonly learningRouter?: LearningRouterInterface;

  constructor(
    private readonly accuracyTracker: AccuracyTracker,
    @Optional()
    learningRouter?: LearningRouterInterface,
  ) {
    this.multiModelRouter = new MultiModelRouter();
    this.learningRouter = learningRouter;
  }

  /**
   * Get the preferred scoring path for a tenant/agent pair.
   * Priority: LearningRouter → MultiModelRouter → AccuracyTracker.
   *
   * @param tenantId - Tenant ID
   * @param agentType - Agent type
   * @returns Preferred scoring path
   */
  async getPreferredPath(
    tenantId: string,
    agentType: 'categorizer' | 'matcher',
  ): Promise<ScoringPath> {
    // Try LearningRouter first (if available)
    if (this.learningRouter?.isAvailable()) {
      try {
        const decision = await this.learningRouter.selectPath({
          tenantId,
          agentType,
        });

        if (decision) {
          return decision.path;
        }
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        this.logger.warn(`LearningRouter failed, falling back: ${msg}`);
      }
    }

    // Try MultiModelRouter second
    try {
      const routerPath = await this.multiModelRouter.selectPath({
        tenantId,
        agentType,
      });

      if (
        routerPath === 'LLM_PRIMARY' ||
        routerPath === 'HEURISTIC_PRIMARY' ||
        routerPath === 'HYBRID'
      ) {
        return routerPath;
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.warn(`MultiModelRouter failed, using accuracy-based: ${msg}`);
    }

    // Fall back to accuracy-based recommendation
    const stats = await this.accuracyTracker.getAccuracy(tenantId, agentType);
    return stats.recommendation;
  }

  /**
   * Get the weight configuration for a scoring path.
   *
   * @param path - Scoring path
   * @returns Weight configuration (all paths have heuristic >= 0.2)
   */
  getWeightsForPath(path: ScoringPath): ScoringWeights {
    return { ...PATH_WEIGHTS[path] };
  }
}
