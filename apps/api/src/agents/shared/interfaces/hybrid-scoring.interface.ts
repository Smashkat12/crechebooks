/**
 * Hybrid Scoring System Interfaces
 * TASK-SDK-009: Hybrid Scoring System Implementation
 *
 * @module agents/shared/interfaces/hybrid-scoring.interface
 * @description Type definitions for the hybrid scoring system that combines
 * LLM confidence with heuristic confidence, tracks accuracy, and routes
 * to the most accurate scoring path.
 *
 * CRITICAL RULES:
 * - No PII in accuracy records (only agent type, prediction codes, confidence, correctness)
 * - Min 20% heuristic weight enforced in all paths
 * - 80% auto-apply threshold is a BUSINESS RULE - never dynamic
 */

/** Scoring path that determines the primary confidence source */
export type ScoringPath = 'LLM_PRIMARY' | 'HEURISTIC_PRIMARY' | 'HYBRID';

/** Recommendation for which scoring path to use based on accuracy data */
export type ScoringPathRecommendation = ScoringPath;

/** Weights applied to LLM and heuristic confidence scores */
export interface ScoringWeights {
  /** LLM confidence weight (0-1) */
  llm: number;
  /** Heuristic confidence weight (0-1, min 0.2 for financial ops) */
  heuristic: number;
}

/** Result of combining LLM and heuristic confidence scores */
export interface HybridScore {
  /** Combined score (0-100 integer) */
  score: number;
  /** Source of the score */
  source: 'HYBRID' | 'HEURISTIC_ONLY';
  /** Whether LLM confidence was available */
  llmAvailable: boolean;
  /** LLM confidence score, null if unavailable */
  llmScore: number | null;
  /** Heuristic confidence score */
  heuristicScore: number;
  /** SONA-selected weights for observability */
  sonaWeights?: ScoringWeights;
}

/** Input for recording an accuracy outcome */
export interface AccuracyOutcome {
  tenantId: string;
  agentType: 'categorizer' | 'matcher';
  llmPrediction: string;
  heuristicPrediction: string;
  actualOutcome: string;
  llmConfidence: number;
  heuristicConfidence: number;
  scoringPath: ScoringPath;
}

/** Stored accuracy record with computed correctness flags */
export interface AccuracyRecord extends AccuracyOutcome {
  id: string;
  llmCorrect: boolean;
  heuristicCorrect: boolean;
  createdAt: Date;
}

/** Aggregated accuracy statistics for a tenant/agent pair */
export interface AccuracyStats {
  /** LLM accuracy percentage (0-100) */
  llmAccuracy: number;
  /** Heuristic accuracy percentage (0-100) */
  heuristicAccuracy: number;
  /** Number of records used to compute stats */
  sampleSize: number;
  /** Recommended scoring path based on accuracy data */
  recommendation: ScoringPathRecommendation;
}
