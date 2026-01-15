/**
 * South African Payroll Constants
 * TASK-SARS-003: Shared constants between frontend and backend
 *
 * These constants are based on SARS 2024/2025 tax year rates.
 * Reference: https://www.sars.gov.za/
 *
 * IMPORTANT:
 * - Display values are in Rands (R) for UI use
 * - Cents values are integers (R * 100) for calculations
 * - All rates are decimals (1% = 0.01)
 */

/**
 * Unemployment Insurance Fund (UIF) Constants
 *
 * Reference: UI Act No. 63 of 2001
 * https://www.labour.gov.za/unemployment-insurance-fund
 */
export const UIF_CONSTANTS = {
  /** Employee contribution rate (1%) */
  UIF_RATE_EMPLOYEE: 0.01,

  /** Employer contribution rate (1%) */
  UIF_RATE_EMPLOYER: 0.01,

  /** Combined UIF rate (2%) */
  UIF_RATE_COMBINED: 0.02,

  /**
   * Maximum monthly remuneration ceiling for UIF calculation
   * R17,712 per month (2024/2025)
   */
  UIF_CEILING_MONTHLY: 17712,

  /**
   * Annual remuneration ceiling for UIF
   * R212,544 (R17,712 x 12 months)
   */
  UIF_CEILING_ANNUAL: 212544,

  /**
   * Maximum monthly employee UIF contribution cap
   * R177.12 (1% of R17,712)
   */
  UIF_CAP_MONTHLY: 177.12,

  /**
   * Maximum annual employee UIF contribution
   * R2,125.44 (1% of R212,544)
   */
  UIF_CAP_ANNUAL: 2125.44,

  // Cents values for precise calculations
  /** Maximum monthly remuneration in cents */
  UIF_CEILING_MONTHLY_CENTS: 1771200,

  /** Annual remuneration ceiling in cents */
  UIF_CEILING_ANNUAL_CENTS: 21254400,

  /** Maximum monthly employee contribution in cents */
  UIF_CAP_MONTHLY_CENTS: 17712,

  /** Maximum annual employee contribution in cents */
  UIF_CAP_ANNUAL_CENTS: 212544,
} as const;

/**
 * Skills Development Levy (SDL) Constants
 *
 * Reference: Skills Development Levies Act No. 9 of 1999
 * https://www.sars.gov.za/types-of-tax/skills-development-levy/
 */
export const SDL_CONSTANTS = {
  /** SDL rate (1% of total payroll) */
  SDL_RATE: 0.01,

  /**
   * Annual payroll threshold for SDL exemption
   * Companies with annual payroll below R500,000 are exempt
   */
  SDL_THRESHOLD_ANNUAL: 500000,

  /** SDL threshold in cents */
  SDL_THRESHOLD_ANNUAL_CENTS: 50000000,
} as const;

/**
 * Combined Payroll Constants
 * Merged object for convenient access to all payroll-related constants
 */
export const PAYROLL_CONSTANTS = {
  // UIF Constants
  UIF_RATE_EMPLOYEE: UIF_CONSTANTS.UIF_RATE_EMPLOYEE,
  UIF_RATE_EMPLOYER: UIF_CONSTANTS.UIF_RATE_EMPLOYER,
  UIF_RATE_COMBINED: UIF_CONSTANTS.UIF_RATE_COMBINED,
  UIF_CEILING_MONTHLY: UIF_CONSTANTS.UIF_CEILING_MONTHLY,
  UIF_CEILING_ANNUAL: UIF_CONSTANTS.UIF_CEILING_ANNUAL,
  UIF_CAP_MONTHLY: UIF_CONSTANTS.UIF_CAP_MONTHLY,
  UIF_CAP_ANNUAL: UIF_CONSTANTS.UIF_CAP_ANNUAL,
  UIF_CEILING_MONTHLY_CENTS: UIF_CONSTANTS.UIF_CEILING_MONTHLY_CENTS,
  UIF_CEILING_ANNUAL_CENTS: UIF_CONSTANTS.UIF_CEILING_ANNUAL_CENTS,
  UIF_CAP_MONTHLY_CENTS: UIF_CONSTANTS.UIF_CAP_MONTHLY_CENTS,
  UIF_CAP_ANNUAL_CENTS: UIF_CONSTANTS.UIF_CAP_ANNUAL_CENTS,

  // SDL Constants
  SDL_RATE: SDL_CONSTANTS.SDL_RATE,
  SDL_THRESHOLD_ANNUAL: SDL_CONSTANTS.SDL_THRESHOLD_ANNUAL,
  SDL_THRESHOLD_ANNUAL_CENTS: SDL_CONSTANTS.SDL_THRESHOLD_ANNUAL_CENTS,
} as const;

/**
 * Type for UIF constants
 */
export type UIFConstants = typeof UIF_CONSTANTS;

/**
 * Type for SDL constants
 */
export type SDLConstants = typeof SDL_CONSTANTS;

/**
 * Type for all payroll constants
 */
export type PayrollConstants = typeof PAYROLL_CONSTANTS;
