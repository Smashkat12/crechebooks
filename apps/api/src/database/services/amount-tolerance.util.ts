/**
 * Amount Tolerance Utility
 * TASK-RECON-001: Add Amount Tolerance to Matching
 *
 * @module database/services/amount-tolerance
 * @description Utility functions for amount tolerance matching in payment
 * reconciliation. Provides flexible tolerance configuration with both
 * absolute and percentage-based tolerances.
 *
 * All monetary amounts are in CENTS as integers.
 */

import {
  TOLERANCE_DEFAULTS,
  TOLERANCE_CONFIDENCE_FACTORS,
} from '../constants/tolerance.constants';

/**
 * Configuration for tolerance matching.
 * Supports both absolute (cents) and percentage-based tolerances.
 */
export interface AmountToleranceConfig {
  /**
   * Absolute tolerance in cents.
   * Default: 1 cent
   */
  absoluteTolerance?: number;

  /**
   * Percentage tolerance as decimal (0.01 = 1%).
   * Default: 0.5% (0.005)
   */
  percentageTolerance?: number;

  /**
   * When true, matches if EITHER absolute OR percentage tolerance is met.
   * When false, matches only if BOTH tolerances are met.
   * Default: true (use higher/more lenient tolerance)
   */
  useHigherTolerance?: boolean;
}

/**
 * Result of a tolerance comparison.
 */
export interface ToleranceResult {
  /**
   * Whether the amounts match within the configured tolerance.
   */
  matches: boolean;

  /**
   * Absolute deviation between the two amounts in cents.
   */
  deviation: number;

  /**
   * Percentage deviation between the amounts (0-1 scale).
   */
  percentageDeviation: number;

  /**
   * Confidence adjustment to apply when amounts match with tolerance.
   * Negative value (0 to -0.2) to reduce confidence proportionally.
   * Zero if exact match.
   */
  confidenceAdjustment: number;

  /**
   * Description of the tolerance match for logging/audit.
   */
  matchDescription: string;
}

/**
 * Check if two amounts are within tolerance of each other.
 *
 * @param amount1 - First amount in cents
 * @param amount2 - Second amount in cents
 * @param config - Optional tolerance configuration
 * @returns Tolerance result with match status and confidence adjustment
 *
 * @example
 * ```typescript
 * // Exact match
 * const result = isAmountWithinTolerance(10000, 10000);
 * // result.matches = true, result.confidenceAdjustment = 0
 *
 * // Within 1 cent tolerance
 * const result = isAmountWithinTolerance(10000, 9999, { absoluteTolerance: 1 });
 * // result.matches = true, result.confidenceAdjustment = -0.1
 *
 * // Bank fee scenario (R100 with R0.50 fee)
 * const result = isAmountWithinTolerance(10000, 9950, { absoluteTolerance: 100 });
 * // result.matches = true
 * ```
 */
export function isAmountWithinTolerance(
  amount1: number,
  amount2: number,
  config: AmountToleranceConfig = {},
): ToleranceResult {
  const {
    absoluteTolerance = TOLERANCE_DEFAULTS.DEFAULT_AMOUNT_TOLERANCE_CENTS,
    percentageTolerance = TOLERANCE_DEFAULTS.DEFAULT_PERCENTAGE_TOLERANCE,
    useHigherTolerance = true,
  } = config;

  // Calculate absolute deviation
  const deviation = Math.abs(amount1 - amount2);

  // Calculate percentage deviation (avoid division by zero)
  const maxAmount = Math.max(Math.abs(amount1), Math.abs(amount2), 1);
  const percentageDeviation = deviation / maxAmount;

  // Check both tolerance types
  const absoluteMatch = deviation <= absoluteTolerance;
  const percentageMatch = percentageDeviation <= percentageTolerance;

  // Determine overall match based on config
  const matches = useHigherTolerance
    ? absoluteMatch || percentageMatch
    : absoluteMatch && percentageMatch;

  // Calculate confidence adjustment based on deviation
  // Max 20% reduction, proportional to deviation vs tolerance
  let confidenceAdjustment = 0;
  if (matches && deviation > 0) {
    const effectiveTolerance = useHigherTolerance
      ? Math.max(absoluteTolerance, Math.ceil(maxAmount * percentageTolerance))
      : absoluteTolerance;

    const reductionFactor =
      (deviation / effectiveTolerance) *
      TOLERANCE_CONFIDENCE_FACTORS.CONFIDENCE_REDUCTION_RATE;
    confidenceAdjustment = -Math.min(
      reductionFactor,
      TOLERANCE_CONFIDENCE_FACTORS.MAX_CONFIDENCE_REDUCTION,
    );
  }

  // Generate match description for logging
  let matchDescription: string;
  if (deviation === 0) {
    matchDescription = 'Exact amount match';
  } else if (matches) {
    const toleranceType = absoluteMatch ? 'absolute' : 'percentage';
    const formattedDeviation =
      deviation >= 100
        ? `R${(deviation / 100).toFixed(2)}`
        : `${deviation} cents`;
    matchDescription = `Amount within ${toleranceType} tolerance (deviation: ${formattedDeviation})`;
  } else {
    const formattedDeviation =
      deviation >= 100
        ? `R${(deviation / 100).toFixed(2)}`
        : `${deviation} cents`;
    matchDescription = `Amount outside tolerance (deviation: ${formattedDeviation})`;
  }

  return {
    matches,
    deviation,
    percentageDeviation,
    confidenceAdjustment,
    matchDescription,
  };
}

/**
 * Validate tolerance configuration values.
 *
 * @param config - Tolerance configuration to validate
 * @throws Error if configuration values are invalid
 *
 * @example
 * ```typescript
 * // Valid config - no error
 * validateToleranceConfig({ absoluteTolerance: 100 });
 *
 * // Invalid config - throws error
 * validateToleranceConfig({ absoluteTolerance: -1 });
 * // Error: Absolute tolerance cannot be negative
 *
 * validateToleranceConfig({ absoluteTolerance: 600 });
 * // Error: Absolute tolerance cannot exceed 500 cents (R5)
 * ```
 */
export function validateToleranceConfig(config: AmountToleranceConfig): void {
  if (config.absoluteTolerance !== undefined) {
    if (config.absoluteTolerance < 0) {
      throw new Error('Absolute tolerance cannot be negative');
    }
    if (
      config.absoluteTolerance > TOLERANCE_DEFAULTS.MAX_AMOUNT_TOLERANCE_CENTS
    ) {
      throw new Error(
        `Absolute tolerance cannot exceed ${TOLERANCE_DEFAULTS.MAX_AMOUNT_TOLERANCE_CENTS} cents (R${(TOLERANCE_DEFAULTS.MAX_AMOUNT_TOLERANCE_CENTS / 100).toFixed(0)})`,
      );
    }
  }

  if (config.percentageTolerance !== undefined) {
    if (config.percentageTolerance < 0) {
      throw new Error('Percentage tolerance cannot be negative');
    }
    if (config.percentageTolerance > 1) {
      throw new Error('Percentage tolerance must be between 0 and 1');
    }
    if (
      config.percentageTolerance > TOLERANCE_DEFAULTS.MAX_PERCENTAGE_TOLERANCE
    ) {
      throw new Error(
        `Percentage tolerance cannot exceed ${TOLERANCE_DEFAULTS.MAX_PERCENTAGE_TOLERANCE * 100}%`,
      );
    }
  }
}

/**
 * Calculate the effective tolerance for a given amount.
 * For large amounts, percentage tolerance may exceed fixed tolerance.
 *
 * @param amountCents - The amount in cents
 * @param config - Optional tolerance configuration
 * @returns The effective tolerance in cents
 *
 * @example
 * ```typescript
 * // Small amount uses fixed tolerance
 * getEffectiveTolerance(10000) // Returns 1 (default)
 *
 * // Large amount uses percentage tolerance
 * getEffectiveTolerance(2000000) // Returns 10000 (0.5% of R20,000)
 * ```
 */
export function getEffectiveTolerance(
  amountCents: number,
  config: AmountToleranceConfig = {},
): number {
  const {
    absoluteTolerance = TOLERANCE_DEFAULTS.DEFAULT_AMOUNT_TOLERANCE_CENTS,
    percentageTolerance = TOLERANCE_DEFAULTS.DEFAULT_PERCENTAGE_TOLERANCE,
    useHigherTolerance = true,
  } = config;

  const absAmount = Math.abs(amountCents);
  const percentageAmount = Math.ceil(absAmount * percentageTolerance);

  if (useHigherTolerance) {
    // Use the larger tolerance
    return Math.max(absoluteTolerance, percentageAmount);
  } else {
    // Use the smaller tolerance (stricter)
    return Math.min(absoluteTolerance, percentageAmount);
  }
}

/**
 * Create a tolerance config for bank fee scenarios.
 * Uses higher tolerance to account for typical SA bank fees (R1-R5).
 *
 * @returns Tolerance config suitable for bank fee matching
 *
 * @example
 * ```typescript
 * const bankFeeConfig = createBankFeeTolerance();
 * const result = isAmountWithinTolerance(10000, 9950, bankFeeConfig);
 * // Matches with R0.50 deviation within R5 bank fee tolerance
 * ```
 */
export function createBankFeeTolerance(): AmountToleranceConfig {
  return {
    absoluteTolerance: TOLERANCE_DEFAULTS.BANK_FEE_TOLERANCE_CENTS,
    percentageTolerance: TOLERANCE_DEFAULTS.DEFAULT_PERCENTAGE_TOLERANCE,
    useHigherTolerance: true,
  };
}

/**
 * Create a strict tolerance config for exact matching.
 * Uses minimal tolerance (1 cent) to only match near-exact amounts.
 *
 * @returns Tolerance config for strict matching
 */
export function createStrictTolerance(): AmountToleranceConfig {
  return {
    absoluteTolerance: TOLERANCE_DEFAULTS.DEFAULT_AMOUNT_TOLERANCE_CENTS,
    percentageTolerance: 0,
    useHigherTolerance: false,
  };
}
