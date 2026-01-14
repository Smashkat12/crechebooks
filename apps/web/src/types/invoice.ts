export type InvoiceStatus =
  | "draft"
  | "pending"
  | "sent"
  | "paid"
  | "overdue"
  | "cancelled"
  // Uppercase variants from API
  | "DRAFT"
  | "SENT"
  | "PAID"
  | "PARTIALLY_PAID"
  | "OVERDUE"
  | "CANCELLED";

/**
 * TASK-BILL-038: Line types for VAT categorization
 * Maps to LineType enum in backend
 */
export type LineType =
  // VAT EXEMPT - Educational/Childcare Services (Section 12(h))
  | 'MONTHLY_FEE'
  | 'REGISTRATION'
  | 'RE_REGISTRATION'
  | 'EXTRA_MURAL'
  // VAT APPLICABLE - Goods & Non-Educational Services (15%)
  | 'BOOKS'
  | 'STATIONERY'
  | 'UNIFORM'
  | 'SCHOOL_TRIP'
  | 'MEALS'
  | 'TRANSPORT'
  | 'LATE_PICKUP'
  | 'DAMAGED_EQUIPMENT'
  | 'AD_HOC'
  | 'EXTRA'
  // NO VAT - Adjustments
  | 'DISCOUNT'
  | 'CREDIT';

/**
 * TASK-BILL-038: Human-readable labels for line types
 */
export const LINE_TYPE_LABELS: Record<LineType, string> = {
  MONTHLY_FEE: 'Monthly Fee',
  REGISTRATION: 'Registration',
  RE_REGISTRATION: 'Re-Registration',
  EXTRA_MURAL: 'Extra-Mural',
  BOOKS: 'Books',
  STATIONERY: 'Stationery',
  UNIFORM: 'Uniform',
  SCHOOL_TRIP: 'School Trip',
  MEALS: 'Meals',
  TRANSPORT: 'Transport',
  LATE_PICKUP: 'Late Pickup',
  DAMAGED_EQUIPMENT: 'Damaged Equipment',
  AD_HOC: 'Ad-Hoc',
  EXTRA: 'Extra',
  DISCOUNT: 'Discount',
  CREDIT: 'Credit',
};

/**
 * TASK-BILL-038: VAT exempt line types per SA VAT Act Section 12(h)
 */
export const VAT_EXEMPT_LINE_TYPES: LineType[] = [
  'MONTHLY_FEE',
  'REGISTRATION',
  'RE_REGISTRATION',
  'EXTRA_MURAL',
  'DISCOUNT',
  'CREDIT',
];

export interface InvoiceLine {
  id: string;
  description: string;
  childName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  vatAmount?: number; // VAT amount for this line item
  // TASK-BILL-038: VAT compliance fields
  lineType?: LineType;
  isVatExempt?: boolean;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  parentId: string;
  parentName: string;
  // Optional child fields (for single-child invoices)
  childId?: string;
  childName?: string;
  status: InvoiceStatus;
  // Date fields (various formats used across the app)
  invoiceDate?: string;
  issueDate?: string;
  dueDate: string;
  periodStart?: string;
  periodEnd?: string;
  billingPeriodStart?: string;
  billingPeriodEnd?: string;
  lines: InvoiceLine[];
  vatRate?: number;
  // Backend-calculated amounts (use these instead of recalculating)
  subtotal?: number;
  vatAmount?: number;
  vat?: number;
  total?: number;
  balanceDue?: number;
  // Amount fields in cents (transformed from API)
  subtotalCents?: number;
  vatCents?: number;
  totalCents?: number;
  amountPaidCents?: number;
  amountPaid: number;
  paidDate?: string;
  notes?: string;
  deliveryStatus?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface InvoiceWithLines extends Invoice {
  lines: InvoiceLine[];
}

export interface InvoicesListParams {
  status?: InvoiceStatus;
  parentSearch?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}
