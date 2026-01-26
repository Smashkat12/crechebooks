/**
 * Decision Logger for Extraction Validator
 * TASK-AGENT-006
 *
 * Logs all validation decisions to .claude/logs/decisions.jsonl
 */
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ParsedBankStatement } from '../../database/entities/bank-statement-match.entity';
import { ValidationResult } from './interfaces/validator.interface';
import { AuditTrailService } from '../audit/audit-trail.service';

interface ValidationDecision {
  timestamp: string;
  agent: 'extraction-validator';
  decision: 'valid' | 'invalid' | 'corrected';
  tenantId: string;
  accountNumber?: string;
  periodStart?: string;
  periodEnd?: string;
  openingBalanceCents: number;
  closingBalanceCents: number;
  transactionCount: number;
  confidence: number;
  balanceReconciled: boolean;
  balanceDifference: number;
  flagCount: number;
  correctionCount: number;
  reasoning: string;
}

interface EscalationRecord {
  timestamp: string;
  agent: 'extraction-validator';
  type: 'extraction_invalid';
  tenantId: string;
  accountNumber?: string;
  periodStart?: string;
  periodEnd?: string;
  confidence: number;
  balanceDifference: number;
  flagCount: number;
  errorCodes: string[];
  reasoning: string;
}

@Injectable()
export class ExtractionDecisionLogger {
  private readonly logger = new Logger(ExtractionDecisionLogger.name);
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
   * Ensure logs directory exists
   */
  private async ensureLogsDir(): Promise<void> {
    try {
      await fs.mkdir(this.logsDir, { recursive: true });
    } catch (error) {
      this.logger.warn(`Could not create logs directory: ${error}`);
    }
  }

  /**
   * Append a line to a JSONL file
   */
  private async appendToJsonl(
    filename: string,
    data: ValidationDecision | EscalationRecord,
  ): Promise<void> {
    await this.ensureLogsDir();
    const filepath = path.join(this.logsDir, filename);
    const line = JSON.stringify(data) + '\n';

    try {
      await fs.appendFile(filepath, line, 'utf-8');
    } catch (error) {
      this.logger.warn(`Could not write to ${filename}: ${error}`);
    }
  }

  /**
   * Log a validation decision
   */
  async logValidation(
    tenantId: string,
    statement: ParsedBankStatement,
    result: ValidationResult,
  ): Promise<void> {
    let decision: ValidationDecision['decision'] = 'valid';
    if (!result.isValid) {
      decision = 'invalid';
    } else if (result.corrections.length > 0) {
      decision = 'corrected';
    }

    const record: ValidationDecision = {
      timestamp: new Date().toISOString(),
      agent: 'extraction-validator',
      decision,
      tenantId,
      accountNumber: statement.accountNumber,
      periodStart: statement.statementPeriod?.start?.toISOString(),
      periodEnd: statement.statementPeriod?.end?.toISOString(),
      openingBalanceCents: statement.openingBalanceCents,
      closingBalanceCents: statement.closingBalanceCents,
      transactionCount: statement.transactions.length,
      confidence: result.confidence,
      balanceReconciled: result.balanceReconciled,
      balanceDifference: result.balanceDifference,
      flagCount: result.flags.length,
      correctionCount: result.corrections.length,
      reasoning: result.reasoning,
    };

    await this.appendToJsonl('decisions.jsonl', record);

    this.logger.log(
      `Logged validation: decision=${decision}, confidence=${result.confidence}, ` +
        `reconciled=${result.balanceReconciled}, flags=${result.flags.length}`,
    );

    // TASK-SDK-011: Write to database audit trail (non-blocking)
    if (this.auditTrail) {
      this.auditTrail.logDecision({
        tenantId,
        agentType: 'validator',
        decision: decision,
        confidence: result.confidence,
        autoApplied: false,
        details: {
          balanceReconciled: result.balanceReconciled,
          flagCount: result.flags.length,
          correctionCount: result.corrections.length,
          transactionCount: statement.transactions.length,
        },
        reasoning: result.reasoning,
      }).catch((err: Error) => this.logger.warn(`Audit trail write failed: ${err.message}`));
    }
  }

  /**
   * Log an escalation for invalid extraction
   */
  async logEscalation(
    tenantId: string,
    statement: ParsedBankStatement,
    result: ValidationResult,
  ): Promise<void> {
    const errorCodes = result.flags
      .filter((f) => f.severity === 'ERROR')
      .map((f) => f.code);

    const record: EscalationRecord = {
      timestamp: new Date().toISOString(),
      agent: 'extraction-validator',
      type: 'extraction_invalid',
      tenantId,
      accountNumber: statement.accountNumber,
      periodStart: statement.statementPeriod?.start?.toISOString(),
      periodEnd: statement.statementPeriod?.end?.toISOString(),
      confidence: result.confidence,
      balanceDifference: result.balanceDifference,
      flagCount: result.flags.length,
      errorCodes,
      reasoning: result.reasoning,
    };

    await this.appendToJsonl('escalations.jsonl', record);

    this.logger.warn(
      `Logged escalation: tenant=${tenantId}, confidence=${result.confidence}, ` +
        `errors=${errorCodes.join(', ')}`,
    );

    // TASK-SDK-011: Write escalation to database audit trail (non-blocking)
    if (this.auditTrail) {
      this.auditTrail.logEscalation({
        tenantId,
        agentType: 'validator',
        reason: result.reasoning,
        details: {
          confidence: result.confidence,
          balanceDifference: result.balanceDifference,
          flagCount: result.flags.length,
          errorCodes,
        },
      }).catch((err: Error) => this.logger.warn(`Audit escalation write failed: ${err.message}`));
    }
  }
}
