/**
 * Invoice Line Type to Xero Account Mapping
 * Maps CrecheBooks invoice line types to Xero Chart of Accounts codes
 *
 * TASK-BILL-038: SA VAT Compliance Enhancement
 * Updated to include all new LineTypes per VAT Act Section 12(h)
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
  // ═══════════════════════════════════════════════════════════════════════════
  // VAT EXEMPT - Educational/Childcare Services (Section 12(h))
  // Use EXEMPTOUTPUT tax type in Xero
  // ═══════════════════════════════════════════════════════════════════════════
  MONTHLY_FEE: '4110', // Monthly Tuition Fees - EXEMPT
  REGISTRATION: '4115', // Registration Fees - EXEMPT
  RE_REGISTRATION: '4115', // TASK-BILL-038: Re-Registration Fees - EXEMPT
  EXTRA_MURAL: '4120', // TASK-BILL-038: Extra-mural Activities - EXEMPT (subordinate to education)
  DISCOUNT: '4110', // Discount on tuition - EXEMPT (follows underlying)
  CREDIT: '4110', // Credit note on tuition - EXEMPT (follows underlying)

  // ═══════════════════════════════════════════════════════════════════════════
  // VAT APPLICABLE - Goods & Non-Educational Services (15%)
  // Use OUTPUT tax type in Xero
  // ═══════════════════════════════════════════════════════════════════════════
  UNIFORM: '4410', // Uniform Sales - 15% VAT
  BOOKS: '4415', // Book Sales - 15% VAT
  STATIONERY: '4420', // Stationery Sales - 15% VAT
  SCHOOL_TRIP: '4225', // School Trip Income - 15% VAT
  MEALS: '4230', // TASK-BILL-038: Meal Income - 15% VAT (prepared food)
  TRANSPORT: '4235', // TASK-BILL-038: Transport Income - 15% VAT
  LATE_PICKUP: '4240', // TASK-BILL-038: Late Pickup Fees - 15% VAT (penalty)
  DAMAGED_EQUIPMENT: '4245', // TASK-BILL-038: Equipment Replacement - 15% VAT (goods)

  // Configurable VAT via isVatExempt flag
  AD_HOC: '4120', // Activity Fees - VAT per isVatExempt flag (default: applicable)
  EXTRA: '4120', // @deprecated - Use specific types - default: applicable
};

/**
 * Line types that are VAT exempt (educational services)
 * Per South African VAT Act Section 12(h) - educational services are exempt
 *
 * TASK-BILL-038: Updated to reflect correct VAT treatment
 * - Core educational services = EXEMPT
 * - Adjustments follow underlying service treatment
 */
export const LINE_TYPE_VAT_EXEMPT: LineType[] = [
  'MONTHLY_FEE', // Section 12(h)(iii) - Childcare services
  'REGISTRATION', // Section 12(h)(ii) - School fees
  'RE_REGISTRATION', // Section 12(h)(ii) - School fees
  'EXTRA_MURAL', // Section 12(h)(ii) - Subordinate to education
  'DISCOUNT', // Follows underlying service
  'CREDIT', // Follows underlying service
];

/**
 * Line types that attract standard VAT (15%)
 * These are GOODS sales or non-educational services
 *
 * TASK-BILL-038: Updated with new line types
 * Per SA VAT Act - sale of goods and non-educational services are standard-rated
 */
export const LINE_TYPE_VAT_STANDARD: LineType[] = [
  'UNIFORM', // Goods sale - 15% VAT
  'BOOKS', // Goods sale - 15% VAT
  'STATIONERY', // Goods sale - 15% VAT
  'SCHOOL_TRIP', // Service - 15% VAT
  'MEALS', // Prepared food - 15% VAT
  'TRANSPORT', // Service - 15% VAT
  'LATE_PICKUP', // Penalty fee - 15% VAT
  'DAMAGED_EQUIPMENT', // Goods replacement - 15% VAT
  'AD_HOC', // Default: 15% VAT (configurable via isVatExempt)
  'EXTRA', // @deprecated Default: 15% VAT
];

/**
 * Helper to get Xero account code for a line type
 */
export function getAccountCodeForLineType(lineType: LineType): string {
  return LINE_TYPE_ACCOUNTS[lineType];
}

/**
 * Helper to check if a line type is VAT exempt
 * Note: For AD_HOC, this returns default behavior; actual exemption is per item
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
