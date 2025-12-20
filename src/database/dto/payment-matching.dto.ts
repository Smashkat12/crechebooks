/**
 * Payment Matching DTOs
 * TASK-PAY-011: Payment Matching Service
 *
 * @module database/dto/payment-matching
 * @description DTOs for confidence-based payment matching,
 * including match candidates and batch processing results.
 */

import { IsUUID, IsArray, IsOptional, IsInt, Min } from 'class-validator';

/**
 * Confidence level categories for match scoring
 */
export enum MatchConfidenceLevel {
  EXACT = 'EXACT', // 100% - reference + amount exact
  HIGH = 'HIGH', // 80-99% - strong correlation
  MEDIUM = 'MEDIUM', // 50-79% - moderate correlation
  LOW = 'LOW', // <50% - weak correlation
}

/**
 * Candidate match for a transaction-invoice pair
 * Contains all information needed for review or auto-apply
 */
export interface MatchCandidate {
  /** ID of the transaction being matched */
  transactionId: string;

  /** ID of the candidate invoice */
  invoiceId: string;

  /** Invoice number for display */
  invoiceNumber: string;

  /** Confidence level category */
  confidenceLevel: MatchConfidenceLevel;

  /** Numeric confidence score 0-100 */
  confidenceScore: number;

  /** Human-readable explanations for the score */
  matchReasons: string[];

  /** Parent ID for the invoice */
  parentId: string;

  /** Full parent name */
  parentName: string;

  /** Child name on the invoice */
  childName: string;

  /** Outstanding amount on invoice in cents */
  invoiceOutstandingCents: number;

  /** Transaction amount in cents (absolute value) */
  transactionAmountCents: number;
}

/**
 * Result of matching a single transaction
 */
export interface TransactionMatchResult {
  /** ID of the processed transaction */
  transactionId: string;

  /** Outcome status */
  status: 'AUTO_APPLIED' | 'REVIEW_REQUIRED' | 'NO_MATCH';

  /** Details if match was auto-applied */
  appliedMatch?: AppliedMatch;

  /** Candidate matches for review (top 5) */
  candidates?: MatchCandidate[];

  /** Human-readable explanation of the result */
  reason: string;
}

/**
 * Successfully applied match details
 */
export interface AppliedMatch {
  /** Created payment ID */
  paymentId: string;

  /** Transaction that was matched */
  transactionId: string;

  /** Invoice that received the payment */
  invoiceId: string;

  /** Invoice number for display */
  invoiceNumber: string;

  /** Amount applied in cents */
  amountCents: number;

  /** Confidence score of the match */
  confidenceScore: number;
}

/**
 * Batch matching result with statistics
 */
export interface MatchingBatchResult {
  /** Total transactions processed */
  processed: number;

  /** Count of auto-applied matches */
  autoApplied: number;

  /** Count requiring manual review */
  reviewRequired: number;

  /** Count with no matching invoices */
  noMatch: number;

  /** Individual results for each transaction */
  results: TransactionMatchResult[];
}

/**
 * Confidence calculation result
 */
export interface ConfidenceResult {
  /** Numeric score 0-100 */
  score: number;

  /** Human-readable reasons for the score */
  reasons: string[];
}

/**
 * DTO for initiating batch payment matching
 */
export class MatchPaymentsDto {
  @IsUUID()
  tenantId!: string;

  /**
   * Optional array of transaction IDs to match.
   * If empty/undefined, matches all unallocated credit transactions.
   */
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  transactionIds?: string[];
}

/**
 * DTO for manually applying a suggested match
 */
export class ApplyMatchDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  transactionId!: string;

  @IsUUID()
  invoiceId!: string;

  /**
   * Optional amount override for partial payment.
   * If not specified, uses full transaction amount.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  amountCents?: number;
}
