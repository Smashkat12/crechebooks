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

export interface InvoiceLine {
  id: string;
  description: string;
  childName: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  vatAmount?: number; // VAT amount for this line item
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
