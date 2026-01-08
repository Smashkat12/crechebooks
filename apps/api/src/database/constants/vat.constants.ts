/**
 * VAT Constants for South African SARS Compliance
 * TASK-SARS-011
 *
 * Current SA VAT rate: 15% (as of 2018)
 * All monetary thresholds in CENTS
 */
import Decimal from 'decimal.js';

// Configure Decimal.js for banker's rounding (ROUND_HALF_EVEN)
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

/**
 * VAT calculation constants
 */
export const VAT_CONSTANTS = {
  /** South African VAT rate as decimal (0.15 = 15%) */
  VAT_RATE: new Decimal('0.15'),

  /** VAT rate as percentage */
  VAT_RATE_PERCENT: 15,

  /** Divisor for extracting VAT from inclusive amount (1.15) */
  VAT_DIVISOR: new Decimal('1.15'),

  /** Multiplier for adding VAT to exclusive amount (1.15) */
  VAT_MULTIPLIER: new Decimal('1.15'),

  /**
   * Threshold for requiring supplier VAT number on expenses
   * R5000 = 500000 cents
   * Per SARS, input VAT claims > R5000 require valid supplier VAT number
   */
  VAT_NUMBER_REQUIRED_THRESHOLD_CENTS: 500000,

  /**
   * Threshold for recommending supplier name on expenses
   * R2000 = 200000 cents
   */
  SUPPLIER_NAME_WARNING_THRESHOLD_CENTS: 200000,

  /**
   * Valid South African VAT number format
   * Must be exactly 10 digits
   */
  VAT_NUMBER_REGEX: /^\d{10}$/,
};

/**
 * Account codes for zero-rated supplies
 * Zero-rated: 0% VAT but input VAT is claimable
 *
 * Per SA VAT Act Schedule 2:
 * - Exports of goods
 * - Basic foodstuffs (maize meal, rice, vegetables, fruit, etc.)
 */
export const ZERO_RATED_ACCOUNTS: string[] = [
  '1200', // Exports
  '4100', // Basic foodstuffs
  '4101', // Vegetables
  '4102', // Fruit
  '4103', // Grains/cereals
];

/**
 * Account codes for exempt supplies
 * Exempt: No VAT charged, input VAT is NOT claimable
 *
 * Per SA VAT Act Section 12(h) - Educational services are exempt
 * This includes tuition fees, registration, and educational activities
 */
export const EXEMPT_ACCOUNTS: string[] = [
  // Educational services (Section 12(h))
  '4110', // Monthly Tuition Fees
  '4115', // Registration Fees
  '4120', // Activity Fees (educational)
  '4125', // Transport Fees (student transport)
  '4130', // After Care Fees
  '4135', // Holiday Program Fees
  // Financial services (Section 12(a))
  '7710', // Bank Charges
  '7720', // Interest on Overdraft
  '7725', // Loan Interest
  // Insurance (Section 12(d))
  '6710', // Property Insurance
  '7525', // Vehicle Insurance
  '7610', // Public Liability Insurance
  '7615', // Professional Indemnity Insurance
];

/**
 * Keywords in descriptions that indicate zero-rated supplies
 */
export const ZERO_RATED_KEYWORDS: string[] = [
  'export',
  'exported',
  'international shipping',
  'basic food',
  'maize',
  'brown bread',
  'vegetables',
];

/**
 * Keywords in descriptions that indicate exempt supplies
 */
export const EXEMPT_KEYWORDS: string[] = [
  'bank charge',
  'bank fee',
  'interest',
  'insurance premium',
  'residential rent',
  'educational',
  'tuition',
  'school fees',
  'registration fee',
  'activity fee',
  'after care',
  'transport fee',
];

/**
 * Account codes for standard-rated supplies (15% VAT)
 * These are GOODS sales by the creche - VAT must be charged
 *
 * Even though the creche provides exempt educational services,
 * selling goods (uniforms, books, stationery) is a taxable supply
 */
export const STANDARD_RATED_ACCOUNTS: string[] = [
  '4410', // Uniform Sales - 15% VAT
  '4415', // Book Sales - 15% VAT
  '4420', // Stationery Sales - 15% VAT
  '4225', // School Trip Income - 15% VAT (includes entrance fees)
];

/**
 * Keywords in descriptions that indicate standard-rated supplies
 */
export const STANDARD_RATED_KEYWORDS: string[] = [
  'uniform',
  'book sale',
  'stationery',
  'school trip',
  'excursion',
];
