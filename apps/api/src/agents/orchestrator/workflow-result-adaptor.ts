/**
 * WorkflowResultAdaptor
 * TASK-SDK-007: OrchestratorAgent SDK Parent Agent Migration
 *
 * @module agents/orchestrator/workflow-result-adaptor
 * @description Converts SubagentResult[] to the existing WorkflowResult format.
 * This is the ONLY place where SDK result format is translated.
 * Downstream consumers NEVER see SDK internals.
 *
 * CRITICAL RULES:
 * - Output format MUST match the existing WorkflowResult interface exactly
 * - ALL monetary values are CENTS (integers)
 * - Status determination follows the same logic as orchestrator.agent.ts
 */

import { Injectable } from '@nestjs/common';
import {
  WorkflowResult,
  WorkflowType,
  AutonomyLevel,
  WorkflowStatus,
  AgentResult,
  EscalationEntry,
} from './interfaces/orchestrator.interface';
import { SubagentResult } from './interfaces/sdk-orchestrator.interface';

@Injectable()
export class WorkflowResultAdaptor {
  /**
   * Adapt SDK SubagentResult[] into the standard WorkflowResult format.
   *
   * @param workflowId - Unique workflow identifier
   * @param workflowType - The workflow type being executed
   * @param autonomyLevel - The effective autonomy level (SARS-enforced)
   * @param subagentResults - Array of results from individual subagent executions
   * @param startedAt - ISO timestamp when the workflow started
   * @returns A WorkflowResult matching the existing interface exactly
   */
  adapt(
    workflowId: string,
    workflowType: WorkflowType,
    autonomyLevel: AutonomyLevel,
    subagentResults: SubagentResult[],
    startedAt: string,
  ): WorkflowResult {
    const completedAt = new Date().toISOString();
    const results = this.mapAgentResults(subagentResults);
    const escalations = this.extractEscalations(subagentResults);
    const status = this.determineStatus(subagentResults, escalations, results);

    return {
      workflowId,
      type: workflowType,
      status,
      autonomyLevel,
      results,
      escalations,
      startedAt,
      completedAt,
    };
  }

  /**
   * Map SubagentResult[] to AgentResult[] for the WorkflowResult.
   * Each SubagentResult becomes one AgentResult entry.
   */
  private mapAgentResults(subResults: SubagentResult[]): AgentResult[] {
    return subResults.map((sr) => ({
      agent: sr.agentType,
      processed: sr.processed ?? 0,
      autoApplied: sr.autoApplied ?? 0,
      escalated: sr.escalated ?? 0,
      errors: sr.status === 'FAILED' ? 1 : (sr.errors ?? 0),
    }));
  }

  /**
   * Extract all escalation entries from subagent results.
   * Includes both explicit escalations and error-based escalations.
   */
  private extractEscalations(subResults: SubagentResult[]): EscalationEntry[] {
    const escalations: EscalationEntry[] = [];
    for (const sr of subResults) {
      if (sr.escalations) {
        escalations.push(...sr.escalations);
      }
      if (sr.status === 'FAILED' && sr.error) {
        escalations.push({
          type: 'WORKFLOW_ERROR',
          reason: sr.error,
          details: { agentType: sr.agentType },
        });
      }
    }
    return escalations;
  }

  /**
   * Determine the overall workflow status based on subagent results.
   * Follows the same logic as orchestrator.agent.ts:
   * - All failed -> FAILED
   * - Any failed -> PARTIAL
   * - Has escalations -> ESCALATED
   * - Has errors -> PARTIAL
   * - Otherwise -> COMPLETED
   */
  private determineStatus(
    subResults: SubagentResult[],
    escalations: EscalationEntry[],
    agentResults: AgentResult[],
  ): WorkflowStatus {
    const allFailed = subResults.every((sr) => sr.status === 'FAILED');
    if (allFailed) return 'FAILED';

    const anyFailed = subResults.some((sr) => sr.status === 'FAILED');
    if (anyFailed) return 'PARTIAL';

    if (
      escalations.length > 0 ||
      agentResults.some((r) => r.escalated > 0)
    ) {
      return 'ESCALATED';
    }

    if (agentResults.some((r) => r.errors > 0)) {
      return 'PARTIAL';
    }

    return 'COMPLETED';
  }
}
