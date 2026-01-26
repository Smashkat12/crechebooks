/**
 * SDK Semantic Validator
 * TASK-SDK-006: ExtractionValidatorAgent SDK Enhancement (Semantic Validation)
 *
 * @module agents/extraction-validator/sdk-validator
 * @description LLM-powered semantic validation for parsed bank statements.
 * Extends BaseSdkAgent to use executeWithFallback for graceful degradation.
 *
 * The SDK stub throws (agentic-flow not installed), so the fallback returns
 * a default "valid bank_statement" result. When the real SDK ships, the
 * LLM will perform deep semantic analysis.
 *
 * CRITICAL RULES:
 * - ALL monetary values are CENTS (integers)
 * - PII must be sanitised: account numbers masked (******XXXX)
 * - Max 20 transactions sampled (first 5, last 5, 10 random middle)
 * - Descriptions truncated to 80 characters
 * - No `any` types
 */

import { Injectable } from '@nestjs/common';
import { BaseSdkAgent, SdkAgentFactory, SdkConfigService } from '../sdk';
import type { AgentDefinition } from '../sdk';
import {
  ParsedBankStatement,
  ParsedBankTransaction,
} from '../../database/entities/bank-statement-match.entity';
import { SEMANTIC_VALIDATOR_SYSTEM_PROMPT } from './validator-prompt';
import type {
  SemanticValidationResult,
  SemanticIssue,
  SemanticIssueCode,
  DocumentType,
  SanitizedStatementSummary,
  SanitizedTransaction,
} from './interfaces/sdk-validator.interface';

/** Maximum transactions to include in the LLM prompt */
const MAX_TRANSACTIONS_TO_SAMPLE = 20;

/** Maximum description length in sanitised output */
const MAX_DESCRIPTION_LENGTH = 80;

/** Head/tail count for transaction sampling */
const SAMPLE_HEAD_TAIL = 5;

/**
 * SdkSemanticValidator extends BaseSdkAgent to provide LLM-based
 * semantic validation of parsed bank statements.
 *
 * When SDK is unavailable (the common case during early development),
 * the fallback returns a default valid result so existing validation
 * scoring is unaffected.
 */
@Injectable()
export class SdkSemanticValidator extends BaseSdkAgent {
  constructor(factory: SdkAgentFactory, config: SdkConfigService) {
    super(factory, config, SdkSemanticValidator.name);
  }

  /**
   * Returns the agent definition for the extraction validator.
   * Uses the factory's extraction validator agent with the semantic prompt.
   */
  getAgentDefinition(tenantId: string): AgentDefinition {
    return {
      ...this.factory.createExtractionValidatorAgent(tenantId),
      prompt: SEMANTIC_VALIDATOR_SYSTEM_PROMPT,
    };
  }

  /**
   * Validate a parsed bank statement using the LLM semantic validator.
   * Uses executeWithFallback: SDK call throws (stub), fallback returns default valid result.
   *
   * @param statement - The parsed bank statement to validate
   * @param tenantId - Tenant ID for tenant-specific prompt
   * @returns Semantic validation result
   */
  async validate(
    statement: ParsedBankStatement,
    tenantId: string,
  ): Promise<SemanticValidationResult> {
    const sanitised = this.sanitizeForLlm(statement);
    const prompt = this.buildValidationPrompt(sanitised);
    const agentDef = this.getAgentDefinition(tenantId);

    const result = await this.executeWithFallback<SemanticValidationResult>(
      async () => {
        // SDK path: call LLM with semantic validation prompt.
        // The stub throws "SDK inference not available", so this path
        // is only reached when the real agentic-flow is installed.
        const response = await this.executeSdkInference(agentDef, prompt);
        return this.parseValidationResponse(response);
      },
      () => {
        // Fallback: return a default valid result.
        // This ensures semantic validation does not block the existing pipeline.
        return Promise.resolve(this.buildDefaultResult());
      },
    );

    return result.data;
  }

  /**
   * Sanitise a parsed bank statement for LLM consumption.
   * Masks account numbers, samples transactions, truncates descriptions.
   *
   * @param statement - The raw parsed bank statement
   * @returns Sanitised summary safe for LLM
   */
  sanitizeForLlm(statement: ParsedBankStatement): SanitizedStatementSummary {
    const sampled = this.sampleTransactions(statement.transactions);

    let totalCreditsCents = 0;
    let totalDebitsCents = 0;
    for (const tx of statement.transactions) {
      if (tx.isCredit) {
        totalCreditsCents += tx.amountCents;
      } else {
        totalDebitsCents += tx.amountCents;
      }
    }

    return {
      bankName: 'Unknown',
      accountType: 'Unknown',
      maskedAccountNumber: this.maskAccountNumber(statement.accountNumber),
      openingBalanceRands: this.centsToRands(statement.openingBalanceCents),
      closingBalanceRands: this.centsToRands(statement.closingBalanceCents),
      transactionCount: statement.transactions.length,
      periodStart:
        statement.statementPeriod?.start?.toISOString?.() ?? undefined,
      periodEnd: statement.statementPeriod?.end?.toISOString?.() ?? undefined,
      sampleTransactions: sampled.map((tx, idx) =>
        this.sanitizeTransaction(tx, idx),
      ),
      totalCreditsRands: this.centsToRands(totalCreditsCents),
      totalDebitsRands: this.centsToRands(totalDebitsCents),
    };
  }

  /**
   * Sample transactions for LLM context.
   * Strategy: first 5, last 5, and up to 10 random from the middle.
   * If total <= MAX_TRANSACTIONS_TO_SAMPLE, return all.
   *
   * @param transactions - Full list of parsed transactions
   * @returns Sampled transactions (max 20)
   */
  sampleTransactions(
    transactions: ParsedBankTransaction[],
  ): ParsedBankTransaction[] {
    if (transactions.length <= MAX_TRANSACTIONS_TO_SAMPLE) {
      return [...transactions];
    }

    const head = transactions.slice(0, SAMPLE_HEAD_TAIL);
    const tail = transactions.slice(-SAMPLE_HEAD_TAIL);

    // Middle pool excludes head and tail
    const middlePool = transactions.slice(SAMPLE_HEAD_TAIL, -SAMPLE_HEAD_TAIL);
    const middleCount = MAX_TRANSACTIONS_TO_SAMPLE - SAMPLE_HEAD_TAIL * 2;
    const middle = this.randomSample(middlePool, middleCount);

    return [...head, ...middle, ...tail];
  }

  /**
   * Parse the LLM's JSON response into a SemanticValidationResult.
   * Handles markdown code block wrapping and malformed JSON.
   *
   * @param response - Raw LLM response string
   * @returns Parsed semantic validation result
   */
  parseValidationResponse(response: string): SemanticValidationResult {
    try {
      // Strip markdown code blocks if present
      let jsonStr = response.trim();
      const markdownMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (markdownMatch?.[1]) {
        jsonStr = markdownMatch[1].trim();
      }

      // Try to extract JSON object
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON object found in LLM response');
      }

      const parsed: Record<string, unknown> = JSON.parse(
        jsonMatch[0],
      ) as Record<string, unknown>;

      // Extract and validate fields
      const isSemanticValid =
        typeof parsed['isSemanticValid'] === 'boolean'
          ? parsed['isSemanticValid']
          : true;

      const rawConfidence = parsed['semanticConfidence'];
      const semanticConfidence = Math.min(
        100,
        Math.max(0, typeof rawConfidence === 'number' ? rawConfidence : 50),
      );

      const documentType = this.validateDocumentType(
        typeof parsed['documentType'] === 'string'
          ? parsed['documentType']
          : 'unknown',
      );

      const issues = this.parseIssues(parsed['issues']);

      const summary =
        typeof parsed['summary'] === 'string'
          ? parsed['summary']
          : 'Semantic validation completed';

      return {
        isSemanticValid,
        semanticConfidence,
        documentType,
        issues,
        summary,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Failed to parse semantic validation response: ${message}`,
      );
      // Return a conservative default on parse failure
      return this.buildDefaultResult();
    }
  }

  /**
   * Build the user prompt for semantic validation.
   *
   * @param sanitised - Sanitised statement summary
   * @returns Formatted prompt string
   */
  buildValidationPrompt(sanitised: SanitizedStatementSummary): string {
    const txLines = sanitised.sampleTransactions
      .map(
        (tx) =>
          `  [${String(tx.index)}] ${tx.date} | ${tx.type.toUpperCase()} | ${tx.amountRands} | ${tx.description}`,
      )
      .join('\n');

    return [
      'Analyse this bank statement for semantic coherence:',
      '',
      `Account: ${sanitised.maskedAccountNumber}`,
      `Bank: ${sanitised.bankName}`,
      `Account Type: ${sanitised.accountType}`,
      `Period: ${sanitised.periodStart ?? 'unknown'} to ${sanitised.periodEnd ?? 'unknown'}`,
      `Opening Balance: ${sanitised.openingBalanceRands}`,
      `Closing Balance: ${sanitised.closingBalanceRands}`,
      `Total Credits: ${sanitised.totalCreditsRands}`,
      `Total Debits: ${sanitised.totalDebitsRands}`,
      `Transaction Count: ${String(sanitised.transactionCount)}`,
      '',
      `Sample Transactions (${String(sanitised.sampleTransactions.length)} of ${String(sanitised.transactionCount)}):`,
      txLines || '  (no transactions)',
      '',
      'Respond with JSON only.',
    ].join('\n');
  }

  // ─────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Execute inference via the SDK execution engine.
   * Stub: throws because agentic-flow is not installed.
   */
  private executeSdkInference(
    _agentDef: AgentDefinition,
    _prompt: string,
  ): Promise<string> {
    return Promise.reject(
      new Error(
        'SDK inference not available: agentic-flow execution engine not installed. ' +
          'Install agentic-flow to enable LLM-based semantic validation.',
      ),
    );
  }

  /**
   * Build the default fallback result for when SDK is unavailable.
   * Returns a conservative "valid bank_statement" with moderate confidence.
   */
  private buildDefaultResult(): SemanticValidationResult {
    return {
      isSemanticValid: true,
      semanticConfidence: 75,
      documentType: 'bank_statement',
      issues: [],
      summary: 'Semantic validation skipped (SDK unavailable). Default pass.',
    };
  }

  /**
   * Mask an account number for PII protection.
   * Shows only the last 4 digits: "63061274808" -> "******4808"
   */
  private maskAccountNumber(accountNumber: string): string {
    if (accountNumber.length <= 4) {
      return '******' + accountNumber;
    }
    const lastFour = accountNumber.slice(-4);
    return '******' + lastFour;
  }

  /**
   * Convert cents to a human-readable Rands string.
   * e.g., 10000 -> "R 100.00"
   */
  private centsToRands(cents: number): string {
    const rands = (cents / 100).toFixed(2);
    return `R ${rands}`;
  }

  /**
   * Sanitise a single transaction for LLM output.
   */
  private sanitizeTransaction(
    tx: ParsedBankTransaction,
    sampleIndex: number,
  ): SanitizedTransaction {
    return {
      index: sampleIndex,
      date:
        tx.date instanceof Date
          ? tx.date.toISOString().split('T')[0]
          : String(tx.date),
      description:
        tx.description.length > MAX_DESCRIPTION_LENGTH
          ? tx.description.slice(0, MAX_DESCRIPTION_LENGTH) + '...'
          : tx.description,
      amountRands: this.centsToRands(tx.amountCents),
      type: tx.isCredit ? 'credit' : 'debit',
    };
  }

  /**
   * Randomly sample n items from an array.
   * Uses Fisher-Yates partial shuffle for efficiency.
   */
  private randomSample<T>(items: T[], n: number): T[] {
    if (items.length <= n) {
      return [...items];
    }

    const copy = [...items];
    const result: T[] = [];
    for (let i = 0; i < n && i < copy.length; i++) {
      const randomIndex = i + Math.floor(Math.random() * (copy.length - i));
      // Swap
      const temp = copy[i];
      copy[i] = copy[randomIndex];
      copy[randomIndex] = temp;
      result.push(copy[i]);
    }
    return result;
  }

  /**
   * Validate and normalise a document type string.
   */
  private validateDocumentType(value: string): DocumentType {
    const validTypes: DocumentType[] = [
      'bank_statement',
      'credit_card',
      'investment',
      'loan',
      'unknown',
      'mixed',
    ];
    const lower = value.toLowerCase().trim();
    if (validTypes.includes(lower as DocumentType)) {
      return lower as DocumentType;
    }
    return 'unknown';
  }

  /**
   * Parse the issues array from LLM response.
   * Validates each issue's structure and filters invalid ones.
   */
  private parseIssues(raw: unknown): SemanticIssue[] {
    if (!Array.isArray(raw)) {
      return [];
    }

    const validSeverities = ['INFO', 'WARNING', 'ERROR'] as const;
    const validCodes: SemanticIssueCode[] = [
      'WRONG_DOCUMENT_TYPE',
      'OCR_CORRUPTION',
      'SUSPICIOUS_AMOUNTS',
      'DUPLICATE_TRANSACTIONS',
      'MIXED_DOCUMENTS',
      'FOREIGN_CURRENCY',
      'DESCRIPTION_GIBBERISH',
    ];

    const issues: SemanticIssue[] = [];
    for (const item of raw) {
      if (typeof item !== 'object' || item === null) {
        continue;
      }

      const record = item as Record<string, unknown>;
      const severity = record['severity'];
      const code = record['code'];
      const description = record['description'];

      if (
        typeof severity === 'string' &&
        typeof code === 'string' &&
        typeof description === 'string' &&
        validSeverities.includes(
          severity.toUpperCase() as (typeof validSeverities)[number],
        ) &&
        validCodes.includes(code as SemanticIssueCode)
      ) {
        issues.push({
          severity: severity.toUpperCase() as SemanticIssue['severity'],
          code: code as SemanticIssueCode,
          description,
        });
      }
    }

    return issues;
  }
}
