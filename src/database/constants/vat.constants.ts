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
 * Exempt: No VAT, input VAT is NOT claimable
 *
 * Per SA VAT Act Schedule 1:
 * - Financial services
 * - Residential accommodation
 * - Educational services
 */
export const EXEMPT_ACCOUNTS: string[] = [
  '8100', // Bank charges
  '8200', // Interest expense
  '4200', // Residential rent
  '4201', // Long-term insurance
  '4202', // Educational services
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
];
