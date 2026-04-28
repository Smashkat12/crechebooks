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
 * Source: SARS Gazette No. 50236 (Budget 2024) — rates-of-tax-for-individuals
 *
 * @deprecated Use TaxTableService.getTaxYearByCode('2024/2025') instead
 */
export const TAX_BRACKETS_2025: PayeTaxBracket[] = [
  {
    minIncomeCents: 0,
    maxIncomeCents: 23710000, // R237,100 — SARS bracket 1 ceiling
    baseAmountCents: 0,
    rate: new Decimal('0.18'), // 18%
  },
  {
    minIncomeCents: 23710100, // R237,101 — SARS bracket 2 floor
    maxIncomeCents: 37050000, // R370,500
    baseAmountCents: 4267800, // R42,678 (R237,100 * 18%)
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

// ============================================================================
// 2025/2026 Tax Year (1 March 2025 - 28 February 2026)
// TASK-SARS-034
// TODO: Update with official SARS Gazette values when published
// ============================================================================

/**
 * 2026 SARS Tax Brackets
 * Effective 1 March 2025 - 28 February 2026
 * Source: SARS Gazette No. 51305 (Budget 2025) — rates-of-tax-for-individuals
 * Note: 2025 Budget held bracket boundaries at 2024/2025 levels (no inflation
 * adjustment to brackets; only rebates/thresholds adjusted slightly).
 */
export const TAX_BRACKETS_2026: PayeTaxBracket[] = [
  {
    minIncomeCents: 0,
    maxIncomeCents: 23710000, // R237,100 — SARS bracket 1 ceiling (unchanged from 2024/25)
    baseAmountCents: 0,
    rate: new Decimal('0.18'), // 18%
  },
  {
    minIncomeCents: 23710100, // R237,101 — SARS bracket 2 floor
    maxIncomeCents: 37050000, // R370,500
    baseAmountCents: 4267800, // R42,678 (R237,100 * 18%)
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
 * 2026 Tax Rebates (annual amounts in cents)
 * Effective 1 March 2025 - 28 February 2026
 */
export const REBATES_2026 = {
  /** Primary rebate - all taxpayers */
  PRIMARY: 1723500, // R17,235
  /** Secondary rebate - age 65 and older */
  SECONDARY: 944400, // R9,444
  /** Tertiary rebate - age 75 and older */
  TERTIARY: 314500, // R3,145
};

/**
 * 2026 Medical Aid Tax Credits (monthly amounts in cents)
 * Effective 1 March 2025 - 28 February 2026
 */
export const MEDICAL_CREDITS_2026 = {
  /** Main member monthly credit */
  MAIN_MEMBER: 36400, // R364
  /** First dependent monthly credit */
  FIRST_DEPENDENT: 36400, // R364
  /** Additional dependents monthly credit (each) */
  ADDITIONAL_DEPENDENT: 24600, // R246
};

/**
 * 2026 Tax Thresholds (annual income below which no tax is payable)
 * Effective 1 March 2025 - 28 February 2026
 */
export const TAX_THRESHOLDS_2026 = {
  /** Below age 65 */
  BELOW_65: 9575000, // R95,750
  /** Age 65 to 74 */
  AGE_65_TO_74: 14821700, // R148,217
  /** Age 75 and above */
  AGE_75_PLUS: 16568900, // R165,689
};

// ============================================================================
// 2026/2027 Tax Year (1 March 2026 - 28 February 2027)
// TASK-TAX-YEAR-2027
// IMPORTANT: SARS 2026 Budget Speech delivered February 2026.
// No authoritative 2026/2027 gazette was available at the time of writing.
// These values are COPIED from 2025/2026. Verify against the official SARS
// Gazette and update before the first EMP201 submission for March 2026.
// ============================================================================

/**
 * 2027 SARS Tax Brackets
 * Effective 1 March 2026 - 28 February 2027
 *
 * WARNING: Copied from 2025/2026 — VERIFY against SARS official gazette
 * before first payroll run for March 2026.
 */
export const TAX_BRACKETS_2027: PayeTaxBracket[] = [
  {
    minIncomeCents: 0,
    maxIncomeCents: 23710000, // R237,100 — VERIFY against 2026 Budget
    baseAmountCents: 0,
    rate: new Decimal('0.18'), // 18%
  },
  {
    minIncomeCents: 23710100, // R237,101
    maxIncomeCents: 37050000, // R370,500 — VERIFY
    baseAmountCents: 4267800, // R42,678
    rate: new Decimal('0.26'), // 26%
  },
  {
    minIncomeCents: 37050100, // R370,501
    maxIncomeCents: 51280000, // R512,800 — VERIFY
    baseAmountCents: 7736200, // R77,362
    rate: new Decimal('0.31'), // 31%
  },
  {
    minIncomeCents: 51280100, // R512,801
    maxIncomeCents: 67300000, // R673,000 — VERIFY
    baseAmountCents: 12147500, // R121,475
    rate: new Decimal('0.36'), // 36%
  },
  {
    minIncomeCents: 67300100, // R673,001
    maxIncomeCents: 85790000, // R857,900 — VERIFY
    baseAmountCents: 17914700, // R179,147
    rate: new Decimal('0.39'), // 39%
  },
  {
    minIncomeCents: 85790100, // R857,901
    maxIncomeCents: 181700000, // R1,817,000 — VERIFY
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
 * 2027 Tax Rebates (annual amounts in cents)
 * Effective 1 March 2026 - 28 February 2027
 * WARNING: Copied from 2025/2026 — VERIFY against SARS official gazette
 */
export const REBATES_2027 = {
  /** Primary rebate - all taxpayers */
  PRIMARY: 1723500, // R17,235 — VERIFY
  /** Secondary rebate - age 65 and older */
  SECONDARY: 944400, // R9,444 — VERIFY
  /** Tertiary rebate - age 75 and older */
  TERTIARY: 314500, // R3,145 — VERIFY
};

/**
 * 2027 Medical Aid Tax Credits (monthly amounts in cents)
 * Effective 1 March 2026 - 28 February 2027
 * WARNING: Copied from 2025/2026 — VERIFY against SARS official gazette
 */
export const MEDICAL_CREDITS_2027 = {
  /** Main member monthly credit */
  MAIN_MEMBER: 36400, // R364 — VERIFY
  /** First dependent monthly credit */
  FIRST_DEPENDENT: 36400, // R364 — VERIFY
  /** Additional dependents monthly credit (each) */
  ADDITIONAL_DEPENDENT: 24600, // R246 — VERIFY
};

/**
 * 2027 Tax Thresholds (annual income below which no tax is payable)
 * Effective 1 March 2026 - 28 February 2027
 * WARNING: Copied from 2025/2026 — VERIFY against SARS official gazette
 */
export const TAX_THRESHOLDS_2027 = {
  /** Below age 65 */
  BELOW_65: 9575000, // R95,750 — VERIFY
  /** Age 65 to 74 */
  AGE_65_TO_74: 14821700, // R148,217 — VERIFY
  /** Age 75 and above */
  AGE_75_PLUS: 16568900, // R165,689 — VERIFY
};

// ============================================================================
// Tax Year Selection Utilities
// ============================================================================

/**
 * Determines the South African tax year for a given date.
 * SA tax year runs from 1 March to 28/29 February.
 *
 * @param date - The date to determine the tax year for
 * @returns Tax year string in format "YYYY/YYYY" (e.g., "2024/2025")
 */
export function getTaxYear(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1; // 1-indexed (January = 1)

  // SA Tax year runs March to February
  // If month >= 3 (March onwards), we're in the year/year+1 tax year
  // If month < 3 (Jan/Feb), we're still in the previous year's tax year
  if (month >= 3) {
    return `${year}/${year + 1}`;
  }
  return `${year - 1}/${year}`;
}

/**
 * Tax tables structure returned by getTaxYearTables
 */
export interface TaxYearTables {
  brackets: PayeTaxBracket[];
  rebates: typeof REBATES_2025;
  medicalCredits: typeof MEDICAL_CREDITS_2025;
  thresholds: typeof TAX_THRESHOLDS_2025;
  taxYear: string;
}

/**
 * Gets the appropriate tax tables for a given pay period date.
 * Automatically selects the correct tax year based on the date.
 *
 * @param payPeriodDate - The date of the pay period (defaults to current date)
 * @returns Object containing all tax tables for the applicable tax year
 */
export function getTaxYearTables(payPeriodDate?: Date): TaxYearTables {
  const date = payPeriodDate || new Date();
  const taxYear = getTaxYear(date);

  switch (taxYear) {
    case '2026/2027':
      // WARNING: brackets/rebates/thresholds copied from 2025/2026.
      // Verify against official SARS gazette before first March 2026 payroll.
      return {
        brackets: TAX_BRACKETS_2027,
        rebates: REBATES_2027,
        medicalCredits: MEDICAL_CREDITS_2027,
        thresholds: TAX_THRESHOLDS_2027,
        taxYear,
      };
    case '2025/2026':
      return {
        brackets: TAX_BRACKETS_2026,
        rebates: REBATES_2026,
        medicalCredits: MEDICAL_CREDITS_2026,
        thresholds: TAX_THRESHOLDS_2026,
        taxYear,
      };
    case '2024/2025':
    default:
      // Default to 2024/2025 for older dates or unrecognized tax years
      return {
        brackets: TAX_BRACKETS_2025,
        rebates: REBATES_2025,
        medicalCredits: MEDICAL_CREDITS_2025,
        thresholds: TAX_THRESHOLDS_2025,
        taxYear: '2024/2025',
      };
  }
}
