/**
 * SDK Orchestrator Interfaces
 * TASK-SDK-007: OrchestratorAgent SDK Parent Agent Migration
 *
 * @module agents/orchestrator/interfaces/sdk-orchestrator.interface
 * @description TypeScript interfaces for the SDK-enhanced orchestrator.
 * These types are used exclusively by the SdkOrchestrator and
 * WorkflowResultAdaptor. Downstream consumers never see these types;
 * they always receive the standard WorkflowResult.
 */

/** Context passed to each subagent — context-isolated per step */
export interface SubagentContext {
  tenantId: string;
  workflowId: string;
  stepId: string;
  agentType: string;
  input: Record<string, unknown>;
}

/** Result from a subagent execution */
export interface SubagentResult {
  status: 'SUCCESS' | 'FAILED';
  agentType: string;
  data?: Record<string, unknown>;
  error?: string;
  durationMs: number;
  /** Items processed/applied/escalated for WorkflowResult mapping */
  processed?: number;
  autoApplied?: number;
  escalated?: number;
  errors?: number;
  escalations?: Array<{
    type: string;
    reason: string;
    details: Record<string, unknown>;
  }>;
}

/** Workflow step definition with dependency info */
export interface WorkflowStepDefinition {
  stepId: string;
  agentType: string;
  /** Step IDs that must complete before this step can run */
  dependsOn: string[];
  /** Whether this step can run in parallel with siblings */
  parallel: boolean;
}

/** Complete workflow definition with all steps */
export interface SdkWorkflowDefinition {
  workflowType: string; // matches WorkflowType
  description: string;
  autonomyLevel: string; // matches AutonomyLevel
  steps: WorkflowStepDefinition[];
  /** Whether the overall workflow contains SARS steps */
  containsSars: boolean;
}

/** Agent routing decision from ruvector */
export interface AgentRoutingDecision {
  agentType: string;
  confidence: number;
  autonomyLevel: string;
  reasoning: string;
}

/** agentic-flow execution result (stub type for future integration) */
export interface AgenticFlowExecutionResult {
  executionId: string;
  steps: AgenticFlowStep[];
  allSucceeded: boolean;
  anySucceeded: boolean;
  startedAt: string;
  completedAt: string;
}

/** Single step result from agentic-flow */
export interface AgenticFlowStep {
  stepId: string;
  agentType: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  itemsProcessed?: number;
  itemsAutoApplied?: number;
  itemsEscalated?: number;
  errors?: string[];
  escalations?: Array<{
    type: string;
    reason: string;
    details: Record<string, unknown>;
  }>;
  durationMs: number;
}
