/**
 * SONA Weight Adapter Interfaces
 * TASK-STUB-005: SONA Scorer Adapter (SonaEngine Weight Optimization)
 *
 * @module agents/shared/interfaces/sona-adapter.interface
 * @description Type definitions for the SONA weight adapter that wraps
 * ruvector's SonaEngine for trajectory-based weight optimization.
 *
 * CRITICAL RULES:
 * - Weights must sum to 1.0 and respect MIN_HEURISTIC_WEIGHT (0.2)
 * - No PII in trajectories (only tenantId, agentType, transactionType, amountBucket)
 * - All monetary values in cents (integers)
 */

/**
 * Weights returned by SONA scorer.
 * Must sum to 1.0 and respect MIN_HEURISTIC_WEIGHT (0.2).
 */
export interface SONAScorerWeights {
  llm: number;
  heuristic: number;
}

/**
 * Context provided to SONA for weight lookup.
 * Used to build the context embedding for pattern matching.
 */
export interface SonaWeightContext {
  tenantId: string;
  agentType: string;
  transactionType?: string;
  amountBucket?: string;
}

/**
 * Interface matching the SONAScorer stub contract in hybrid-scorer.ts.
 * SonaWeightAdapter implements this interface.
 */
export interface SONAScorerInterface {
  getOptimalWeights(
    context: SonaWeightContext,
  ): Promise<SONAScorerWeights | null>;
}

/**
 * Outcome data for recording a scoring trajectory.
 * Used by SonaWeightAdapter.recordOutcome().
 */
export interface TrajectoryOutcome {
  /** Whether the agent decision was correct (true) or corrected (false) */
  wasCorrect: boolean;
  /** Final hybrid confidence (0-100) */
  confidence: number;
  /** LLM component confidence (0-100) */
  llmConfidence: number;
  /** Heuristic component confidence (0-100) */
  heuristicConfidence: number;
}

/**
 * Configuration for the SONA weight adapter.
 */
export interface SonaAdapterConfig {
  /** MicroLoRA rank for instant adaptation (default: 2) */
  microLoraRank: number;
  /** Minimum quality threshold for patterns (default: 0.4) */
  qualityThreshold: number;
  /** Embedding dimension for context vectors (default: 256) */
  embeddingDimension: number;
  /** Number of patterns to search for (default: 5) */
  patternSearchK: number;
  /** Minimum patterns needed before adapting weights (default: 3) */
  minPatternsForAdaptation: number;
  /** Quality threshold above which LLM is favored (default: 0.6) */
  llmFavoredThreshold: number;
  /** Quality threshold below which heuristic is favored (default: 0.4) */
  heuristicFavoredThreshold: number;
}
