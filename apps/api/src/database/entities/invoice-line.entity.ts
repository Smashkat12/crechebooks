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
