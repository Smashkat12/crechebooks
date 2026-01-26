/**
 * Decision Logger for Payment Matcher Agent
 * TASK-AGENT-003: Payment Matcher Agent
 *
 * @module agents/payment-matcher/decision-logger
 * @description Logs matching decisions to .claude/logs/decisions.jsonl
 * and escalations to .claude/logs/escalations.jsonl.
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  MatchDecisionLog,
  MatchEscalationLog,
} from './interfaces/matcher.interface';
import { AuditTrailService } from '../audit/audit-trail.service';

@Injectable()
export class MatchDecisionLogger {
  private readonly logger = new Logger(MatchDecisionLogger.name);

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
   * Log a matching decision
   */
  async logDecision(
    entry: Omit<MatchDecisionLog, 'timestamp' | 'agent'>,
  ): Promise<void> {
    await this.ensureLogsDirectory();

    const fullEntry: MatchDecisionLog = {
      timestamp: new Date().toISOString(),
      agent: 'payment-matcher',
      ...entry,
    };

    try {
      await fs.appendFile(this.decisionsPath, JSON.stringify(fullEntry) + '\n');
      this.logger.debug(
        `Logged decision for ${entry.transactionId}: ${entry.decision} -> ${entry.invoiceNumber || 'none'}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to write decision log for ${entry.transactionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // TASK-SDK-011: Write to database audit trail (non-blocking)
    if (this.auditTrail) {
      this.auditTrail.logDecision({
        tenantId: entry.tenantId,
        agentType: 'matcher',
        transactionId: entry.transactionId,
        decision: entry.decision,
        confidence: entry.confidence,
        source: entry.source as 'LLM' | 'PATTERN' | 'HISTORICAL' | 'HYBRID' | 'RULE_BASED' | undefined,
        autoApplied: entry.autoApplied,
        details: {
          invoiceId: entry.invoiceId,
          invoiceNumber: entry.invoiceNumber,
          candidateCount: entry.candidateCount,
          transactionAmountCents: entry.transactionAmountCents,
        },
        reasoning: entry.reasoning,
        durationMs: entry.durationMs,
      }).catch((err: Error) => this.logger.warn(`Audit trail write failed: ${err.message}`));
    }
  }

  /**
   * Log an escalation for review
   */
  async logEscalation(
    tenantId: string,
    transactionId: string,
    type: MatchEscalationLog['type'],
    reason: string,
    candidateInvoiceIds: string[],
    candidateInvoiceNumbers: string[],
  ): Promise<void> {
    await this.ensureLogsDirectory();

    const entry: MatchEscalationLog = {
      timestamp: new Date().toISOString(),
      agent: 'payment-matcher',
      tenantId,
      transactionId,
      type,
      reason,
      candidateInvoiceIds,
      candidateInvoiceNumbers,
      status: 'pending',
    };

    try {
      await fs.appendFile(this.escalationsPath, JSON.stringify(entry) + '\n');
      this.logger.log(
        `Escalation logged for ${transactionId}: ${type} - ${reason}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to write escalation log for ${transactionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // TASK-SDK-011: Write escalation to database audit trail (non-blocking)
    if (this.auditTrail) {
      this.auditTrail.logEscalation({
        tenantId,
        agentType: 'matcher',
        transactionId,
        reason,
        details: { type, candidateInvoiceIds, candidateInvoiceNumbers },
      }).catch((err: Error) => this.logger.warn(`Audit escalation write failed: ${err.message}`));
    }
  }
}
