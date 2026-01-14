/**
 * Invoice Line Entity
 * Individual line items on an invoice
 *
 * TASK-BILL-038: SA VAT Compliance Enhancement
 * - Added new LineTypes for proper VAT categorization
 * - Updated isVatApplicable() with VAT Act Section 12(h) references
 */

/**
 * Line types for invoice line items
 *
 * Categorized by VAT treatment per South African VAT Act No. 89 of 1991:
 * - VAT EXEMPT: Educational/childcare services (Section 12(h))
 * - VAT APPLICABLE: Goods and non-educational services (15%)
 * - NO VAT: Adjustments (discounts, credits)
 */
export enum LineType {
  // ═══════════════════════════════════════════════════════════════════════════
  // VAT EXEMPT - Educational/Childcare Services (Section 12(h))
  // ═══════════════════════════════════════════════════════════════════════════

  /** Monthly childcare/creche fees - Section 12(h)(iii) */
  MONTHLY_FEE = 'MONTHLY_FEE',

  /** Initial registration fee - Section 12(h)(ii) */
  REGISTRATION = 'REGISTRATION',

  /** TASK-BILL-038: Annual re-registration for continuing students - Section 12(h)(ii) */
  RE_REGISTRATION = 'RE_REGISTRATION',

  /** TASK-BILL-038: Extra-mural activities subordinate to education - Section 12(h)(ii) */
  EXTRA_MURAL = 'EXTRA_MURAL',

  // ═══════════════════════════════════════════════════════════════════════════
  // VAT APPLICABLE - Goods & Non-Educational Services (15%)
  // ═══════════════════════════════════════════════════════════════════════════

  /** Books and educational materials sold separately */
  BOOKS = 'BOOKS',

  /** School trips and outings (service, not educational) */
  SCHOOL_TRIP = 'SCHOOL_TRIP',

  /** Stationery and school supplies */
  STATIONERY = 'STATIONERY',

  /** School uniforms */
  UNIFORM = 'UNIFORM',

  /** TASK-BILL-038: Prepared meals (food ready for consumption) */
  MEALS = 'MEALS',

  /** TASK-BILL-038: Transport fees (to/from school) */
  TRANSPORT = 'TRANSPORT',

  /** TASK-BILL-038: Late pickup penalty fees */
  LATE_PICKUP = 'LATE_PICKUP',

  /** TASK-BILL-038: Damaged equipment replacement charges */
  DAMAGED_EQUIPMENT = 'DAMAGED_EQUIPMENT',

  /**
   * Ad-hoc charges - VAT determined by isVatExempt flag
   * Default: VAT applicable unless explicitly marked exempt
   * @see TASK-BILL-017 TASK-BILL-038
   */
  AD_HOC = 'AD_HOC',

  /**
   * @deprecated Use specific line types (MEALS, TRANSPORT, etc.)
   * Kept for backward compatibility - assumes VAT applicable
   */
  EXTRA = 'EXTRA',

  // ═══════════════════════════════════════════════════════════════════════════
  // NO VAT - Adjustments
  // ═══════════════════════════════════════════════════════════════════════════

  /** Discount (negative amount) */
  DISCOUNT = 'DISCOUNT',

  /** Credit applied (negative amount) */
  CREDIT = 'CREDIT',
}

/**
 * Determines whether VAT should be applied to a line item.
 *
 * Per South African VAT Act No. 89 of 1991, Section 12(h):
 * - Educational/childcare services are VAT EXEMPT (0%)
 * - Goods and non-educational services are VAT APPLICABLE (15%)
 * - Adjustments (discounts, credits) do not attract VAT
 *
 * @see https://www.sars.gov.za - VAT Act Section 12
 * @see TASK-BILL-038 - SA VAT Compliance Enhancement
 *
 * @param lineType - The type of invoice line item
 * @param isExemptOverride - Optional override for AD_HOC items (true = exempt, false = applicable)
 * @returns true if VAT should be applied, false otherwise
 *
 * @example
 * // Regular line type - uses predefined VAT treatment
 * isVatApplicable(LineType.MONTHLY_FEE);  // false - exempt
 * isVatApplicable(LineType.MEALS);        // true - applicable
 *
 * @example
 * // AD_HOC with override - parent can specify if educational
 * isVatApplicable(LineType.AD_HOC);             // true - default applicable
 * isVatApplicable(LineType.AD_HOC, true);       // false - marked as exempt
 * isVatApplicable(LineType.AD_HOC, false);      // true - explicitly applicable
 */
export function isVatApplicable(
  lineType: LineType,
  isExemptOverride?: boolean,
): boolean {
  // AD_HOC items use explicit override flag when provided
  if (lineType === LineType.AD_HOC && isExemptOverride !== undefined) {
    return !isExemptOverride;
  }

  switch (lineType) {
    // ═══════════════════════════════════════════════════════════════════════════
    // VAT EXEMPT - Educational/Childcare Services (Section 12(h))
    // ═══════════════════════════════════════════════════════════════════════════
    case LineType.MONTHLY_FEE: // Section 12(h)(iii) - Childcare services
    case LineType.REGISTRATION: // Section 12(h)(ii) - School fees
    case LineType.RE_REGISTRATION: // Section 12(h)(ii) - School fees
    case LineType.EXTRA_MURAL: // Section 12(h)(ii) - Subordinate to education
      return false;

    // ═══════════════════════════════════════════════════════════════════════════
    // VAT APPLICABLE - Goods & Non-Educational Services (15%)
    // ═══════════════════════════════════════════════════════════════════════════
    case LineType.BOOKS: // Goods - not exempt
    case LineType.SCHOOL_TRIP: // Service - not educational
    case LineType.STATIONERY: // Goods - not exempt
    case LineType.UNIFORM: // Goods - not exempt
    case LineType.MEALS: // Prepared food - not zero-rated
    case LineType.TRANSPORT: // Service - not educational
    case LineType.LATE_PICKUP: // Penalty - not educational
    case LineType.DAMAGED_EQUIPMENT: // Replacement - goods
    case LineType.AD_HOC: // Default: VAT applicable unless overridden
    case LineType.EXTRA: // Deprecated: Assume VAT applicable
      return true;

    // ═══════════════════════════════════════════════════════════════════════════
    // NO VAT - Adjustments (do not attract VAT themselves)
    // ═══════════════════════════════════════════════════════════════════════════
    case LineType.DISCOUNT:
    case LineType.CREDIT:
      return false;
  }

  // Exhaustive check - TypeScript will catch if a case is missed
  const _exhaustiveCheck: never = lineType;
  throw new Error(
    `[TASK-BILL-038] Unknown LineType: ${String(_exhaustiveCheck)}. ` +
      `This indicates a missing case in isVatApplicable(). ` +
      `Please add the new LineType to the appropriate VAT category.`,
  );
}

export interface IInvoiceLine {
  id: string;
  invoiceId: string;
  description: string;
  quantity: number;
  unitPriceCents: number;
  discountCents: number;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  lineType: LineType;
  accountCode: string | null;
  sortOrder: number;
  createdAt: Date;
}
