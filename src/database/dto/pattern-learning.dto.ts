/**
 * Pattern Learning DTOs
 * TASK-TRANS-013: Payee Pattern Learning Service
 *
 * @module database/dto/pattern-learning
 * @description DTOs for pattern learning service operations.
 */

import { IPayeePattern } from '../entities/payee-pattern.entity';

/**
 * Match types for pattern matching
 */
export type PatternMatchType =
  | 'EXACT_PAYEE'
  | 'PARTIAL_PAYEE'
  | 'KEYWORD'
  | 'DESCRIPTION';

/**
 * Result of matching a transaction against patterns
 */
export interface PatternMatch {
  pattern: IPayeePattern;
  matchScore: number;
  matchType: PatternMatchType;
  confidenceBoost: number;
}

/**
 * Frequency of recurring transactions
 */
export type RecurringFrequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';

/**
 * Information about recurring transaction patterns
 */
export interface RecurringInfo {
  payeeName: string;
  frequency: RecurringFrequency;
  averageAmountCents: number;
  lastOccurrence: Date;
  occurrenceCount: number;
  isRecurring: boolean;
  intervalDays: number;
  standardDeviation: number;
}

/**
 * Statistics about patterns for a tenant
 */
export interface PatternStats {
  totalPatterns: number;
  activePatterns: number;
  avgMatchCount: number;
  topPatterns: TopPattern[];
}

/**
 * Top pattern summary
 */
export interface TopPattern {
  payeeName: string;
  matchCount: number;
  accountCode: string;
  accountName: string;
}

/**
 * DTO for learning from user corrections
 */
export interface LearnFromCorrectionDto {
  transactionId: string;
  accountCode: string;
  accountName: string;
  tenantId: string;
}

/**
 * Constants for pattern learning
 */
export const PATTERN_LEARNING_CONSTANTS = {
  /** Base confidence boost for new patterns */
  BASE_CONFIDENCE_BOOST: 10,
  /** Maximum confidence boost */
  MAX_CONFIDENCE_BOOST: 15,
  /** Confidence boost increment per match */
  CONFIDENCE_INCREMENT: 1,
  /** Confidence penalty for failed match */
  CONFIDENCE_PENALTY: 2,
  /** Minimum confidence boost */
  MIN_CONFIDENCE_BOOST: 5,
  /** Minimum occurrences for recurring detection */
  MIN_RECURRING_OCCURRENCES: 3,
  /** Recurring detection window in months */
  RECURRING_WINDOW_MONTHS: 12,
  /** Tolerance for regular interval detection (20%) */
  RECURRING_TOLERANCE: 0.2,
  /** Minimum keyword length */
  MIN_KEYWORD_LENGTH: 3,
} as const;
