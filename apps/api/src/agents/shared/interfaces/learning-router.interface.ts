/**
 * Learning Router Interfaces
 * TASK-STUB-003: LearningEngine Router Replacement
 *
 * @module agents/shared/interfaces/learning-router.interface
 * @description Type definitions for the LearningRouter that wraps ruvector's
 * LearningEngine with CrecheBooks routing interface. Provides reinforcement
 * learning-based routing decisions for scoring paths.
 *
 * State key format: {tenantId}:{agentType}:{contextHash}
 * Reward signals: +1.0 correct, -0.5 corrected, +0.5 partial, 0.0 unknown
 */

import type { ScoringPath, ScoringWeights } from './hybrid-scoring.interface';

/** State representation for routing decisions */
export interface RoutingState {
  /** Tenant ID — learning is tenant-scoped */
  tenantId: string;
  /** Agent type — categorizer or matcher */
  agentType: 'categorizer' | 'matcher';
  /** Optional context hash for sub-grouping (e.g., transaction type) */
  contextHash?: string;
}

/** Result of a routing decision from the LearningEngine */
export interface RoutingDecision {
  /** Selected scoring path */
  path: ScoringPath;
  /** Confidence in this decision (0-1) from RL Q-values */
  confidence: number;
  /** Weight configuration for this path */
  weights: ScoringWeights;
  /** Source of the decision */
  source: 'LEARNING_ENGINE' | 'ACCURACY_TRACKER' | 'DEFAULT';
  /** State key used for this decision (for reward tracking) */
  stateKey: string;
}

/** Reward signal to send after observing an outcome */
export interface RoutingRewardSignal {
  /** Context that produced the original decision */
  context: RoutingState;
  /** Action that was taken (the scoring path) */
  action: ScoringPath;
  /** Reward value:
   *   +1.0 = correct (no correction)
   *   -0.5 = corrected by human
   *   +0.5 = partially correct
   *    0.0 = unknown */
  reward: number;
  /** Optional next context (for multi-step episodes) */
  nextContext?: RoutingState;
  /** Whether this is a terminal state (default: true) */
  done?: boolean;
}

/** Full interface for the LearningRouter */
export interface LearningRouterInterface {
  selectPath(context: RoutingState): Promise<RoutingDecision | null>;
  getOptimalWeights(context: RoutingState): Promise<ScoringWeights | null>;
  recordReward(signal: RoutingRewardSignal): Promise<void>;
  getQValues(context: RoutingState): Promise<Record<string, number> | null>;
  isAvailable(): boolean;
}
