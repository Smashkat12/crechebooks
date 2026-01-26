/**
 * Feedback Loop Interfaces
 * TASK-STUB-004: FeedbackLoop Real Integration
 *
 * @module agents/memory/interfaces/feedback-loop.interface
 * @description Type definitions for the real feedback loop that propagates
 * human corrections to learning subsystems (LearningEngine, SONA).
 *
 * CRITICAL RULES:
 * - No PII in feedback data (only IDs, codes, confidence, correctness)
 * - All monetary values are CENTS (integers)
 * - Tenant isolation: tenantId required in all FeedbackData
 */

import type { PatternLearnResult } from './agent-memory.interface';

/** Data received from a correction event */
export interface FeedbackData {
  /** Tenant ID for scoping */
  tenantId: string;
  /** ID of the original agent decision that was corrected */
  agentDecisionId: string;
  /** The original (incorrect) decision value */
  originalValue: unknown;
  /** The human-corrected value */
  correctedValue: unknown;
  /** Who made the correction (user ID) */
  correctedBy?: string;
  /** Reason for the correction */
  reason?: string;
  /** The original decision metadata (includes source, confidence, etc.) */
  originalDecision?: {
    source: string;
    confidence: number;
    agentType: string;
  };
  /** Pattern learning result from PatternLearner (already processed) */
  patternResult?: PatternLearnResult;
}

/** Which learning subsystems received the feedback */
export type FeedbackTarget =
  | 'LEARNING_ENGINE'
  | 'FAST_AGENT_DB'
  | 'REFLEXION_MEMORY'
  | 'SONA_ENGINE';

/** Result of processing feedback through all subsystems */
export interface FeedbackResult {
  /** Whether feedback was processed (always true, even if all targets failed) */
  processed: boolean;
  /** Which targets received the feedback successfully */
  targets: FeedbackTarget[];
  /** Errors from failed targets (empty if all succeeded) */
  errors?: string[];
}

/** Full interface for the feedback loop */
export interface FeedbackLoopInterface {
  processFeedback(data: FeedbackData): Promise<FeedbackResult>;
}

/**
 * Interface for optional SONA engine integration.
 * SonaEngine is from ruvector -- not yet integrated (TASK-STUB-005).
 * This interface is forward-compatible.
 */
export interface SonaEngineInterface {
  beginTrajectory(embedding: number[]): Promise<string>;
  addStep(
    trajectoryId: string,
    step: { state: unknown; action: string; reward: number },
  ): Promise<void>;
  endTrajectory(trajectoryId: string, quality: number): Promise<void>;
}
