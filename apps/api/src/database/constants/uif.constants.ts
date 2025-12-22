/**
 * UIF Constants for South African SARS Compliance
 * TASK-SARS-013
 *
 * Unemployment Insurance Fund (UIF) 2025 rates
 * All monetary values in CENTS
 */
import Decimal from 'decimal.js';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/**
 * UIF calculation constants for 2025
 */
export const UIF_CONSTANTS = {
  /** Employee contribution rate (1%) */
  EMPLOYEE_RATE: new Decimal('0.01'),

  /** Employer contribution rate (1%) */
  EMPLOYER_RATE: new Decimal('0.01'),

  /** Combined rate (2%) */
  COMBINED_RATE: new Decimal('0.02'),

  /**
   * Maximum monthly remuneration for UIF calculation
   * R17,712 = 1771200 cents (2025)
   */
  MAX_REMUNERATION_CENTS: 1771200,

  /**
   * Maximum monthly employee contribution
   * R177.12 = 17712 cents (1% of R17,712)
   */
  MAX_EMPLOYEE_CONTRIBUTION_CENTS: 17712,

  /**
   * Maximum monthly employer contribution
   * R177.12 = 17712 cents (1% of R17,712)
   */
  MAX_EMPLOYER_CONTRIBUTION_CENTS: 17712,

  /**
   * Maximum total monthly contribution
   * R354.24 = 35424 cents (2% of R17,712)
   */
  MAX_TOTAL_CONTRIBUTION_CENTS: 35424,
};
