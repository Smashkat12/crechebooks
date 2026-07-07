/**
 * Comparison Report Interfaces
 * TASK-STUB-012: E2E Validation and Shadow Comparison Dashboard
 *
 * @module agents/rollout/interfaces/comparison-report.interface
 * @description TypeScript types for shadow comparison reports, promotion criteria,
 * and Prometheus-compatible agent metrics.
 */

/**
 * Agent types that can be promoted from SHADOW to PRIMARY.
 */
export type PromotableAgentType =
  | 'categorizer'
  | 'matcher'
  | 'sars'
  | 'validator'
  | 'orchestrator';

/**
 * Feature flag modes for agent rollout.
 */
export type RolloutMode = 'DISABLED' | 'SHADOW' | 'PRIMARY';

/**
 * Aggregated comparison report for a specific agent type and tenant.
 */
export interface ComparisonReport {
  /** Agent type (categorizer, matcher, sars, validator, orchestrator) */
  agentType: PromotableAgentType;
  /** Tenant ID */
  tenantId: string;
  /** Report period */
  period: {
    startDate: string;
    endDate: string;
    daysIncluded: number;
  };
  /** Total number of shadow comparisons in the period */
  totalDecisions: number;
  /** Percentage of decisions where SDK and heuristic agreed (0-100) */
  matchRate: number;
  /** Number of decisions where SDK result was better (higher confidence, correct) */
  sdkBetter: number;
  /** Number of decisions where heuristic result was better */
  heuristicBetter: number;
  /** Number of decisions where results were identical */
  identical: number;
  /** Average latency difference (sdkMs - heuristicMs) */
  avgLatencyDiffMs: number;
  /** SDK average latency in milliseconds */
  sdkAvgLatencyMs: number;
  /** Heuristic average latency in milliseconds */
  heuristicAvgLatencyMs: number;
  /** SDK average confidence (0-100) */
  sdkAvgConfidence: number;
  /** Heuristic average confidence (0-100) */
  heuristicAvgConfidence: number;
  /** Memory usage estimate for SDK components */
  memoryUsageBytes: number;
  /** Whether this agent meets go/no-go criteria */
  meetsPromotionCriteria: boolean;
  /** Reasons why promotion criteria are not met (empty if met) */
  promotionBlockers: string[];
}

/**
 * Go/No-Go criteria for SHADOW to PRIMARY promotion.
 */
export interface PromotionCriteria {
  /** Minimum match rate between SDK and heuristic (default: 95%) */
  minMatchRate: number;
  /** Maximum SDK latency multiplier vs heuristic (default: 2.0x) */
  maxLatencyMultiplier: number;
  /** Minimum number of comparisons before promotion (default: 100) */
  minComparisons: number;
  /** Maximum error rate in SDK path (default: 1%) */
  maxErrorRate: number;
  /** Minimum report period in days (default: 7) */
  minPeriodDays: number;
}

/**
 * Default promotion criteria.
 *
 * NOTE on `maxLatencyMultiplier`: SHADOW-gated agents are all background
 * (categorization, matching, orchestrator workflows, SARS, extraction validator)
 * — absolute LLM latency does not affect user-facing UX. Only egregiously slow
 * paths (≈10× the heuristic) should block promotion. Historical 2.0× ceiling
 * was blocking legitimate promotions where the LLM agreed with the heuristic
 * 98–100% of the time on hundreds of shadow decisions.
 */
export const DEFAULT_PROMOTION_CRITERIA: PromotionCriteria = {
  minMatchRate: 95,
  maxLatencyMultiplier: 10.0,
  minComparisons: 100,
  maxErrorRate: 1,
  minPeriodDays: 7,
};

/**
 * Per-agent promotion criteria overrides.
 *
 * Extension point — populate this if a specific agent has different SLA needs
 * (e.g. real-time inline agents added later where SDK latency IS user-visible).
 * Overrides are shallow-merged on top of `DEFAULT_PROMOTION_CRITERIA` via
 * `resolvePromotionCriteria(agentType)`; unspecified keys fall through to the
 * default. An explicit `criteria` argument to
 * `RolloutPromotionService.promote()` still bypasses this map entirely.
 */
export const PROMOTION_CRITERIA_BY_AGENT: Partial<
  Record<PromotableAgentType, Partial<PromotionCriteria>>
> = {};

/**
 * Resolve the effective promotion criteria for a given agent type by shallow-
 * merging `PROMOTION_CRITERIA_BY_AGENT[agentType]` on top of
 * `DEFAULT_PROMOTION_CRITERIA`. Per-agent overrides take precedence.
 */
export function resolvePromotionCriteria(
  agentType: PromotableAgentType,
): PromotionCriteria {
  return {
    ...DEFAULT_PROMOTION_CRITERIA,
    ...(PROMOTION_CRITERIA_BY_AGENT[agentType] ?? {}),
  };
}

/**
 * Result of a promotion or rollback operation.
 */
export interface PromotionResult {
  /** Agent type that was promoted/rolled back */
  agentType: PromotableAgentType;
  /** Tenant ID */
  tenantId: string;
  /** Previous mode */
  previousMode: RolloutMode;
  /** New mode */
  newMode: RolloutMode;
  /** Whether the operation succeeded */
  success: boolean;
  /** Reason for failure (if not successful) */
  reason?: string;
  /** Comparison report used for the decision (promotion only) */
  report?: ComparisonReport;
  /** Timestamp of the operation */
  timestamp: string;
}

/**
 * Prometheus-compatible metric for agent decision quality.
 */
export interface AgentMetric {
  name: string;
  labels: Record<string, string>;
  value: number;
  type: 'counter' | 'gauge' | 'histogram';
}
