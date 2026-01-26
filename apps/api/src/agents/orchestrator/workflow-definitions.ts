/**
 * SDK Workflow Definitions
 * TASK-SDK-007: OrchestratorAgent SDK Parent Agent Migration
 *
 * @module agents/orchestrator/workflow-definitions
 * @description Defines all SDK workflow configurations with step dependencies
 * and parallel execution flags. These definitions drive the SdkOrchestrator's
 * execution strategy (parallel vs sequential).
 *
 * CRITICAL RULES:
 * - SARS workflows ALWAYS use L2_DRAFT autonomy and containsSars=true
 * - BANK_IMPORT runs categorize + match in PARALLEL (no data dependency)
 * - MONTHLY_CLOSE runs SEQUENTIALLY (categorize -> match -> EMP201)
 * - Single-step workflows are NOT considered multi-step
 */

import { SdkWorkflowDefinition } from './interfaces/sdk-orchestrator.interface';
import { WorkflowType } from './interfaces/orchestrator.interface';

/**
 * All SDK workflow definitions keyed by WorkflowType.
 * Each definition specifies steps, dependencies, parallel flags,
 * and SARS containment for L2 enforcement.
 */
export const SDK_WORKFLOW_DEFINITIONS: Record<string, SdkWorkflowDefinition> = {
  CATEGORIZE_TRANSACTIONS: {
    workflowType: 'CATEGORIZE_TRANSACTIONS',
    description: 'Categorize pending bank transactions',
    autonomyLevel: 'L3_FULL_AUTO',
    containsSars: false,
    steps: [
      {
        stepId: 'categorize',
        agentType: 'transaction-categorizer',
        dependsOn: [],
        parallel: false,
      },
    ],
  },
  MATCH_PAYMENTS: {
    workflowType: 'MATCH_PAYMENTS',
    description: 'Match credit transactions to invoices',
    autonomyLevel: 'L3_FULL_AUTO',
    containsSars: false,
    steps: [
      {
        stepId: 'match',
        agentType: 'payment-matcher',
        dependsOn: [],
        parallel: false,
      },
    ],
  },
  CALCULATE_PAYE: {
    workflowType: 'CALCULATE_PAYE',
    description: 'Calculate PAYE for an employee',
    autonomyLevel: 'L2_DRAFT',
    containsSars: true,
    steps: [
      {
        stepId: 'paye',
        agentType: 'sars-agent',
        dependsOn: [],
        parallel: false,
      },
    ],
  },
  GENERATE_EMP201: {
    workflowType: 'GENERATE_EMP201',
    description: 'Generate EMP201 monthly declaration',
    autonomyLevel: 'L2_DRAFT',
    containsSars: true,
    steps: [
      {
        stepId: 'emp201',
        agentType: 'sars-agent',
        dependsOn: [],
        parallel: false,
      },
    ],
  },
  GENERATE_VAT201: {
    workflowType: 'GENERATE_VAT201',
    description: 'Generate VAT201 return',
    autonomyLevel: 'L2_DRAFT',
    containsSars: true,
    steps: [
      {
        stepId: 'vat201',
        agentType: 'sars-agent',
        dependsOn: [],
        parallel: false,
      },
    ],
  },
  BANK_IMPORT: {
    workflowType: 'BANK_IMPORT',
    description: 'Process bank import: categorize + match payments in parallel',
    autonomyLevel: 'L3_FULL_AUTO',
    containsSars: false,
    steps: [
      {
        stepId: 'categorize',
        agentType: 'transaction-categorizer',
        dependsOn: [],
        parallel: true,
      },
      {
        stepId: 'match',
        agentType: 'payment-matcher',
        dependsOn: [],
        parallel: true,
      },
    ],
  },
  MONTHLY_CLOSE: {
    workflowType: 'MONTHLY_CLOSE',
    description: 'Full month-end processing: categorize -> match -> EMP201',
    autonomyLevel: 'L2_DRAFT',
    containsSars: true,
    steps: [
      {
        stepId: 'categorize',
        agentType: 'transaction-categorizer',
        dependsOn: [],
        parallel: false,
      },
      {
        stepId: 'match',
        agentType: 'payment-matcher',
        dependsOn: ['categorize'],
        parallel: false,
      },
      {
        stepId: 'emp201',
        agentType: 'sars-agent',
        dependsOn: ['match'],
        parallel: false,
      },
    ],
  },
};

/**
 * Get workflow definition by type.
 * @param type - The workflow type to look up
 * @returns The SDK workflow definition, or undefined if not found
 */
export function getWorkflowDefinition(
  type: WorkflowType,
): SdkWorkflowDefinition | undefined {
  return SDK_WORKFLOW_DEFINITIONS[type];
}

/**
 * Check if a workflow type has multiple steps (benefits from SDK orchestration).
 * Single-step workflows do not need SDK orchestration.
 * @param type - The workflow type to check
 * @returns true if the workflow has more than one step
 */
export function isMultiStepWorkflow(type: WorkflowType): boolean {
  const def = SDK_WORKFLOW_DEFINITIONS[type];
  return def !== undefined && def.steps.length > 1;
}
