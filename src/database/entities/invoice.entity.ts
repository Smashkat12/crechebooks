/**
 * Invoice Entity
 * Tracks billing for childcare services with Xero integration
 */

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  VIEWED = 'VIEWED',
  PARTIALLY_PAID = 'PARTIALLY_PAID',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  VOID = 'VOID',
}

export enum DeliveryMethod {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  BOTH = 'BOTH',
}

export enum DeliveryStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  OPENED = 'OPENED',
  FAILED = 'FAILED',
}

export interface IInvoice {
  id: string;
  tenantId: string;
  xeroInvoiceId: string | null;
  invoiceNumber: string;
  parentId: string;
  childId: string;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  issueDate: Date;
  dueDate: Date;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  amountPaidCents: number;
  status: InvoiceStatus;
  deliveryMethod: DeliveryMethod | null;
  deliveryStatus: DeliveryStatus | null;
  deliveredAt: Date | null;
  notes: string | null;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}
