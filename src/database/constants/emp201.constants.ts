/**
 * EMP201 Generation Constants
 * TASK-SARS-015
 *
 * South African employer monthly reconciliation constants.
 * All monetary values in CENTS (integers)
 */
import Decimal from 'decimal.js';

/**
 * EMP201 Constants
 */
export const EMP201_CONSTANTS = {
  /**
   * Skills Development Levy rate (1% of payroll)
   * 2025 rate
   */
  SDL_RATE: new Decimal('0.01'),

  /**
   * SDL minimum annual threshold for exemption (R500,000)
   * Companies with annual payroll below this are exempt
   */
  SDL_EXEMPTION_THRESHOLD_CENTS: 50000000,

  /**
   * Period format regex (YYYY-MM)
   */
  PERIOD_FORMAT_REGEX: /^\d{4}-(0[1-9]|1[0-2])$/,

  /**
   * Maximum employees per EMP201 (SARS limit)
   */
  MAX_EMPLOYEES_PER_SUBMISSION: 500,

  /**
   * PAYE reference format (7 digits + 3 check characters)
   */
  PAYE_REFERENCE_REGEX: /^\d{7}[A-Z]{3}$/,
};

/**
 * EMP201 validation thresholds
 */
export const EMP201_VALIDATION = {
  /**
   * Warn if average salary exceeds this (R100,000/month)
   */
  HIGH_AVERAGE_SALARY_CENTS: 10000000,

  /**
   * Warn if total PAYE deduction rate exceeds this
   */
  HIGH_PAYE_RATE_THRESHOLD: new Decimal('0.45'),

  /**
   * Minimum expected PAYE rate for high earners
   */
  MIN_EXPECTED_PAYE_RATE: new Decimal('0.18'),
};
