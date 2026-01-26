/**
 * SDK Semantic Validator Interfaces
 * TASK-SDK-006: ExtractionValidatorAgent SDK Enhancement (Semantic Validation)
 *
 * @module agents/extraction-validator/interfaces/sdk-validator.interface
 * @description Types for LLM-powered semantic validation of parsed bank statements.
 * The semantic validator supplements the existing 5-point scoring system
 * with an LLM check that adjusts confidence by +5 (pass) or -10 (fail).
 *
 * CRITICAL RULES:
 * - ALL monetary values are CENTS (integers)
 * - PII must be sanitised before sending to LLM
 * - Account numbers are masked (******XXXX)
 * - Max 20 transactions sampled per statement
 */

/**
 * Result of semantic validation by the LLM.
 */
export interface SemanticValidationResult {
  /** Whether the document is semantically valid */
  isSemanticValid: boolean;
  /** Confidence of semantic validation (0-100) */
  semanticConfidence: number;
  /** Detected document type */
  documentType: DocumentType;
  /** Semantic issues found */
  issues: SemanticIssue[];
  /** Human-readable summary of findings */
  summary: string;
}

/**
 * Detected document type from semantic analysis.
 */
export type DocumentType =
  | 'bank_statement'
  | 'credit_card'
  | 'investment'
  | 'loan'
  | 'unknown'
  | 'mixed';

/**
 * A semantic issue detected by the LLM.
 */
export interface SemanticIssue {
  /** Issue severity */
  severity: 'INFO' | 'WARNING' | 'ERROR';
  /** Machine-readable issue code */
  code: SemanticIssueCode;
  /** Human-readable description */
  description: string;
}

/**
 * Machine-readable semantic issue codes.
 */
export type SemanticIssueCode =
  | 'WRONG_DOCUMENT_TYPE'
  | 'OCR_CORRUPTION'
  | 'SUSPICIOUS_AMOUNTS'
  | 'DUPLICATE_TRANSACTIONS'
  | 'MIXED_DOCUMENTS'
  | 'FOREIGN_CURRENCY'
  | 'DESCRIPTION_GIBBERISH';

/**
 * Configuration for the SDK semantic validator.
 */
export interface SdkValidatorConfig {
  /** LLM model to use for semantic validation */
  model: string;
  /** Maximum tokens for LLM response */
  maxTokens: number;
  /** LLM temperature (0 for deterministic) */
  temperature: number;
  /** Timeout for LLM call in milliseconds */
  timeoutMs: number;
  /** Maximum transactions to sample for LLM context */
  maxTransactionsToSample: number;
}

/**
 * Sanitised statement summary safe to send to the LLM.
 * All PII is masked, amounts are in Rands for readability.
 */
export interface SanitizedStatementSummary {
  /** Bank name (if available) */
  bankName: string;
  /** Account type (if available) */
  accountType: string;
  /** Masked account number (e.g., ******4808) */
  maskedAccountNumber: string;
  /** Opening balance in Rands (e.g., "R 1,000.00") */
  openingBalanceRands: string;
  /** Closing balance in Rands (e.g., "R 1,300.00") */
  closingBalanceRands: string;
  /** Total number of transactions in the statement */
  transactionCount: number;
  /** Statement period start (ISO date string) */
  periodStart?: string;
  /** Statement period end (ISO date string) */
  periodEnd?: string;
  /** Sampled transactions (max 20) */
  sampleTransactions: SanitizedTransaction[];
  /** Total credits in Rands */
  totalCreditsRands: string;
  /** Total debits in Rands */
  totalDebitsRands: string;
}

/**
 * A sanitised transaction safe to send to the LLM.
 */
export interface SanitizedTransaction {
  /** Original index in the transaction array */
  index: number;
  /** Transaction date (ISO date string) */
  date: string;
  /** Transaction description (truncated to 80 chars) */
  description: string;
  /** Amount in Rands (e.g., "R 100.00") */
  amountRands: string;
  /** Transaction type */
  type: 'credit' | 'debit';
}
