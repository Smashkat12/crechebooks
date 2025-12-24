/**
 * Invoice Line Entity
 * Individual line items on an invoice
 */

export enum LineType {
  MONTHLY_FEE = 'MONTHLY_FEE',
  REGISTRATION = 'REGISTRATION',
  EXTRA = 'EXTRA',
  DISCOUNT = 'DISCOUNT',
  CREDIT = 'CREDIT',
  // Creche-specific line types (VAT applicable)
  BOOKS = 'BOOKS',
  SCHOOL_TRIP = 'SCHOOL_TRIP',
  STATIONERY = 'STATIONERY',
  UNIFORM = 'UNIFORM',
  // TASK-BILL-017: Ad-hoc charges (field trips, late fees, materials)
  AD_HOC = 'AD_HOC',
}

/**
 * Determines whether VAT should be applied to a line item.
 *
 * Per South African VAT rules for educational services:
 * - Educational/tuition fees (MONTHLY_FEE, REGISTRATION) are VAT exempt
 * - Supplies and goods (BOOKS, STATIONERY, UNIFORM) are VAT applicable at 15%
 * - Services like school trips are VAT applicable at 15%
 * - DISCOUNT and CREDIT do not attract VAT themselves
 *
 * @param lineType - The type of invoice line item
 * @returns true if VAT should be applied, false otherwise
 */
export function isVatApplicable(lineType: LineType): boolean {
  switch (lineType) {
    // VAT EXEMPT - Educational services
    case LineType.MONTHLY_FEE:
    case LineType.REGISTRATION:
      return false;

    // VAT APPLICABLE - Goods and non-educational services
    case LineType.BOOKS:
    case LineType.SCHOOL_TRIP:
    case LineType.STATIONERY:
    case LineType.UNIFORM:
    case LineType.EXTRA:
    case LineType.AD_HOC: // TASK-BILL-017: Ad-hoc charges (typically goods/services)
      return true;

    // NO VAT - Adjustments (discounts/credits don't attract VAT themselves)
    case LineType.DISCOUNT:
    case LineType.CREDIT:
      return false;
  }

  // This should be unreachable if all enum values are handled
  // The type assertion ensures TypeScript understands exhaustiveness
  const _exhaustiveCheck: never = lineType;
  throw new Error(`Unknown LineType: ${String(_exhaustiveCheck)}`);
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
