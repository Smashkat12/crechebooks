/**
 * Tax Tables Constants for South African SARS Compliance
 * TASK-STAFF-005: Make Tax Tables Configurable
 *
 * Provides interfaces and seed data for configurable tax years and brackets.
 * All monetary values in CENTS (integers)
 */
import Decimal from 'decimal.js';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/**
 * Tax Year interface for storing tax configuration by year
 */
export interface TaxYear {
  /** Unique identifier */
  id: string;
  /** Tax year code (e.g., '2024/2025') */
  yearCode: string;
  /** Start date of tax year (e.g., March 1, 2024) */
  effectiveFrom: Date;
  /** End date of tax year (e.g., February 28, 2025) */
  effectiveTo: Date;
  /** Whether this tax year is active */
  isActive: boolean;
  /** Primary rebate - all taxpayers (annual, in cents) */
  primaryRebateCents: number;
  /** Secondary rebate - age 65+ (annual, in cents) */
  secondaryRebateCents: number;
  /** Tertiary rebate - age 75+ (annual, in cents) */
  tertiaryRebateCents: number;
  /** Tax threshold below 65 (annual, in cents) */
  taxThresholdCents: number;
  /** Tax threshold for age 65-74 (annual, in cents) */
  taxThresholdOver65Cents: number;
  /** Tax threshold for age 75+ (annual, in cents) */
  taxThresholdOver75Cents: number;
  /** Medical aid credit - main member (monthly, in cents) */
  medicalCreditsMainCents: number;
  /** Medical aid credit - first dependent (monthly, in cents) */
  medicalCreditsFirstDependentCents: number;
  /** Medical aid credit - other dependents (monthly, in cents) */
  medicalCreditsOtherDependentsCents: number;
  /** Associated tax brackets */
  brackets: TaxBracket[];
  /** Audit fields */
  createdAt?: Date;
  updatedAt?: Date;
  createdBy?: string;
  updatedBy?: string;
}

/**
 * Tax Bracket interface for progressive tax calculation
 */
export interface TaxBracket {
  /** Unique identifier */
  id: string;
  /** Reference to parent tax year */
  taxYearId: string;
  /** Lower bound of bracket (inclusive, in cents) */
  lowerBoundCents: number;
  /** Upper bound of bracket (null for highest bracket, in cents) */
  upperBoundCents: number | null;
  /** Base tax amount at lower bound (in cents) */
  baseTaxCents: number;
  /** Marginal rate as decimal (e.g., 0.18 for 18%) */
  marginalRate: Decimal;
  /** Order of bracket (1 = lowest income) */
  bracketOrder: number;
}

/**
 * DTO for creating a new tax bracket
 */
export interface CreateTaxBracketDto {
  lowerBoundCents: number;
  upperBoundCents: number | null;
  baseTaxCents: number;
  marginalRate: number;
  bracketOrder: number;
}

/**
 * DTO for creating a new tax year
 */
export interface CreateTaxYearDto {
  yearCode: string;
  effectiveFrom: Date;
  effectiveTo: Date;
  primaryRebateCents: number;
  secondaryRebateCents: number;
  tertiaryRebateCents: number;
  taxThresholdCents: number;
  taxThresholdOver65Cents: number;
  taxThresholdOver75Cents: number;
  medicalCreditsMainCents: number;
  medicalCreditsFirstDependentCents: number;
  medicalCreditsOtherDependentsCents: number;
  brackets: CreateTaxBracketDto[];
}

/**
 * DTO for updating a tax year
 */
export interface UpdateTaxYearDto extends Partial<CreateTaxYearDto> {
  isActive?: boolean;
}

/**
 * PAYE calculation result for TaxTableService
 * Renamed to TaxTablePayeResult to avoid conflict with dto/paye.dto PayeCalculationResult
 */
export interface TaxTablePayeResult {
  /** Original annual income */
  annualIncomeCents: number;
  /** Applicable tax year code */
  taxYearCode: string;
  /** Tax before rebates (annual, in cents) */
  taxBeforeRebatesCents: number;
  /** Primary rebate applied (in cents) */
  primaryRebateCents: number;
  /** Secondary rebate applied (in cents) */
  secondaryRebateCents: number;
  /** Tertiary rebate applied (in cents) */
  tertiaryRebateCents: number;
  /** Total rebates (in cents) */
  totalRebatesCents: number;
  /** Tax after rebates (annual, in cents) */
  taxAfterRebatesCents: number;
  /** Monthly PAYE (in cents) */
  monthlyPayeCents: number;
  /** Applicable tax bracket */
  bracketIndex: number;
  /** Effective tax rate as percentage */
  effectiveRatePercent: number;
}

/**
 * Age category for rebate calculation
 */
export type AgeCategory = 'UNDER_65' | 'AGE_65_TO_74' | 'AGE_75_PLUS';

/**
 * 2024/2025 Tax Year Seed Data
 * Effective 1 March 2024 - 28 February 2025
 * Source: SARS Tax Tables
 */
export const TAX_YEAR_2024_2025: Omit<
  TaxYear,
  'id' | 'brackets' | 'createdAt' | 'updatedAt'
> & {
  brackets: Omit<TaxBracket, 'id' | 'taxYearId'>[];
} = {
  yearCode: '2024/2025',
  effectiveFrom: new Date('2024-03-01'),
  effectiveTo: new Date('2025-02-28'),
  isActive: true,

  // Rebates (annual, in cents)
  primaryRebateCents: 1723500, // R17,235
  secondaryRebateCents: 944400, // R9,444
  tertiaryRebateCents: 314500, // R3,145

  // Tax thresholds (annual, in cents)
  taxThresholdCents: 9575000, // R95,750
  taxThresholdOver65Cents: 14821700, // R148,217
  taxThresholdOver75Cents: 16568900, // R165,689

  // Medical aid credits (monthly, in cents)
  medicalCreditsMainCents: 36400, // R364
  medicalCreditsFirstDependentCents: 36400, // R364
  medicalCreditsOtherDependentsCents: 24600, // R246

  // Tax brackets
  brackets: [
    {
      lowerBoundCents: 0,
      upperBoundCents: 23710000, // R237,100
      baseTaxCents: 0,
      marginalRate: new Decimal('0.18'), // 18%
      bracketOrder: 1,
    },
    {
      lowerBoundCents: 23710000, // R237,100
      upperBoundCents: 37050000, // R370,500
      baseTaxCents: 4267800, // R42,678
      marginalRate: new Decimal('0.26'), // 26%
      bracketOrder: 2,
    },
    {
      lowerBoundCents: 37050000, // R370,500
      upperBoundCents: 51280000, // R512,800
      baseTaxCents: 7736200, // R77,362
      marginalRate: new Decimal('0.31'), // 31%
      bracketOrder: 3,
    },
    {
      lowerBoundCents: 51280000, // R512,800
      upperBoundCents: 67300000, // R673,000
      baseTaxCents: 12147500, // R121,475
      marginalRate: new Decimal('0.36'), // 36%
      bracketOrder: 4,
    },
    {
      lowerBoundCents: 67300000, // R673,000
      upperBoundCents: 85790000, // R857,900
      baseTaxCents: 17914700, // R179,147
      marginalRate: new Decimal('0.39'), // 39%
      bracketOrder: 5,
    },
    {
      lowerBoundCents: 85790000, // R857,900
      upperBoundCents: 181700000, // R1,817,000
      baseTaxCents: 25125800, // R251,258
      marginalRate: new Decimal('0.41'), // 41%
      bracketOrder: 6,
    },
    {
      lowerBoundCents: 181700000, // R1,817,000
      upperBoundCents: null, // No upper limit
      baseTaxCents: 64448900, // R644,489
      marginalRate: new Decimal('0.45'), // 45%
      bracketOrder: 7,
    },
  ],
};

/**
 * 2025/2026 Tax Year Seed Data (placeholder with same rates)
 * Effective 1 March 2025 - 28 February 2026
 * Note: Update these values when SARS announces the 2025/2026 rates
 */
export const TAX_YEAR_2025_2026: Omit<
  TaxYear,
  'id' | 'brackets' | 'createdAt' | 'updatedAt'
> & {
  brackets: Omit<TaxBracket, 'id' | 'taxYearId'>[];
} = {
  yearCode: '2025/2026',
  effectiveFrom: new Date('2025-03-01'),
  effectiveTo: new Date('2026-02-28'),
  isActive: true,

  // Rebates (annual, in cents) - same as 2024/2025 until updated
  primaryRebateCents: 1723500, // R17,235
  secondaryRebateCents: 944400, // R9,444
  tertiaryRebateCents: 314500, // R3,145

  // Tax thresholds (annual, in cents) - same as 2024/2025 until updated
  taxThresholdCents: 9575000, // R95,750
  taxThresholdOver65Cents: 14821700, // R148,217
  taxThresholdOver75Cents: 16568900, // R165,689

  // Medical aid credits (monthly, in cents) - same as 2024/2025 until updated
  medicalCreditsMainCents: 36400, // R364
  medicalCreditsFirstDependentCents: 36400, // R364
  medicalCreditsOtherDependentsCents: 24600, // R246

  // Tax brackets - same as 2024/2025 until updated
  brackets: [
    {
      lowerBoundCents: 0,
      upperBoundCents: 23710000,
      baseTaxCents: 0,
      marginalRate: new Decimal('0.18'),
      bracketOrder: 1,
    },
    {
      lowerBoundCents: 23710000,
      upperBoundCents: 37050000,
      baseTaxCents: 4267800,
      marginalRate: new Decimal('0.26'),
      bracketOrder: 2,
    },
    {
      lowerBoundCents: 37050000,
      upperBoundCents: 51280000,
      baseTaxCents: 7736200,
      marginalRate: new Decimal('0.31'),
      bracketOrder: 3,
    },
    {
      lowerBoundCents: 51280000,
      upperBoundCents: 67300000,
      baseTaxCents: 12147500,
      marginalRate: new Decimal('0.36'),
      bracketOrder: 4,
    },
    {
      lowerBoundCents: 67300000,
      upperBoundCents: 85790000,
      baseTaxCents: 17914700,
      marginalRate: new Decimal('0.39'),
      bracketOrder: 5,
    },
    {
      lowerBoundCents: 85790000,
      upperBoundCents: 181700000,
      baseTaxCents: 25125800,
      marginalRate: new Decimal('0.41'),
      bracketOrder: 6,
    },
    {
      lowerBoundCents: 181700000,
      upperBoundCents: null,
      baseTaxCents: 64448900,
      marginalRate: new Decimal('0.45'),
      bracketOrder: 7,
    },
  ],
};

/**
 * All available tax years for seeding
 */
export const TAX_YEARS_SEED = [TAX_YEAR_2024_2025, TAX_YEAR_2025_2026];

/**
 * Default tax year code to use when none specified
 */
export const DEFAULT_TAX_YEAR_CODE = '2024/2025';

/**
 * Cache TTL for tax tables (in seconds)
 */
export const TAX_TABLE_CACHE_TTL = 3600; // 1 hour

/**
 * Cache key prefix for tax tables
 */
export const TAX_TABLE_CACHE_KEY = 'tax-table';
