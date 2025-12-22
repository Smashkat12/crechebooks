export type InvoiceStatus =
  | "draft"
  | "pending"
  | "sent"
  | "paid"
  | "overdue"
  | "cancelled";

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
  status: InvoiceStatus;
  invoiceDate: string;
  dueDate: string;
  periodStart: string;
  periodEnd: string;
  lines: InvoiceLine[];
  vatRate: number;
  // Backend-calculated amounts (use these instead of recalculating)
  subtotal?: number;
  vatAmount?: number;
  total?: number;
  amountPaid: number;
  paidDate?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
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
