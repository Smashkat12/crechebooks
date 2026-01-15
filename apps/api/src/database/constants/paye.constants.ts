/**
 * PAYE Constants for South African SARS Compliance
 * TASK-SARS-012
 *
 * 2025 Tax Year Tables (1 March 2024 - 28 February 2025)
 * All monetary values in CENTS
 */
import Decimal from 'decimal.js';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/**
 * Tax bracket structure for PAYE service calculations
 *
 * @deprecated Consider migrating to TaxTableService which uses the configurable
 * TaxBracket interface from tax-tables.constants.ts. The TaxTableService provides:
 * - Multiple tax year support with date-based lookup
 * - CRUD operations for admin configuration
 * - Caching for performance
 *
 * TODO: Consolidate PayeService to use TaxTableService internally (TASK-STAFF-005 integration)
 */
export interface PayeTaxBracket {
  /** Minimum annual income in cents */
  minIncomeCents: number;
  /** Maximum annual income in cents (null for top bracket) */
  maxIncomeCents: number | null;
  /** Base tax amount in cents */
  baseAmountCents: number;
  /** Marginal rate as decimal (e.g., 0.18 for 18%) */
  rate: Decimal;
}

/**
 * 2025 SARS Tax Brackets
 * Effective 1 March 2024 - 28 February 2025
 *
 * @deprecated Use TaxTableService.getTaxYearByCode('2024/2025') instead
 */
export const TAX_BRACKETS_2025: PayeTaxBracket[] = [
  {
    minIncomeCents: 0,
    maxIncomeCents: 23710000, // R237,100
    baseAmountCents: 0,
    rate: new Decimal('0.18'), // 18%
  },
  {
    minIncomeCents: 23710100, // R237,101
    maxIncomeCents: 37050000, // R370,500
    baseAmountCents: 4267800, // R42,678
    rate: new Decimal('0.26'), // 26%
  },
  {
    minIncomeCents: 37050100, // R370,501
    maxIncomeCents: 51280000, // R512,800
    baseAmountCents: 7736200, // R77,362
    rate: new Decimal('0.31'), // 31%
  },
  {
    minIncomeCents: 51280100, // R512,801
    maxIncomeCents: 67300000, // R673,000
    baseAmountCents: 12147500, // R121,475
    rate: new Decimal('0.36'), // 36%
  },
  {
    minIncomeCents: 67300100, // R673,001
    maxIncomeCents: 85790000, // R857,900
    baseAmountCents: 17914700, // R179,147
    rate: new Decimal('0.39'), // 39%
  },
  {
    minIncomeCents: 85790100, // R857,901
    maxIncomeCents: 181700000, // R1,817,000
    baseAmountCents: 25125800, // R251,258
    rate: new Decimal('0.41'), // 41%
  },
  {
    minIncomeCents: 181700100, // R1,817,001
    maxIncomeCents: null, // No upper limit
    baseAmountCents: 64448900, // R644,489
    rate: new Decimal('0.45'), // 45%
  },
];

/**
 * 2025 Tax Rebates (annual amounts in cents)
 */
export const REBATES_2025 = {
  /** Primary rebate - all taxpayers */
  PRIMARY: 1723500, // R17,235
  /** Secondary rebate - age 65 and older */
  SECONDARY: 944400, // R9,444
  /** Tertiary rebate - age 75 and older */
  TERTIARY: 314500, // R3,145
};

/**
 * 2025 Medical Aid Tax Credits (monthly amounts in cents)
 */
export const MEDICAL_CREDITS_2025 = {
  /** Main member monthly credit */
  MAIN_MEMBER: 36400, // R364
  /** First dependent monthly credit */
  FIRST_DEPENDENT: 36400, // R364
  /** Additional dependents monthly credit (each) */
  ADDITIONAL_DEPENDENT: 24600, // R246
};

/**
 * 2025 Tax Thresholds (annual income below which no tax is payable)
 */
export const TAX_THRESHOLDS_2025 = {
  /** Below age 65 */
  BELOW_65: 9575000, // R95,750
  /** Age 65 to 74 */
  AGE_65_TO_74: 14821700, // R148,217
  /** Age 75 and above */
  AGE_75_PLUS: 16568900, // R165,689
};

/**
 * Pay frequency multipliers for annualization
 */
export const PAY_FREQUENCY_MULTIPLIERS = {
  MONTHLY: 12,
  WEEKLY: 52,
  DAILY: 261, // SA standard working days per year
  HOURLY: 2088, // 261 days * 8 hours
};
