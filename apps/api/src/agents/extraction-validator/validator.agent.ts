/**
 * Extraction Validator Agent
 * TASK-AGENT-006
 *
 * Validates PDF extraction quality before transaction import.
 * Detects OCR errors by checking:
 * 1. Balance reconciliation (opening + transactions = closing)
 * 2. Amount sanity (reasonable ranges)
 * 3. Common OCR error patterns
 *
 * CRITICAL: This agent sits between PDF parsing and transaction import.
 * Invalid extractions are escalated for human review.
 */
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import { ParsedBankStatement } from '../../database/entities/bank-statement-match.entity';
import { BalanceReconciler } from './balance-reconciler';
import { AmountSanityChecker } from './amount-sanity-checker';
import { ExtractionDecisionLogger } from './decision-logger';
import {
  ValidationResult,
  Correction,
  ValidationFlag,
  ValidatedBankStatement,
} from './interfaces/validator.interface';
import type { SemanticValidationResult } from './interfaces/sdk-validator.interface';
import { SdkSemanticValidator } from './sdk-validator';
import { ShadowRunner } from '../rollout/shadow-runner';

// Confidence thresholds
const THRESHOLDS = {
  AUTO_ACCEPT: 90, // >= 90% = auto-accept
  REVIEW_REQUIRED: 50, // 50-89% = needs review but usable
  REJECT: 50, // < 50% = reject completely
};

@Injectable()
export class ExtractionValidatorAgent {
  private readonly logger = new Logger(ExtractionValidatorAgent.name);

  constructor(
    private readonly balanceReconciler: BalanceReconciler,
    private readonly sanityChecker: AmountSanityChecker,
    private readonly decisionLogger: ExtractionDecisionLogger,
    @Optional()
    @Inject(SdkSemanticValidator)
    private readonly sdkValidator?: SdkSemanticValidator,
    @Optional()
    @Inject(ShadowRunner)
    private readonly shadowRunner?: ShadowRunner,
  ) {}

  /**
   * Validate a parsed bank statement
   * Returns validation result with confidence score, flags, and suggested corrections
   */
  async validate(
    statement: ParsedBankStatement,
    tenantId: string,
  ): Promise<ValidationResult> {
    this.logger.log(
      `Validating statement: account=${statement.accountNumber}, ` +
        `opening=${statement.openingBalanceCents}c, closing=${statement.closingBalanceCents}c, ` +
        `transactions=${statement.transactions.length}`,
    );

    const flags: ValidationFlag[] = [];
    const corrections: Correction[] = [];
    let confidence = 0;

    // 1. Balance reconciliation (40 points max)
    const reconciliation = this.balanceReconciler.reconcile(statement);
    if (reconciliation.reconciled) {
      confidence += 40;
      this.logger.log('Balance reconciliation: PASSED (+40 points)');
    } else {
      const balanceFlags = this.balanceReconciler.generateFlags(reconciliation);
      flags.push(...balanceFlags);

      // Try to find corrections
      const suggestedCorrections = this.balanceReconciler.suggestCorrections(
        statement,
        reconciliation,
      );
      corrections.push(...suggestedCorrections);

      this.logger.warn(
        `Balance reconciliation: FAILED - off by R ${(reconciliation.difference / 100).toFixed(2)} ` +
          `(${reconciliation.percentDifference.toFixed(1)}%), ${suggestedCorrections.length} corrections suggested`,
      );
    }

    // 2. Amount sanity checks (20 points max)
    const sanityFlags = this.sanityChecker.checkStatement(
      statement.openingBalanceCents,
      statement.closingBalanceCents,
      statement.transactions,
    );

    const errorFlags = sanityFlags.filter((f) => f.severity === 'ERROR');
    if (errorFlags.length === 0) {
      confidence += 20;
      this.logger.log('Amount sanity check: PASSED (+20 points)');
    } else {
      flags.push(...sanityFlags);
      this.logger.warn(
        `Amount sanity check: ${errorFlags.length} errors, ${sanityFlags.length - errorFlags.length} warnings`,
      );
    }

    // 3. Date consistency check (15 points max)
    if (this.datesConsistent(statement)) {
      confidence += 15;
      this.logger.log('Date consistency: PASSED (+15 points)');
    } else {
      flags.push({
        severity: 'WARNING',
        code: 'DATE_INCONSISTENCY',
        message: 'Transaction dates outside statement period',
      });
      this.logger.warn('Date consistency: FAILED');
    }

    // 4. OCR pattern detection (15 points max)
    const ocrPatterns = this.detectOcrPatterns(statement);
    if (ocrPatterns.length === 0) {
      confidence += 15;
      this.logger.log('OCR pattern check: PASSED (+15 points)');
    } else {
      flags.push(...ocrPatterns);
      this.logger.warn(
        `OCR pattern check: ${ocrPatterns.length} patterns detected`,
      );
    }

    // 5. Transaction count reasonableness (10 points max)
    if (
      statement.transactions.length >= 0 &&
      statement.transactions.length <= 500
    ) {
      confidence += 10;
    } else if (
      statement.transactions.length === 0 &&
      reconciliation.difference === 0
    ) {
      // Zero transactions but balance reconciles (opening = closing) is valid
      confidence += 10;
    } else {
      flags.push({
        severity: 'WARNING',
        code: 'UNUSUAL_TRANSACTION_COUNT',
        message: `${statement.transactions.length} transactions is unusual for a monthly statement`,
      });
    }

    // 6. Semantic validation via LLM (supplementary +5/-10 points)
    let semanticValidation: SemanticValidationResult | undefined;
    if (this.sdkValidator) {
      try {
        semanticValidation = await this.sdkValidator.validate(
          statement,
          tenantId,
        );
        if (
          semanticValidation.isSemanticValid &&
          semanticValidation.semanticConfidence >= 70
        ) {
          confidence += 5;
          this.logger.log('Semantic validation: PASSED (+5 bonus)');
        } else if (!semanticValidation.isSemanticValid) {
          confidence -= 10;
          flags.push(
            ...semanticValidation.issues.map((issue) => ({
              severity: issue.severity,
              code: `SEMANTIC_${issue.code}`,
              message: issue.description,
            })),
          );
          this.logger.warn(
            `Semantic validation: FAILED (-10 penalty, ${String(semanticValidation.issues.length)} issues)`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Semantic validation skipped: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    confidence = Math.max(0, Math.min(100, confidence));

    // Determine validity
    const isValid =
      confidence >= THRESHOLDS.AUTO_ACCEPT && reconciliation.reconciled;
    const reasoning = this.generateReasoning(
      reconciliation,
      flags,
      corrections,
      confidence,
    );

    const result: ValidationResult = {
      isValid,
      confidence,
      balanceReconciled: reconciliation.reconciled,
      balanceDifference: reconciliation.difference,
      corrections,
      flags,
      reasoning,
      reconciliation,
      semanticValidation,
    };

    // Log the decision
    await this.decisionLogger.logValidation(tenantId, statement, result);

    // Log escalation if not valid
    if (!isValid) {
      await this.decisionLogger.logEscalation(tenantId, statement, result);
    }

    this.logger.log(
      `Validation complete: valid=${isValid}, confidence=${confidence}%, ` +
        `flags=${flags.length}, corrections=${corrections.length}`,
    );

    return result;
  }

  /**
   * Validate and optionally apply corrections
   * Returns the statement with validation info attached
   */
  async validateAndCorrect(
    statement: ParsedBankStatement,
    tenantId: string,
    applyCorrections: boolean = false,
  ): Promise<ValidatedBankStatement> {
    const validation = await this.validate(statement, tenantId);

    const validatedStatement: ValidatedBankStatement = {
      ...statement,
      validation,
    };

    // Apply high-confidence corrections if requested
    if (applyCorrections && validation.corrections.length > 0) {
      for (const correction of validation.corrections) {
        if (correction.confidence >= 80) {
          this.logger.log(
            `Applying correction: ${correction.field} ${correction.original} → ${correction.corrected} ` +
              `(confidence ${correction.confidence}%)`,
          );

          if (
            correction.field === 'openingBalance' &&
            typeof correction.corrected === 'number'
          ) {
            validatedStatement.originalOpeningBalanceCents =
              statement.openingBalanceCents;
            validatedStatement.openingBalanceCents = correction.corrected;
          } else if (
            correction.field === 'closingBalance' &&
            typeof correction.corrected === 'number'
          ) {
            validatedStatement.originalClosingBalanceCents =
              statement.closingBalanceCents;
            validatedStatement.closingBalanceCents = correction.corrected;
          }
          // Transaction corrections would require modifying the transactions array
        }
      }

      // Re-validate after corrections
      const revalidation = await this.validate(validatedStatement, tenantId);
      validatedStatement.validation = revalidation;
    }

    return validatedStatement;
  }

  /**
   * Check if all transaction dates fall within the statement period
   */
  private datesConsistent(statement: ParsedBankStatement): boolean {
    if (!statement.statementPeriod) {
      return true; // Can't check without period
    }

    const { start, end } = statement.statementPeriod;
    const startTime = start.getTime();
    const endTime = end.getTime();

    // Allow 1 day buffer on each side for edge cases
    const bufferMs = 24 * 60 * 60 * 1000;

    for (const tx of statement.transactions) {
      const txTime = tx.date.getTime();
      if (txTime < startTime - bufferMs || txTime > endTime + bufferMs) {
        this.logger.debug(
          `Transaction date ${tx.date.toISOString()} outside period ` +
            `${start.toISOString()} to ${end.toISOString()}`,
        );
        return false;
      }
    }

    return true;
  }

  /**
   * Detect common OCR error patterns in the extracted data
   */
  private detectOcrPatterns(statement: ParsedBankStatement): ValidationFlag[] {
    const flags: ValidationFlag[] = [];

    // Pattern 1: Amounts that look like they have 4+ decimal places converted to cents
    // e.g., 100.00 becoming 10000.00 (missing decimal)
    for (let i = 0; i < statement.transactions.length; i++) {
      const tx = statement.transactions[i];

      // Check for round numbers that are suspiciously large
      // e.g., 10000000 cents = R 100,000 but might be R 1,000.00 (100000 cents)
      if (tx.amountCents % 10000 === 0 && tx.amountCents > 1000000) {
        flags.push({
          severity: 'WARNING',
          code: 'POSSIBLE_DECIMAL_ERROR',
          message: `Transaction ${i + 1} (R ${(tx.amountCents / 100).toFixed(2)}) may have OCR decimal error`,
          lineNumber: i,
          affectedField: `transactions[${i}].amount`,
        });
      }
    }

    // Pattern 2: Opening balance that's exactly 100x or 1000x the closing balance
    const openingClosingRatio =
      statement.openingBalanceCents / statement.closingBalanceCents;
    if (
      statement.closingBalanceCents !== 0 &&
      (Math.abs(openingClosingRatio - 100) < 0.01 ||
        Math.abs(openingClosingRatio - 1000) < 0.01)
    ) {
      flags.push({
        severity: 'ERROR',
        code: 'BALANCE_RATIO_SUSPICIOUS',
        message: `Opening/closing balance ratio of ${openingClosingRatio.toFixed(0)}x suggests OCR error`,
      });
    }

    // Pattern 3: Reversed ratio (closing is 100x or 1000x opening)
    if (
      statement.openingBalanceCents !== 0 &&
      (Math.abs(1 / openingClosingRatio - 100) < 0.01 ||
        Math.abs(1 / openingClosingRatio - 1000) < 0.01)
    ) {
      flags.push({
        severity: 'ERROR',
        code: 'BALANCE_RATIO_SUSPICIOUS',
        message: `Closing/opening balance ratio suggests OCR decimal error`,
      });
    }

    // Pattern 4: Description contains numbers that look like amounts
    // This might indicate OCR merged columns
    for (let i = 0; i < statement.transactions.length; i++) {
      const tx = statement.transactions[i];
      const amountInDesc = tx.description.match(/\d{1,3}(?:,\d{3})*\.\d{2}/);
      if (amountInDesc) {
        flags.push({
          severity: 'WARNING',
          code: 'AMOUNT_IN_DESCRIPTION',
          message: `Transaction ${i + 1} description contains amount-like text "${amountInDesc[0]}" - possible OCR column merge`,
          lineNumber: i,
        });
      }
    }

    return flags;
  }

  /**
   * Generate human-readable reasoning for the validation result
   */
  private generateReasoning(
    reconciliation: {
      reconciled: boolean;
      difference: number;
      percentDifference: number;
    },
    flags: ValidationFlag[],
    corrections: Correction[],
    confidence: number,
  ): string {
    const parts: string[] = [];

    // Confidence summary
    if (confidence >= THRESHOLDS.AUTO_ACCEPT) {
      parts.push(
        `High confidence (${confidence}%) - extraction appears valid.`,
      );
    } else if (confidence >= THRESHOLDS.REVIEW_REQUIRED) {
      parts.push(
        `Medium confidence (${confidence}%) - manual review recommended.`,
      );
    } else {
      parts.push(`Low confidence (${confidence}%) - extraction likely failed.`);
    }

    // Balance reconciliation
    if (reconciliation.reconciled) {
      parts.push('Balance reconciliation passed.');
    } else {
      parts.push(
        `Balance mismatch: off by R ${(reconciliation.difference / 100).toFixed(2)} ` +
          `(${reconciliation.percentDifference.toFixed(1)}%).`,
      );
    }

    // Errors
    const errors = flags.filter((f) => f.severity === 'ERROR');
    if (errors.length > 0) {
      parts.push(
        `${errors.length} error(s) detected: ${errors.map((e) => e.code).join(', ')}.`,
      );
    }

    // Warnings
    const warnings = flags.filter((f) => f.severity === 'WARNING');
    if (warnings.length > 0) {
      parts.push(
        `${warnings.length} warning(s): ${warnings.map((w) => w.code).join(', ')}.`,
      );
    }

    // Corrections
    if (corrections.length > 0) {
      const highConfidence = corrections.filter((c) => c.confidence >= 80);
      if (highConfidence.length > 0) {
        parts.push(
          `${highConfidence.length} high-confidence correction(s) available that may fix the issues.`,
        );
      }
    }

    return parts.join(' ');
  }
}
