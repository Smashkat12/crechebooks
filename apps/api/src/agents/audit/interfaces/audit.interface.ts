/**
 * Audit Trail Interfaces
 * TASK-SDK-011: Structured Audit Trail & Decision Hooks
 *
 * @module agents/audit/interfaces/audit.interface
 * @description Type definitions for the unified database-backed audit trail.
 */

// ── Agent Types ─────────────────────────────────────────────────────

export const AgentType = {
  CATEGORIZER: 'categorizer',
  MATCHER: 'matcher',
  SARS: 'sars',
  VALIDATOR: 'validator',
  ORCHESTRATOR: 'orchestrator',
  REPORT_SYNTHESIS: 'report-synthesis',
} as const;

export type AgentType = (typeof AgentType)[keyof typeof AgentType];

// ── Event Types ─────────────────────────────────────────────────────

export const EventType = {
  DECISION: 'DECISION',
  ESCALATION: 'ESCALATION',
  CORRECTION: 'CORRECTION',
  WORKFLOW_START: 'WORKFLOW_START',
  WORKFLOW_END: 'WORKFLOW_END',
  VALIDATION: 'VALIDATION',
} as const;

export type EventType = (typeof EventType)[keyof typeof EventType];

// ── Decision Source ─────────────────────────────────────────────────

export const DecisionSource = {
  LLM: 'LLM',
  PATTERN: 'PATTERN',
  HISTORICAL: 'HISTORICAL',
  HYBRID: 'HYBRID',
  RULE_BASED: 'RULE_BASED',
  SDK: 'SDK',
  FALLBACK: 'FALLBACK',
} as const;

export type DecisionSource =
  (typeof DecisionSource)[keyof typeof DecisionSource];

// ── Log Parameters ──────────────────────────────────────────────────

export interface LogDecisionParams {
  tenantId: string;
  agentType: AgentType;
  transactionId?: string;
  workflowId?: string;
  decision: string;
  confidence?: number;
  source?: DecisionSource;
  autoApplied: boolean;
  details: Record<string, unknown>;
  reasoning?: string;
  durationMs?: number;
}

export interface LogEscalationParams {
  tenantId: string;
  agentType: AgentType;
  transactionId?: string;
  workflowId?: string;
  reason: string;
  details: Record<string, unknown>;
}

export interface LogWorkflowParams {
  tenantId: string;
  workflowId: string;
  eventType: 'WORKFLOW_START' | 'WORKFLOW_END';
  details: Record<string, unknown>;
  durationMs?: number;
}

// ── Query Filters ───────────────────────────────────────────────────

export interface AuditFilters {
  agentType?: AgentType;
  eventType?: EventType;
  dateFrom?: Date;
  dateTo?: Date;
  transactionId?: string;
  workflowId?: string;
  limit?: number;
  offset?: number;
}

// ── Statistics ──────────────────────────────────────────────────────

export interface EscalationStats {
  total: number;
  byAgent: Record<string, number>;
  byReason: Record<string, number>;
}

export interface AgentPerformanceStats {
  totalDecisions: number;
  avgConfidence: number;
  autoApplyRate: number;
  avgDurationMs: number;
  escalationRate: number;
}
