/**
 * Decision Logger for Transaction Categorizer Agent
 * TASK-AGENT-002: Transaction Categorizer Agent
 *
 * @module agents/transaction-categorizer/decision-logger
 * @description Logs decisions to .claude/logs/decisions.jsonl and escalations
 * to .claude/logs/escalations.jsonl. These files are gitignored.
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  DecisionLogEntry,
  EscalationLogEntry,
} from './interfaces/categorizer.interface';
import { AuditTrailService } from '../audit/audit-trail.service';

@Injectable()
export class DecisionLogger {
  private readonly logger = new Logger(DecisionLogger.name);

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
   * Log a categorization decision
   *
   * @param entry - Decision log entry (timestamp and agent added automatically)
   */
  async log(
    entry: Omit<DecisionLogEntry, 'timestamp' | 'agent'>,
  ): Promise<void> {
    await this.ensureLogsDirectory();

    const fullEntry: DecisionLogEntry = {
      timestamp: new Date().toISOString(),
      agent: 'transaction-categorizer',
      ...entry,
    };

    try {
      await fs.appendFile(this.decisionsPath, JSON.stringify(fullEntry) + '\n');
      this.logger.debug(
        `Logged decision for ${entry.transactionId}: ${entry.decision} -> ${entry.accountCode}`,
      );
    } catch (error) {
      // Log error but don't throw - logging is non-critical
      this.logger.error(
        `Failed to write decision log for ${entry.transactionId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // TASK-SDK-011: Write to database audit trail (non-blocking)
    if (this.auditTrail) {
      this.auditTrail
        .logDecision({
          tenantId: entry.tenantId,
          agentType: 'categorizer',
          transactionId: entry.transactionId,
          decision: entry.decision,
          confidence: entry.confidence,
          source: entry.source as
            | 'LLM'
            | 'PATTERN'
            | 'HISTORICAL'
            | 'HYBRID'
            | 'RULE_BASED'
            | undefined,
          autoApplied: entry.autoApplied,
          details: {
            accountCode: entry.accountCode,
            accountName: entry.accountName,
            patternId: entry.patternId,
          },
          reasoning: entry.reasoning,
          durationMs: entry.durationMs,
        })
        .catch((err: Error) =>
          this.logger.warn(`Audit trail write failed: ${err.message}`),
        );
    }
  }

  /**
   * Log an escalation for review
   *
   * @param tenantId - Tenant ID
   * @param transactionId - Transaction ID
   * @param type - Type of escalation
   * @param reason - Reason for escalation
   * @param suggestedAccount - Suggested account code if any
   * @param suggestedAccountName - Suggested account name if any
   * @param confidence - Confidence score if any
   */
  async logEscalation(
    tenantId: string,
    transactionId: string,
    type: EscalationLogEntry['type'],
    reason: string,
    suggestedAccount?: string,
    suggestedAccountName?: string,
    confidence?: number,
  ): Promise<void> {
    await this.ensureLogsDirectory();

    const entry: EscalationLogEntry = {
      timestamp: new Date().toISOString(),
      agent: 'transaction-categorizer',
      tenantId,
      transactionId,
      type,
      reason,
      suggestedAccount,
      suggestedAccountName,
      confidence,
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
      this.auditTrail
        .logEscalation({
          tenantId,
          agentType: 'categorizer',
          transactionId,
          reason,
          details: { type, suggestedAccount, suggestedAccountName, confidence },
        })
        .catch((err: Error) =>
          this.logger.warn(`Audit escalation write failed: ${err.message}`),
        );
    }
  }

  /**
   * Read recent decisions for a tenant (for debugging/auditing)
   */
  async getRecentDecisions(
    tenantId: string,
    limit: number = 100,
  ): Promise<DecisionLogEntry[]> {
    try {
      const content = await fs.readFile(this.decisionsPath, 'utf-8');
      const lines = content.trim().split('\n');
      const entries: DecisionLogEntry[] = [];

      for (const line of lines) {
        if (!line) continue;
        try {
          const entry = JSON.parse(line) as DecisionLogEntry;
          if (entry.tenantId === tenantId) {
            entries.push(entry);
          }
        } catch {
          // Skip malformed lines
        }
      }

      // Return most recent first, limited
      return entries.slice(-limit).reverse();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Read pending escalations for a tenant
   */
  async getPendingEscalations(tenantId: string): Promise<EscalationLogEntry[]> {
    try {
      const content = await fs.readFile(this.escalationsPath, 'utf-8');
      const lines = content.trim().split('\n');
      const entries: EscalationLogEntry[] = [];

      for (const line of lines) {
        if (!line) continue;
        try {
          const entry = JSON.parse(line) as EscalationLogEntry;
          if (entry.tenantId === tenantId && entry.status === 'pending') {
            entries.push(entry);
          }
        } catch {
          // Skip malformed lines
        }
      }

      return entries;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}
