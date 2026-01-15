/**
 * Tolerance Configuration Service
 * TASK-RECON-003: Standardize Balance Tolerance Configuration
 *
 * @module database/services/tolerance-config
 * @description Centralized configuration for all reconciliation tolerance values.
 * Provides a single source of truth for tolerance settings used across reconciliation,
 * bank statement matching, and discrepancy detection services.
 *
 * All monetary amounts are in CENTS as integers.
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Tolerance configuration interface
 * All monetary values are in cents
 */
export interface ToleranceConfig {
  /**
   * Amount matching tolerance in cents.
   * Used for individual transaction matching.
   * Default: 1 cent - allows for minor rounding differences
   */
  amountMatchingTolerance: number;

  /**
   * Balance validation tolerance in cents.
   * Used for closing balance reconciliation.
   * Default: 100 cents (R1.00) - accounts for bank fees, interest, etc.
   */
  balanceValidationTolerance: number;

  /**
   * Bank fee tolerance in cents.
   * Maximum expected bank fee that can be auto-matched.
   * Default: 500 cents (R5.00) - typical SA bank fee range
   */
  bankFeeTolerance: number;

  /**
   * Date tolerance in days.
   * Used for matching transactions with date differences.
   * Default: 1 day - accounts for processing delays
   */
  dateTolerance: number;

  /**
   * Percentage tolerance as decimal.
   * Applied to large amounts where percentage makes more sense.
   * Default: 0.005 (0.5%) - for amounts over R10,000
   */
  percentageTolerance: number;

  /**
   * Large amount threshold in cents.
   * Amounts above this use percentage tolerance instead of fixed.
   * Default: 1,000,000 cents (R10,000)
   */
  largeAmountThreshold: number;

  /**
   * Description similarity threshold.
   * Minimum similarity score for description matching.
   * Default: 0.7 (70% similarity)
   */
  descriptionSimilarityThreshold: number;
}

/**
 * Default tolerance configuration values with rationale
 *
 * These defaults are based on South African banking practices:
 * - 1 cent for exact matches (rounding edge cases)
 * - R1 for balance validation (minor bank charges)
 * - R5 for bank fees (typical debit order fees)
 * - 1 day for date tolerance (processing delays)
 * - 0.5% for large amounts (scales with transaction size)
 */
export const DEFAULT_TOLERANCE_CONFIG: ToleranceConfig = {
  amountMatchingTolerance: 1, // 1 cent
  balanceValidationTolerance: 100, // R1.00
  bankFeeTolerance: 500, // R5.00
  dateTolerance: 1, // 1 day
  percentageTolerance: 0.005, // 0.5%
  largeAmountThreshold: 1000000, // R10,000
  descriptionSimilarityThreshold: 0.7, // 70%
};

/**
 * Environment variable names for tolerance configuration
 */
export const TOLERANCE_ENV_VARS = {
  AMOUNT: 'RECONCILIATION_AMOUNT_TOLERANCE',
  BALANCE: 'RECONCILIATION_BALANCE_TOLERANCE',
  BANK_FEE: 'RECONCILIATION_BANK_FEE_TOLERANCE',
  DATE: 'RECONCILIATION_DATE_TOLERANCE',
  PERCENTAGE: 'RECONCILIATION_PERCENTAGE_TOLERANCE',
  LARGE_AMOUNT_THRESHOLD: 'RECONCILIATION_LARGE_AMOUNT_THRESHOLD',
  DESCRIPTION_SIMILARITY: 'RECONCILIATION_DESCRIPTION_SIMILARITY',
} as const;

/**
 * Service for accessing reconciliation tolerance configuration
 *
 * @example
 * ```typescript
 * // In a service constructor
 * constructor(private toleranceConfig: ToleranceConfigService) {}
 *
 * // Check if amounts match within tolerance
 * if (this.toleranceConfig.isWithinTolerance(difference, amount)) {
 *   // Amounts match
 * }
 *
 * // Get the effective tolerance for a specific amount
 * const tolerance = this.toleranceConfig.getEffectiveTolerance(amount);
 * ```
 */
@Injectable()
export class ToleranceConfigService {
  private readonly config: ToleranceConfig;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from environment variables with defaults
   */
  private loadConfig(): ToleranceConfig {
    return {
      amountMatchingTolerance: this.getEnvNumber(
        TOLERANCE_ENV_VARS.AMOUNT,
        DEFAULT_TOLERANCE_CONFIG.amountMatchingTolerance,
      ),
      balanceValidationTolerance: this.getEnvNumber(
        TOLERANCE_ENV_VARS.BALANCE,
        DEFAULT_TOLERANCE_CONFIG.balanceValidationTolerance,
      ),
      bankFeeTolerance: this.getEnvNumber(
        TOLERANCE_ENV_VARS.BANK_FEE,
        DEFAULT_TOLERANCE_CONFIG.bankFeeTolerance,
      ),
      dateTolerance: this.getEnvNumber(
        TOLERANCE_ENV_VARS.DATE,
        DEFAULT_TOLERANCE_CONFIG.dateTolerance,
      ),
      percentageTolerance: this.getEnvNumber(
        TOLERANCE_ENV_VARS.PERCENTAGE,
        DEFAULT_TOLERANCE_CONFIG.percentageTolerance,
      ),
      largeAmountThreshold: this.getEnvNumber(
        TOLERANCE_ENV_VARS.LARGE_AMOUNT_THRESHOLD,
        DEFAULT_TOLERANCE_CONFIG.largeAmountThreshold,
      ),
      descriptionSimilarityThreshold: this.getEnvNumber(
        TOLERANCE_ENV_VARS.DESCRIPTION_SIMILARITY,
        DEFAULT_TOLERANCE_CONFIG.descriptionSimilarityThreshold,
      ),
    };
  }

  /**
   * Get a number from environment variable with default
   */
  private getEnvNumber(key: string, defaultValue: number): number {
    const value = this.configService.get<string>(key);
    if (value === undefined || value === null || value === '') {
      return defaultValue;
    }
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Get the full tolerance configuration
   */
  getConfig(): Readonly<ToleranceConfig> {
    return { ...this.config };
  }

  /**
   * Get amount matching tolerance (for individual transactions)
   */
  get amountMatchingTolerance(): number {
    return this.config.amountMatchingTolerance;
  }

  /**
   * Get balance validation tolerance (for closing balance)
   */
  get balanceValidationTolerance(): number {
    return this.config.balanceValidationTolerance;
  }

  /**
   * Get bank fee tolerance
   */
  get bankFeeTolerance(): number {
    return this.config.bankFeeTolerance;
  }

  /**
   * Get date tolerance in days
   */
  get dateTolerance(): number {
    return this.config.dateTolerance;
  }

  /**
   * Get percentage tolerance as decimal
   */
  get percentageTolerance(): number {
    return this.config.percentageTolerance;
  }

  /**
   * Get large amount threshold
   */
  get largeAmountThreshold(): number {
    return this.config.largeAmountThreshold;
  }

  /**
   * Get description similarity threshold
   */
  get descriptionSimilarityThreshold(): number {
    return this.config.descriptionSimilarityThreshold;
  }

  /**
   * Calculate the effective tolerance for a given amount.
   * For amounts above the large amount threshold, uses percentage-based tolerance.
   * Otherwise uses the fixed amount matching tolerance.
   *
   * @param amountCents - The transaction amount in cents
   * @returns The effective tolerance in cents
   *
   * @example
   * ```typescript
   * // For small amounts (< R10,000), returns fixed tolerance
   * getEffectiveTolerance(5000) // Returns 1 (1 cent)
   *
   * // For large amounts (>= R10,000), returns percentage-based tolerance
   * getEffectiveTolerance(2000000) // Returns 10000 (0.5% of R20,000)
   * ```
   */
  getEffectiveTolerance(amountCents: number): number {
    const absAmount = Math.abs(amountCents);

    // For large amounts, use percentage-based tolerance
    if (absAmount >= this.config.largeAmountThreshold) {
      const percentageAmount = Math.ceil(
        absAmount * this.config.percentageTolerance,
      );
      // Return the larger of fixed or percentage tolerance
      return Math.max(this.config.amountMatchingTolerance, percentageAmount);
    }

    return this.config.amountMatchingTolerance;
  }

  /**
   * Check if a variance is within tolerance for a given amount.
   * Uses getEffectiveTolerance to determine the appropriate tolerance.
   *
   * @param varianceCents - The variance/difference in cents
   * @param amountCents - The transaction amount in cents (for percentage calculation)
   * @returns true if the variance is within tolerance
   *
   * @example
   * ```typescript
   * // Check if 50 cents difference is acceptable for a R100 transaction
   * isWithinTolerance(50, 10000) // Returns false (50 > 1 cent tolerance)
   *
   * // Check if 50 cents difference is acceptable for a R20,000 transaction
   * isWithinTolerance(50, 2000000) // Returns true (50 < 10000 = 0.5% tolerance)
   * ```
   */
  isWithinTolerance(varianceCents: number, amountCents: number): boolean {
    const effectiveTolerance = this.getEffectiveTolerance(amountCents);
    return Math.abs(varianceCents) <= effectiveTolerance;
  }

  /**
   * Check if a balance discrepancy is within the balance validation tolerance.
   * Used for reconciliation status determination.
   *
   * @param discrepancyCents - The balance discrepancy in cents
   * @returns true if the discrepancy is acceptable
   */
  isBalanceWithinTolerance(discrepancyCents: number): boolean {
    return Math.abs(discrepancyCents) <= this.config.balanceValidationTolerance;
  }

  /**
   * Check if a date difference is within tolerance.
   *
   * @param daysDifference - The difference in days between two dates
   * @returns true if the date difference is acceptable
   */
  isDateWithinTolerance(daysDifference: number): boolean {
    return Math.abs(daysDifference) <= this.config.dateTolerance;
  }

  /**
   * Check if a description similarity score meets the threshold.
   *
   * @param similarityScore - The similarity score (0-1)
   * @returns true if the similarity is above threshold
   */
  isDescriptionMatch(similarityScore: number): boolean {
    return similarityScore >= this.config.descriptionSimilarityThreshold;
  }

  /**
   * Check if an amount could be a bank fee (within bank fee tolerance).
   *
   * @param amountCents - The amount in cents
   * @returns true if the amount is within typical bank fee range
   */
  isPotentialBankFee(amountCents: number): boolean {
    return Math.abs(amountCents) <= this.config.bankFeeTolerance;
  }
}
