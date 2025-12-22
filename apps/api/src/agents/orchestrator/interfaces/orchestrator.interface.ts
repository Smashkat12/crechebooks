/**
 * Orchestrator Agent Interfaces
 * TASK-AGENT-005: Orchestrator Agent Setup
 *
 * @module agents/orchestrator/interfaces
 * @description TypeScript interfaces for the Orchestrator Agent.
 * All monetary values are in CENTS (integers).
 */

/**
 * Workflow types supported by the orchestrator
 */
export type WorkflowType =
  | 'CATEGORIZE_TRANSACTIONS' // Categorize pending transactions
  | 'MATCH_PAYMENTS' // Match credits to invoices
  | 'CALCULATE_PAYE' // Single PAYE calculation
  | 'GENERATE_EMP201' // EMP201 return
  | 'GENERATE_VAT201' // VAT201 return
  | 'BANK_IMPORT' // Categorize + Match
  | 'MONTHLY_CLOSE'; // Full month-end

/**
 * Autonomy levels for workflow execution
 */
export type AutonomyLevel = 'L1_SUGGEST' | 'L2_DRAFT' | 'L3_FULL_AUTO';

/**
 * Workflow execution status
 */
export type WorkflowStatus = 'COMPLETED' | 'PARTIAL' | 'ESCALATED' | 'FAILED';

/**
 * Request to execute a workflow
 */
export interface WorkflowRequest {
  type: WorkflowType;
  tenantId: string;
  parameters: Record<string, unknown>;
}

/**
 * Result of a single agent's work within a workflow
 */
export interface AgentResult {
  agent: string;
  processed: number;
  autoApplied: number;
  escalated: number;
  errors: number;
}

/**
 * Escalation entry from workflow execution
 */
export interface EscalationEntry {
  type: string;
  reason: string;
  details: Record<string, unknown>;
}

/**
 * Complete result of workflow execution
 */
export interface WorkflowResult {
  workflowId: string;
  type: WorkflowType;
  status: WorkflowStatus;
  autonomyLevel: AutonomyLevel;
  results: AgentResult[];
  escalations: EscalationEntry[];
  startedAt: string;
  completedAt: string;
}

/**
 * Decision log entry for orchestrator
 */
export interface OrchestratorDecisionLog {
  timestamp: string;
  agent: 'orchestrator';
  workflowId: string;
  type: WorkflowType;
  status: WorkflowStatus;
  autonomyLevel: AutonomyLevel;
  totalProcessed: number;
  totalAutoApplied: number;
  totalEscalated: number;
  durationMs: number;
}
