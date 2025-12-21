/**
 * Decision Logger for Payment Matcher Agent
 * TASK-AGENT-003: Payment Matcher Agent
 *
 * @module agents/payment-matcher/decision-logger
 * @description Logs matching decisions to .claude/logs/decisions.jsonl
 * and escalations to .claude/logs/escalations.jsonl.
 */

import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  MatchDecisionLog,
  MatchEscalationLog,
} from './interfaces/matcher.interface';

@Injectable()
export class MatchDecisionLogger {
  private readonly logger = new Logger(MatchDecisionLogger.name);
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
  }
}
