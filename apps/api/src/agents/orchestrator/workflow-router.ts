/**
 * Workflow Router
 * TASK-AGENT-005: Orchestrator Agent Setup
 *
 * @module agents/orchestrator/workflow-router
 * @description Routes workflow requests to appropriate agents based on type.
 * Determines autonomy level for each workflow.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  WorkflowType,
  AutonomyLevel,
} from './interfaces/orchestrator.interface';

/**
 * Workflow configuration
 */
export interface WorkflowConfig {
  type: WorkflowType;
  description: string;
  autonomyLevel: AutonomyLevel;
  agents: string[];
  isSequential: boolean;
}

@Injectable()
export class WorkflowRouter {
  private readonly logger = new Logger(WorkflowRouter.name);

  /**
   * Workflow configurations
   */
  private readonly workflows: Map<WorkflowType, WorkflowConfig> = new Map([
    [
      'CATEGORIZE_TRANSACTIONS',
      {
        type: 'CATEGORIZE_TRANSACTIONS',
        description: 'Categorize pending bank transactions',
        autonomyLevel: 'L3_FULL_AUTO',
        agents: ['transaction-categorizer'],
        isSequential: true,
      },
    ],
    [
      'MATCH_PAYMENTS',
      {
        type: 'MATCH_PAYMENTS',
        description: 'Match credit transactions to invoices',
        autonomyLevel: 'L3_FULL_AUTO',
        agents: ['payment-matcher'],
        isSequential: true,
      },
    ],
    [
      'CALCULATE_PAYE',
      {
        type: 'CALCULATE_PAYE',
        description: 'Calculate PAYE for an employee',
        autonomyLevel: 'L2_DRAFT', // SARS always L2
        agents: ['sars-agent'],
        isSequential: true,
      },
    ],
    [
      'GENERATE_EMP201',
      {
        type: 'GENERATE_EMP201',
        description: 'Generate EMP201 monthly declaration',
        autonomyLevel: 'L2_DRAFT', // SARS always L2
        agents: ['sars-agent'],
        isSequential: true,
      },
    ],
    [
      'GENERATE_VAT201',
      {
        type: 'GENERATE_VAT201',
        description: 'Generate VAT201 return',
        autonomyLevel: 'L2_DRAFT', // SARS always L2
        agents: ['sars-agent'],
        isSequential: true,
      },
    ],
    [
      'BANK_IMPORT',
      {
        type: 'BANK_IMPORT',
        description: 'Process bank import: categorize + match payments',
        autonomyLevel: 'L3_FULL_AUTO',
        agents: ['transaction-categorizer', 'payment-matcher'],
        isSequential: true,
      },
    ],
    [
      'MONTHLY_CLOSE',
      {
        type: 'MONTHLY_CLOSE',
        description: 'Full month-end processing',
        autonomyLevel: 'L2_DRAFT', // Mixed L2/L3 defaults to L2
        agents: ['transaction-categorizer', 'payment-matcher', 'sars-agent'],
        isSequential: true,
      },
    ],
  ]);

  /**
   * Get workflow configuration
   *
   * @param type - Workflow type
   * @returns Workflow configuration
   */
  getWorkflowConfig(type: WorkflowType): WorkflowConfig {
    const config = this.workflows.get(type);
    if (!config) {
      throw new Error(`Unknown workflow type: ${type}`);
    }
    return config;
  }

  /**
   * Get autonomy level for a workflow
   *
   * @param type - Workflow type
   * @returns Autonomy level
   */
  getAutonomyLevel(type: WorkflowType): AutonomyLevel {
    return this.getWorkflowConfig(type).autonomyLevel;
  }

  /**
   * Get agents required for a workflow
   *
   * @param type - Workflow type
   * @returns Array of agent names
   */
  getRequiredAgents(type: WorkflowType): string[] {
    return this.getWorkflowConfig(type).agents;
  }

  /**
   * Check if workflow should run agents sequentially
   *
   * @param type - Workflow type
   * @returns True if sequential
   */
  isSequential(type: WorkflowType): boolean {
    return this.getWorkflowConfig(type).isSequential;
  }

  /**
   * Check if workflow involves SARS operations
   *
   * @param type - Workflow type
   * @returns True if SARS-related
   */
  isSarsWorkflow(type: WorkflowType): boolean {
    return [
      'CALCULATE_PAYE',
      'GENERATE_EMP201',
      'GENERATE_VAT201',
      'MONTHLY_CLOSE',
    ].includes(type);
  }

  /**
   * Get all available workflow types
   *
   * @returns Array of workflow types
   */
  getAvailableWorkflows(): WorkflowType[] {
    return Array.from(this.workflows.keys());
  }

  /**
   * Log workflow routing decision
   */
  logRoutingDecision(type: WorkflowType, tenantId: string): void {
    const config = this.getWorkflowConfig(type);
    this.logger.log(
      `Routing workflow ${type} for tenant ${tenantId}: ` +
        `${config.agents.join(' -> ')} (${config.autonomyLevel})`,
    );
  }
}
