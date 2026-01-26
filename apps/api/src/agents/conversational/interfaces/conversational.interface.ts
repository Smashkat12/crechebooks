/**
 * Conversational Agent Interfaces
 * TASK-SDK-008: ConversationalAgent Implementation
 *
 * @module agents/conversational/interfaces/conversational.interface
 * @description TypeScript interfaces for the natural language financial query agent.
 *
 * CRITICAL RULES:
 * - ALL monetary values are CENTS (integers) internally
 * - Display as Rands (R X,XXX.XX) to users
 * - STRICTLY READ-ONLY - no create/update/delete operations
 * - Tenant isolation on ALL queries
 */

/** Response from the conversational agent */
export interface ConversationalResponse {
  /** The natural language answer to the user's question */
  answer: string;
  /** Conversation thread identifier for multi-turn context */
  conversationId: string;
  /** Metadata about how the query was processed */
  metadata: ConversationalMetadata;
}

/** Metadata about the query execution */
export interface ConversationalMetadata {
  /** Classification of the query */
  queryType: QueryType;
  /** Whether SDK or fallback logic produced the answer */
  source: 'SDK' | 'FALLBACK';
  /** Model used (only present when source is SDK) */
  model?: string;
  /** Time taken to produce the answer in milliseconds */
  durationMs: number;
  /** Which data sources were queried to produce the answer */
  dataSourcesQueried: string[];
}

/** Types of queries the agent can handle */
export type QueryType =
  | 'REVENUE'
  | 'EXPENSE'
  | 'INVOICE'
  | 'PAYMENT'
  | 'TAX'
  | 'ENROLLMENT'
  | 'SUMMARY'
  | 'GENERAL';

/** Query validation result */
export interface QueryValidationResult {
  /** Whether the query passed all validation checks */
  isValid: boolean;
  /** Reason for validation failure (only present when isValid is false) */
  reason?: string;
  /** Sanitized version of the question (trimmed, safe) */
  sanitizedQuestion?: string;
}

/** Query complexity for model routing */
export type QueryComplexity = 'simple' | 'complex';
