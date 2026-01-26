/**
 * SARS Decision Logger
 * TASK-AGENT-004: SARS Calculation Agent
 *
 * @module agents/sars-agent/decision-logger
 * @description Logs SARS decisions and escalations to .claude/logs/*.jsonl.
 * All SARS submissions require human review (L2 autonomy).
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  SarsDecisionLog,
  SarsEscalationLog,
} from './interfaces/sars.interface';
import { AuditTrailService } from '../audit/audit-trail.service';

@Injectable()
export class SarsDecisionLogger {
  private readonly logger = new Logger(SarsDecisionLogger.name);

  constructor(
    @Optional()
    @Inject(AuditTrailService)
    private readonly auditTrail?: AuditTrailService,
  ) {}
  private readonly logsPath = path.join(process.cwd(), '.claude/logs');
  private readonly decisionsPath = path.join(this.logsPath, 'decisions.jsonl');
  private readonly escalationsPath = path.join(
    this.logsPath,
    'escalations.jsonl',
  );
  private initialized = false;

  /**
   * Ensure logs directory exists
   */
  private async ensureLogsDirectory(): Promise<void> {
    if (this.initialized) return;

    try {
      await fs.mkdir(this.logsPath, { recursive: true });
      this.initialized = true;
    } catch (error) {
      this.logger.error(
        `Failed to create logs directory: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Log a SARS calculation decision
   */
  async logDecision(
    tenantId: string,
    type: SarsDecisionLog['type'],
    period: string,
    amountCents: number,
    reasoning: string,
  ): Promise<void> {
    await this.ensureLogsDirectory();

    const entry: SarsDecisionLog = {
      timestamp: new Date().toISOString(),
      agent: 'sars-agent',
      tenantId,
      type,
      period,
      amountCents,
      autoApplied: false, // SARS is NEVER auto-applied
      reasoning,
    };

    try {
      await fs.appendFile(this.decisionsPath, JSON.stringify(entry) + '\n');
      this.logger.debug(
        `Logged SARS decision for ${type} period ${period}: R${(amountCents / 100).toFixed(2)}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to write SARS decision log: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // TASK-SDK-011: Write to database audit trail (non-blocking)
    if (this.auditTrail) {
      this.auditTrail
        .logDecision({
          tenantId,
          agentType: 'sars',
          decision: type,
          autoApplied: false,
          details: { type, period, amountCents },
          reasoning,
        })
        .catch((err: Error) =>
          this.logger.warn(`Audit trail write failed: ${err.message}`),
        );
    }
  }

  /**
   * Log an escalation for SARS submission review
   * All SARS submissions require human approval
   */
  async logEscalation(
    tenantId: string,
    subType: SarsEscalationLog['subType'],
    period: string,
    reason: string,
    amountCents: number,
  ): Promise<void> {
    await this.ensureLogsDirectory();

    const entry: SarsEscalationLog = {
      timestamp: new Date().toISOString(),
      agent: 'sars-agent',
      tenantId,
      type: 'SARS_SUBMISSION',
      subType,
      period,
      amountCents,
      reason,
      status: 'pending',
      requiresHumanApproval: true,
    };

    try {
      await fs.appendFile(this.escalationsPath, JSON.stringify(entry) + '\n');
      this.logger.log(
        `SARS escalation logged: ${subType} for period ${period} - ${reason}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to write SARS escalation log: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // TASK-SDK-011: Write escalation to database audit trail (non-blocking)
    if (this.auditTrail) {
      this.auditTrail
        .logEscalation({
          tenantId,
          agentType: 'sars',
          reason,
          details: {
            subType,
            period,
            amountCents,
            requiresHumanApproval: true,
          },
        })
        .catch((err: Error) =>
          this.logger.warn(`Audit escalation write failed: ${err.message}`),
        );
    }
  }
}
