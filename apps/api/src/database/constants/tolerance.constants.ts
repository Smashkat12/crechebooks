/**
 * Tolerance Constants
 * TASK-RECON-001: Add Amount Tolerance to Matching
 *
 * @module database/constants/tolerance
 * @description Centralized constants for amount tolerance configuration
 * used in payment matching and reconciliation.
 *
 * All monetary amounts are in CENTS as integers.
 */

/**
 * Default tolerance values for payment matching.
 *
 * These defaults are based on South African banking practices:
 * - 1 cent default tolerance for minor rounding differences
 * - R5 (500 cents) maximum tolerance to prevent abuse
 * - 0.5% default percentage for scaling with transaction size
 * - 5% maximum percentage to cap large amount tolerances
 */
export const TOLERANCE_DEFAULTS = {
  /**
   * Default tolerance in cents (1 cent).
   * Used for basic amount matching to handle minor rounding differences.
   */
  DEFAULT_AMOUNT_TOLERANCE_CENTS: 1,

  /**
   * Maximum allowed tolerance in cents (R5 = 500 cents).
   * Prevents abuse by capping the absolute tolerance.
   * Typical SA bank fees range from R1-R5.
   */
  MAX_AMOUNT_TOLERANCE_CENTS: 500,

  /**
   * Percentage-based tolerance (0.5% = 0.005).
   * Applied to large amounts where fixed tolerance is impractical.
   * For a R10,000 transaction, this means R50 tolerance.
   */
  DEFAULT_PERCENTAGE_TOLERANCE: 0.005,

  /**
   * Maximum percentage tolerance (5% = 0.05).
   * Caps percentage-based tolerance to prevent excessive matching.
   */
  MAX_PERCENTAGE_TOLERANCE: 0.05,

  /**
   * Bank fee tolerance in cents (R5 = 500 cents).
   * Maximum expected bank fee that can be auto-matched.
   * Covers typical debit order fees, transaction fees, etc.
   */
  BANK_FEE_TOLERANCE_CENTS: 500,

  /**
   * Large amount threshold in cents (R10,000 = 1,000,000 cents).
   * Amounts above this threshold use percentage-based tolerance.
   */
  LARGE_AMOUNT_THRESHOLD_CENTS: 1000000,
} as const;

/**
 * Confidence adjustment factors for tolerance matching.
 * When amounts don't match exactly, confidence is reduced proportionally.
 */
export const TOLERANCE_CONFIDENCE_FACTORS = {
  /**
   * Maximum confidence reduction for tolerance matches (20%).
   * Even with maximum tolerance used, confidence is reduced by at most 20%.
   */
  MAX_CONFIDENCE_REDUCTION: 0.2,

  /**
   * Base confidence reduction rate.
   * Confidence is reduced by this rate * (deviation / tolerance).
   */
  CONFIDENCE_REDUCTION_RATE: 0.1,
} as const;

export type ToleranceDefaults = typeof TOLERANCE_DEFAULTS;
export type ToleranceConfidenceFactors = typeof TOLERANCE_CONFIDENCE_FACTORS;
