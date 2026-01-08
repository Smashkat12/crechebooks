/**
 * Invoice Line Type to Xero Account Mapping
 * Maps CrecheBooks invoice line types to Xero Chart of Accounts codes
 *
 * @module database/constants/line-type-accounts
 * @description Mapping for invoice sync to Xero
 *
 * Account codes verified from Think M8 ECD Xero export (Jan 2026)
 */

import { LineType } from '@prisma/client';

/**
 * Maps invoice LineType to Xero account code
 * Used when creating invoices in Xero
 *
 * VAT Treatment per SA VAT Act Section 12(h):
 * - Educational services = EXEMPT (no VAT charged, no input VAT claimed)
 * - Goods sales = STANDARD 15% (VAT charged, input VAT claimable)
 */
export const LINE_TYPE_ACCOUNTS: Record<LineType, string> = {
  // Educational Services (VAT EXEMPT - use EXEMPTOUTPUT in Xero)
  MONTHLY_FEE: '4110', // Monthly Tuition Fees - EXEMPT
  REGISTRATION: '4115', // Registration Fees - EXEMPT
  AD_HOC: '4120', // Activity Fees (educational) - EXEMPT
  EXTRA: '4120', // Extra Curricular Activities - EXEMPT
  DISCOUNT: '4110', // Discount on tuition - EXEMPT
  CREDIT: '4110', // Credit note on tuition - EXEMPT

  // Goods Sales (15% VAT - use OUTPUT in Xero)
  UNIFORM: '4410', // Uniform Sales - 15% VAT
  BOOKS: '4415', // Book Sales - 15% VAT
  STATIONERY: '4420', // Stationery Sales - 15% VAT (CREATE in Xero)
  SCHOOL_TRIP: '4225', // School Trip Income - 15% VAT (CREATE in Xero)
};

/**
 * Line types that are VAT exempt (educational services)
 * Per South African VAT Act Section 12(h) - educational services are exempt
 *
 * Includes:
 * - Tuition fees (core educational service)
 * - Registration fees (part of educational enrollment)
 * - Activity fees (educational enrichment programs)
 * - Extra curricular (educational activities)
 * - Discounts/Credits (follow the VAT treatment of the underlying service)
 */
export const LINE_TYPE_VAT_EXEMPT: LineType[] = [
  'MONTHLY_FEE', // Core tuition - EXEMPT
  'REGISTRATION', // Enrollment fee - EXEMPT
  'AD_HOC', // Educational activities - EXEMPT
  'EXTRA', // Extra curricular education - EXEMPT
  'DISCOUNT', // Follows underlying service
  'CREDIT', // Follows underlying service
];

/**
 * Line types that attract standard VAT (15%)
 * These are GOODS sales, not educational services
 *
 * Per SA VAT Act - sale of goods is standard-rated even by exempt suppliers
 * A creche selling uniforms, books, stationery is making taxable supplies
 */
export const LINE_TYPE_VAT_STANDARD: LineType[] = [
  'UNIFORM', // Goods sale - 15% VAT
  'BOOKS', // Goods sale - 15% VAT
  'STATIONERY', // Goods sale - 15% VAT
  'SCHOOL_TRIP', // May include entrance fees, transport to attractions - 15% VAT
];

/**
 * Helper to get Xero account code for a line type
 */
export function getAccountCodeForLineType(lineType: LineType): string {
  return LINE_TYPE_ACCOUNTS[lineType];
}

/**
 * Helper to check if a line type is VAT exempt
 */
export function isVatExemptLineType(lineType: LineType): boolean {
  return LINE_TYPE_VAT_EXEMPT.includes(lineType);
}

/**
 * Get VAT rate for a line type (0% or 15%)
 */
export function getVatRateForLineType(lineType: LineType): number {
  return isVatExemptLineType(lineType) ? 0 : 15;
}

/**
 * Xero tax type codes for South Africa
 */
export const XERO_TAX_TYPES = {
  EXEMPT: 'EXEMPTOUTPUT', // VAT exempt supplies
  STANDARD: 'OUTPUT', // Standard rate (15%)
  ZERO_RATED: 'ZERORATEDOUTPUT', // Zero-rated supplies
  NO_VAT: 'NONE', // No VAT (out of scope)
};

/**
 * Get Xero tax type for a line type
 */
export function getXeroTaxTypeForLineType(lineType: LineType): string {
  return isVatExemptLineType(lineType)
    ? XERO_TAX_TYPES.EXEMPT
    : XERO_TAX_TYPES.STANDARD;
}
