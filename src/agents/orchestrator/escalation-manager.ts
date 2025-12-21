/**
 * Escalation Manager
 * TASK-AGENT-005: Orchestrator Agent Setup
 *
 * @module agents/orchestrator/escalation-manager
 * @description Manages escalations from workflow execution.
 * Logs escalations and tracks pending items requiring review.
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  EscalationEntry,
  WorkflowType,
} from './interfaces/orchestrator.interface';

/**
 * Full escalation record with workflow context
 */
export interface EscalationRecord {
  timestamp: string;
  workflowId: string;
  workflowType: WorkflowType;
  tenantId: string;
  escalationType: string;
  reason: string;
  details: Record<string, unknown>;
  status: 'pending' | 'reviewed' | 'resolved';
  priority: 'low' | 'medium' | 'high' | 'critical';
}

@Injectable()
export class EscalationManager {
  private readonly logger = new Logger(EscalationManager.name);
  private readonly escalationsPath = path.join(
    process.cwd(),
    '.claude/logs/escalations.jsonl',
  );
  private initialized = false;

  /**
   * Ensure logs directory exists
   */
  private async ensureLogsDirectory(): Promise<void> {
    if (this.initialized) return;

    try {
      const logsDir = path.dirname(this.escalationsPath);
      await fs.mkdir(logsDir, { recursive: true });
      this.initialized = true;
    } catch (error) {
      this.logger.error(
        `Failed to create logs directory: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Log an escalation from workflow execution
   *
   * @param workflowId - Workflow identifier
   * @param workflowType - Type of workflow
   * @param tenantId - Tenant identifier
   * @param escalation - Escalation entry
   */
  async logEscalation(
    workflowId: string,
    workflowType: WorkflowType,
    tenantId: string,
    escalation: EscalationEntry,
  ): Promise<void> {
    await this.ensureLogsDirectory();

    const priority = this.determinePriority(escalation.type, workflowType);

    const record: EscalationRecord = {
      timestamp: new Date().toISOString(),
      workflowId,
      workflowType,
      tenantId,
      escalationType: escalation.type,
      reason: escalation.reason,
      details: escalation.details,
      status: 'pending',
      priority,
    };

    try {
      await fs.appendFile(this.escalationsPath, JSON.stringify(record) + '\n');
      this.logger.log(
        `Escalation logged [${priority.toUpperCase()}]: ${escalation.type} - ${escalation.reason}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to write escalation log: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Log multiple escalations from a workflow
   *
   * @param workflowId - Workflow identifier
   * @param workflowType - Type of workflow
   * @param tenantId - Tenant identifier
   * @param escalations - Array of escalation entries
   */
  async logMultipleEscalations(
    workflowId: string,
    workflowType: WorkflowType,
    tenantId: string,
    escalations: EscalationEntry[],
  ): Promise<void> {
    for (const escalation of escalations) {
      await this.logEscalation(workflowId, workflowType, tenantId, escalation);
    }
  }

  /**
   * Determine priority based on escalation type and workflow
   */
  private determinePriority(
    escalationType: string,
    workflowType: WorkflowType,
  ): 'low' | 'medium' | 'high' | 'critical' {
    // SARS escalations are always high priority
    if (escalationType.startsWith('SARS_')) {
      return 'high';
    }

    // Workflow errors are critical
    if (escalationType === 'WORKFLOW_ERROR') {
      return 'critical';
    }

    // Ambiguous matches need attention
    if (escalationType === 'AMBIGUOUS_MATCH') {
      return 'medium';
    }

    // Low confidence items are lower priority
    if (escalationType.includes('LOW_CONFIDENCE')) {
      return 'low';
    }

    // Month-end escalations are higher priority
    if (workflowType === 'MONTHLY_CLOSE') {
      return 'high';
    }

    return 'medium';
  }

  /**
   * Get summary of pending escalations by type
   */
  async getPendingSummary(tenantId: string): Promise<Map<string, number>> {
    const summary = new Map<string, number>();

    try {
      const content = await fs.readFile(this.escalationsPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const record = JSON.parse(line) as EscalationRecord;
          if (record.tenantId === tenantId && record.status === 'pending') {
            const count = summary.get(record.escalationType) || 0;
            summary.set(record.escalationType, count + 1);
          }
        } catch {
          // Skip invalid lines
        }
      }
    } catch {
      // File may not exist yet
    }

    return summary;
  }

  /**
   * Check if there are any critical escalations pending
   */
  async hasCriticalEscalations(tenantId: string): Promise<boolean> {
    try {
      const content = await fs.readFile(this.escalationsPath, 'utf-8');
      const lines = content.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const record = JSON.parse(line) as EscalationRecord;
          if (
            record.tenantId === tenantId &&
            record.status === 'pending' &&
            record.priority === 'critical'
          ) {
            return true;
          }
        } catch {
          // Skip invalid lines
        }
      }
    } catch {
      // File may not exist
    }

    return false;
  }
}
