/**
 * SDK Payment Matcher Interfaces
 * TASK-SDK-004: PaymentMatcher SDK Migration
 *
 * @module agents/payment-matcher/interfaces/sdk-matcher.interface
 * @description TypeScript interfaces for the SDK-enhanced payment matcher.
 * All monetary values are in CENTS (integers).
 */

/**
 * Result from SDK-powered payment matching (LLM ambiguity resolution).
 */
export interface SdkMatchResult {
  /** Invoice ID of the best match, or null if no match */
  bestMatchInvoiceId: string | null;
  /** Confidence score 0-100 */
  confidence: number;
  /** Human-readable reasoning for the match decision */
  reasoning: string;
  /** Whether this appears to be a partial or split payment */
  isPartialPayment: boolean;
  /** Suggested allocation across invoices (for split payments) */
  suggestedAllocation: SdkAllocation[];
}

/**
 * Allocation of a payment amount to a specific invoice.
 * All amounts in CENTS (integers).
 */
export interface SdkAllocation {
  /** Invoice ID to allocate to */
  invoiceId: string;
  /** Amount to allocate in CENTS */
  amountCents: number;
}

/**
 * Configuration for the SDK payment matcher.
 */
export interface SdkMatcherConfig {
  /** Model identifier (e.g., 'haiku', 'sonnet') */
  model: string;
  /** Maximum tokens for the LLM response */
  maxTokens: number;
  /** Temperature for LLM (0 for deterministic financial matching) */
  temperature: number;
  /** Timeout in milliseconds for LLM call */
  timeoutMs: number;
}

/**
 * Source of a match decision, indicating which subsystem produced the result.
 */
export type MatchSource = 'deterministic' | 'deterministic+ruvector' | 'sdk';
