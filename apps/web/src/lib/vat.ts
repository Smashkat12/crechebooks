/**
 * VAT Calculation Utility
 * TASK-BILL-001: Fix Frontend VAT Calculation Mismatch
 *
 * Provides centralized VAT calculation functions that correctly handle:
 * - Item-level VAT exemptions
 * - Organization-level VAT status (standard, exempt, reverse_charge)
 * - Line type-based exemptions per SA VAT Act Section 12(h)
 *
 * Per South African VAT Act No. 89 of 1991, Section 12(h)(iii):
 * Educational services (including childcare) are VAT exempt.
 * This includes: monthly fees, registration, extra-mural activities.
 * Goods and non-educational services remain taxable at 15%.
 */

import { VAT_EXEMPT_LINE_TYPES, type LineType } from '@/types/invoice';

/** Standard SA VAT rate */
export const DEFAULT_VAT_RATE = 15;

/** Organization VAT registration status */
export type OrganizationVatStatus = 'standard' | 'exempt' | 'reverse_charge';

/**
 * Input parameters for VAT calculation
 */
export interface VATCalculationInput {
  /** Amount before VAT (in Rands or cents, depending on context) */
  amount: number;
  /** VAT rate as percentage (e.g., 15 for 15%) */
  vatRate: number;
  /** Whether this specific item is VAT exempt */
  isExempt?: boolean;
  /** Reason for VAT exemption (for audit trail) */
  exemptionReason?: string;
  /** Organization's overall VAT registration status */
  organizationVatStatus?: OrganizationVatStatus;
  /** Line type for automatic exemption detection */
  lineType?: LineType;
}

/**
 * Line item input for VAT calculation
 */
export interface LineItemInput {
  amount: number;
  vatRate?: number;
  isVatExempt?: boolean;
  vatExemptionReason?: string;
  lineType?: LineType;
  /** Pre-calculated VAT amount from backend */
  vatAmount?: number;
}

/**
 * Organization configuration for VAT calculations
 */
export interface OrganizationConfig {
  defaultVatRate: number;
  vatStatus?: OrganizationVatStatus;
}

/**
 * Result of invoice VAT calculation
 */
export interface InvoiceVATResult {
  subtotal: number;
  vatAmount: number;
  total: number;
}

/**
 * Round a currency value to 2 decimal places
 * Uses banker's rounding for consistency
 */
export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

/**
 * Check if a line type is VAT exempt based on SA VAT Act Section 12(h)
 */
export function isLineTypeExempt(lineType: LineType | undefined): boolean {
  if (!lineType) return false;
  return VAT_EXEMPT_LINE_TYPES.includes(lineType);
}

/**
 * Calculate VAT for a single amount
 *
 * Priority order for determining exemption:
 * 1. Explicit isExempt flag (highest priority)
 * 2. Organization VAT status (exempt or reverse_charge)
 * 3. Line type exemption (based on VAT_EXEMPT_LINE_TYPES)
 * 4. Apply standard VAT rate
 *
 * @param input - VAT calculation parameters
 * @returns VAT amount rounded to 2 decimal places
 *
 * @example
 * // Standard VAT calculation
 * calculateVAT({ amount: 100, vatRate: 15 }) // Returns 15
 *
 * @example
 * // Exempt item
 * calculateVAT({ amount: 100, vatRate: 15, isExempt: true }) // Returns 0
 *
 * @example
 * // Exempt by line type
 * calculateVAT({ amount: 100, vatRate: 15, lineType: 'MONTHLY_FEE' }) // Returns 0
 */
export function calculateVAT(input: VATCalculationInput): number {
  const {
    amount,
    vatRate,
    isExempt,
    organizationVatStatus,
    lineType,
  } = input;

  // Handle negative or zero amounts (no VAT on credits/discounts)
  if (amount <= 0) {
    return 0;
  }

  // Check item-level exemption (explicit flag)
  if (isExempt === true) {
    return 0;
  }

  // Check organization-level exemption
  if (organizationVatStatus === 'exempt' || organizationVatStatus === 'reverse_charge') {
    return 0;
  }

  // Check line type exemption (SA VAT Act Section 12(h))
  if (isLineTypeExempt(lineType)) {
    return 0;
  }

  // Calculate VAT and round to 2 decimal places
  return roundCurrency(amount * (vatRate / 100));
}

/**
 * Calculate VAT for a single line item
 *
 * Uses backend-provided vatAmount if available, otherwise calculates
 * based on line item properties and organization config.
 *
 * @param lineItem - Line item data
 * @param organization - Organization VAT configuration
 * @returns VAT amount for the line item
 */
export function calculateLineItemVAT(
  lineItem: LineItemInput,
  organization: OrganizationConfig
): number {
  // If backend provided VAT amount, use it (source of truth)
  if (lineItem.vatAmount !== undefined) {
    return lineItem.vatAmount;
  }

  return calculateVAT({
    amount: lineItem.amount,
    vatRate: lineItem.vatRate ?? organization.defaultVatRate,
    isExempt: lineItem.isVatExempt,
    exemptionReason: lineItem.vatExemptionReason,
    organizationVatStatus: organization.vatStatus,
    lineType: lineItem.lineType,
  });
}

/**
 * Calculate VAT totals for an invoice with multiple line items
 *
 * Correctly handles mixed invoices with both taxable and exempt items.
 * NEVER applies flat VAT rate to entire subtotal.
 *
 * @param lineItems - Array of line items
 * @param organization - Organization VAT configuration
 * @returns Object with subtotal, vatAmount, and total
 *
 * @example
 * const result = calculateInvoiceVAT(
 *   [
 *     { amount: 100, isVatExempt: false }, // Taxable
 *     { amount: 50, isVatExempt: true },   // Exempt
 *   ],
 *   { defaultVatRate: 15, vatStatus: 'standard' }
 * );
 * // Returns { subtotal: 150, vatAmount: 15, total: 165 }
 */
export function calculateInvoiceVAT(
  lineItems: LineItemInput[],
  organization: OrganizationConfig
): InvoiceVATResult {
  const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
  const vatAmount = lineItems.reduce(
    (sum, item) => sum + calculateLineItemVAT(item, organization),
    0
  );

  return {
    subtotal: roundCurrency(subtotal),
    vatAmount: roundCurrency(vatAmount),
    total: roundCurrency(subtotal + vatAmount),
  };
}

/**
 * Determine if an item should display as VAT exempt
 *
 * Used for UI display of VAT status badges.
 *
 * @param lineItem - Line item to check
 * @returns true if the item is VAT exempt
 */
export function isItemVATExempt(lineItem: {
  isVatExempt?: boolean;
  lineType?: LineType;
  vatAmount?: number;
}): boolean {
  // Explicit exemption flag
  if (lineItem.isVatExempt === true) {
    return true;
  }

  // Line type exemption
  if (lineItem.lineType && isLineTypeExempt(lineItem.lineType)) {
    return true;
  }

  // If vatAmount is explicitly 0 or undefined with no other indicators,
  // we can't determine exemption status
  return false;
}

/**
 * Get display text for VAT status
 *
 * @param lineItem - Line item to get status for
 * @param vatRate - Default VAT rate
 * @returns Display text ('Exempt', '15%', or null)
 */
export function getVATStatusDisplay(
  lineItem: {
    isVatExempt?: boolean;
    lineType?: LineType;
    vatAmount?: number;
  },
  vatRate: number = DEFAULT_VAT_RATE
): 'Exempt' | `${number}%` | null {
  if (isItemVATExempt(lineItem)) {
    return 'Exempt';
  }

  if (lineItem.vatAmount !== undefined && lineItem.vatAmount > 0) {
    return `${vatRate}%`;
  }

  return null;
}
