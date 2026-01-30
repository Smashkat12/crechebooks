/**
 * Decision Logger for Report Synthesis Agent
 * TASK-REPORTS-001: AI Report Synthesis Agent
 *
 * @module agents/report-synthesis/decision-logger
 * @description Logs all synthesis decisions to .claude/logs/decisions.jsonl
 * and optionally to the database audit trail.
 *
 * CRITICAL RULES:
 * - NEVER blocks the main agent flow
 * - All errors are caught and logged (non-blocking)
 * - NO PII in audit records
 */

import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AuditTrailService } from '../audit/audit-trail.service';
import { AgentType, DecisionSource } from '../audit/interfaces/audit.interface';
import {
  ReportType,
  SynthesisDecisionLog,
} from './interfaces/synthesis.interface';

@Injectable()
export class SynthesisDecisionLogger {
  private readonly logger = new Logger(SynthesisDecisionLogger.name);
  private readonly logsDir: string;

  constructor(
    @Optional()
    @Inject(AuditTrailService)
    private readonly auditTrail?: AuditTrailService,
  ) {
    // Use .claude/logs directory relative to project root
    this.logsDir = path.join(process.cwd(), '.claude', 'logs');
  }

  /**
   * Ensure logs directory exists.
   * Non-blocking: errors are logged but never thrown.
   */
  private async ensureLogsDir(): Promise<void> {
    try {
      await fs.mkdir(this.logsDir, { recursive: true });
    } catch (error) {
      this.logger.warn(
        `Could not create logs directory: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Append a line to a JSONL file.
   * Non-blocking: errors are logged but never thrown.
   */
  private async appendToJsonl(
    filename: string,
    data: SynthesisDecisionLog,
  ): Promise<void> {
    await this.ensureLogsDir();
    const filepath = path.join(this.logsDir, filename);
    const line = JSON.stringify(data) + '\n';

    try {
      await fs.appendFile(filepath, line, 'utf-8');
    } catch (error) {
      this.logger.warn(
        `Could not write to ${filename}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Log a synthesis decision.
   * Writes to both JSONL file and database audit trail.
   * Non-blocking: errors are caught and logged.
   *
   * @param params - Decision parameters to log
   */
  async logSynthesis(params: {
    tenantId: string;
    reportType: ReportType;
    source: 'SDK' | 'FALLBACK';
    model?: string;
    confidenceScore: number;
    findingsCount: number;
    recommendationsCount: number;
    anomaliesCount: number;
    durationMs: number;
  }): Promise<void> {
    const record: SynthesisDecisionLog = {
      timestamp: new Date().toISOString(),
      agentType: 'report-synthesis',
      tenantId: params.tenantId,
      reportType: params.reportType,
      source: params.source,
      model: params.model,
      confidenceScore: params.confidenceScore,
      findingsCount: params.findingsCount,
      recommendationsCount: params.recommendationsCount,
      anomaliesCount: params.anomaliesCount,
      durationMs: params.durationMs,
    };

    // Write to JSONL file
    await this.appendToJsonl('decisions.jsonl', record);

    this.logger.log(
      `Logged synthesis: source=${params.source}, confidence=${String(params.confidenceScore)}, ` +
        `findings=${String(params.findingsCount)}, recommendations=${String(params.recommendationsCount)}, ` +
        `anomalies=${String(params.anomaliesCount)}, duration=${String(params.durationMs)}ms`,
    );

    // Write to database audit trail (non-blocking)
    if (this.auditTrail) {
      // Map synthesis source to audit DecisionSource
      const auditSource =
        params.source === 'SDK' ? DecisionSource.SDK : DecisionSource.FALLBACK;

      this.auditTrail
        .logDecision({
          tenantId: params.tenantId,
          agentType: AgentType.REPORT_SYNTHESIS,
          decision: `synthesize_${params.reportType.toLowerCase()}`,
          confidence: params.confidenceScore,
          source: auditSource,
          autoApplied: false, // Report synthesis never auto-applies
          durationMs: params.durationMs,
          details: {
            reportType: params.reportType,
            findingsCount: params.findingsCount,
            recommendationsCount: params.recommendationsCount,
            anomaliesCount: params.anomaliesCount,
            model: params.model,
          },
          reasoning: `Generated ${params.source} insights for ${params.reportType}`,
        })
        .catch((err: Error) =>
          this.logger.warn(`Audit trail write failed: ${err.message}`),
        );
    }
  }

  /**
   * Log a synthesis error or fallback.
   * Non-blocking: errors are caught and logged.
   *
   * @param params - Error parameters to log
   */
  async logError(params: {
    tenantId: string;
    reportType: ReportType;
    error: string;
    fellBackToRules: boolean;
  }): Promise<void> {
    const errorRecord = {
      timestamp: new Date().toISOString(),
      agentType: 'report-synthesis',
      tenantId: params.tenantId,
      reportType: params.reportType,
      error: params.error,
      fellBackToRules: params.fellBackToRules,
    };

    await this.ensureLogsDir();
    const filepath = path.join(this.logsDir, 'errors.jsonl');
    const line = JSON.stringify(errorRecord) + '\n';

    try {
      await fs.appendFile(filepath, line, 'utf-8');
    } catch (error) {
      this.logger.warn(
        `Could not write error log: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    this.logger.warn(
      `Logged synthesis error: tenant=${params.tenantId}, report=${params.reportType}, ` +
        `error=${params.error}, fallback=${String(params.fellBackToRules)}`,
    );

    // Write to database audit trail as escalation (non-blocking)
    if (this.auditTrail) {
      this.auditTrail
        .logEscalation({
          tenantId: params.tenantId,
          agentType: AgentType.REPORT_SYNTHESIS,
          reason: params.error,
          details: {
            reportType: params.reportType,
            fellBackToRules: params.fellBackToRules,
          },
        })
        .catch((err: Error) =>
          this.logger.warn(`Audit escalation write failed: ${err.message}`),
        );
    }
  }
}
