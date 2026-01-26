/**
 * SDK Categorizer Interfaces
 * TASK-SDK-003: TransactionCategorizer SDK Migration (Pilot)
 *
 * @module agents/transaction-categorizer/interfaces/sdk-categorizer.interface
 * @description TypeScript interfaces for SDK-enhanced transaction categorization.
 * Defines input/output contracts for the SdkCategorizer class.
 *
 * CRITICAL RULES:
 * - ALL monetary values are CENTS (integers)
 * - Confidence scores are 0-100 integers
 * - VAT types must be one of: STANDARD, ZERO_RATED, EXEMPT, NO_VAT
 */

/**
 * Input for SDK-based transaction categorization.
 * This is what the SdkCategorizer receives from the main categorizer agent.
 */
export interface SdkCategorizationInput {
  tenantId: string;
  payeeName: string;
  description?: string;
  amountCents: number;
  isCredit: boolean;
  transactionDate?: string;
  bankAccountId?: string;
}

/**
 * Structured output from SDK-based categorization.
 * The LLM returns this via JSON structured output.
 */
export interface SdkCategorizationResult {
  accountCode: string;
  accountName: string;
  vatType: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'NO_VAT';
  confidence: number; // 0-100
  reasoning: string;
  source: 'LLM';
  model: string;
  durationMs: number;
}

/**
 * All possible categorization sources in the hybrid flow.
 * LLM includes both ruvector semantic search and agentic-flow inference
 * since both are non-deterministic paths.
 */
export type CategorizationSource =
  | 'LLM'
  | 'PATTERN'
  | 'HISTORICAL'
  | 'FALLBACK';

/**
 * Extended categorization result that includes the source field.
 * This extends the existing CategorizationResult interface with
 * SDK-specific tracking fields for decision analysis.
 */
export interface ExtendedCategorizationResult {
  accountCode: string;
  accountName: string;
  vatType: 'STANDARD' | 'ZERO_RATED' | 'EXEMPT' | 'NO_VAT';
  confidence: number;
  reasoning?: string;
  source: CategorizationSource;
  model?: string;
  durationMs?: number;
  flagForReview: boolean;
  autoApplied: boolean;
}
