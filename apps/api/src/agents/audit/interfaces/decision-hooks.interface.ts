/**
 * Decision Hooks Interfaces
 * TASK-STUB-008: Decision Hooks SONA Wiring (Pre/Post Decision Lifecycle)
 *
 * @module agents/audit/interfaces/decision-hooks.interface
 * @description Type definitions for the decision lifecycle hooks.
 * Pre-decision hooks validate against correction history.
 * Post-decision hooks record SONA trajectories and audit data.
 *
 * CRITICAL RULES:
 * - Pre-decision hooks are ADVISORY ONLY (allowed is always true)
 * - Post-decision hooks are NON-BLOCKING (fire-and-forget)
 * - No PII in any interfaces — only IDs, codes, confidence, correctness
 */

// ── Pre-Decision Types ──────────────────────────────────────────────

/**
 * Context for pre-decision validation.
 */
export interface PreDecisionContext {
  tenantId: string;
  agentType: string;
  /** Sanitized input text for semantic similarity check */
  inputText?: string;
  /** Transaction ID being processed */
  transactionId?: string;
  /** Payee name being categorized */
  payeeName?: string;
  /** Amount in cents */
  amountCents?: number;
  /** Credit or debit */
  isCredit?: boolean;
}

/**
 * Warning generated during pre-decision validation.
 */
export interface PreDecisionWarning {
  /** Warning code for programmatic handling */
  code: string;
  /** Human-readable warning message */
  message: string;
  /** Number of corrections found (if applicable) */
  correctionCount?: number;
  /** Recent correction details (if applicable) */
  recentCorrections?: Array<{
    decisionId: string;
    correctedAt: string;
    originalCode: string;
    correctedCode: string;
  }>;
}

/**
 * Result from pre-decision validation hook.
 */
export interface PreDecisionResult {
  /** Always true — hooks are advisory, never blocking */
  allowed: boolean;
  /** Warnings to attach to the decision context */
  warnings: PreDecisionWarning[];
  /** Confidence adjustment (negative = reduce confidence) */
  confidenceAdjustment: number;
}

// ── Post-Decision Types ─────────────────────────────────────────────

/**
 * Context for post-decision trajectory recording.
 */
export interface PostDecisionContext {
  tenantId: string;
  agentType: string;
  /** The decision made (e.g., account code assigned) */
  decision: string;
  /** Final confidence score (0-100) */
  confidence: number;
  /** Decision source */
  source: string;
  /** Whether the decision was auto-applied */
  autoApplied: boolean;
  /** Account code assigned */
  accountCode?: string;
  /** Transaction ID */
  transactionId?: string;
  /** LLM reasoning text */
  reasoning?: string;
  /** LLM component confidence (0-100) */
  llmConfidence?: number;
  /** Heuristic component confidence (0-100) */
  heuristicConfidence?: number;
  /** Whether credit or debit */
  isCredit?: boolean;
  /** Amount bucket for SONA context */
  amountBucket?: string;
  /** Processing duration in ms */
  durationMs?: number;
  /** Whether the decision was correct (may be set later via correction) */
  wasCorrect?: boolean;
}

// ── Correction History ──────────────────────────────────────────────

/**
 * A correction history match from the audit log.
 */
export interface CorrectionHistoryMatch {
  decisionId: string;
  correctedAt: string;
  originalCode: string;
  correctedCode: string;
}

// ── Hook Interface ──────────────────────────────────────────────────

/**
 * Interface for decision lifecycle hooks.
 * Implemented by RealDecisionHooks (production) and the legacy
 * AgenticFlowHooksStub (fallback).
 */
export interface DecisionHooksInterface {
  /**
   * Pre-decision hook: validate against correction history.
   * MUST be fail-open (allowed=true on error).
   * MUST be non-blocking.
   */
  preDecision(context: PreDecisionContext): Promise<PreDecisionResult>;

  /**
   * Post-decision hook: record SONA trajectory and audit data.
   * MUST be non-blocking — all operations fire-and-forget.
   */
  postDecision(context: PostDecisionContext): Promise<void>;
}
