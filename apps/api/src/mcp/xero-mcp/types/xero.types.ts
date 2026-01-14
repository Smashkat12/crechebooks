/**
 * Xero API Response Types
 * All monetary values are in cents (integers)
 */

export interface XeroAccount {
  accountId?: string;
  code: string;
  name: string;
  type: string;
  taxType: string | null;
  status?: string;
  enablePaymentsToAccount: boolean;
}

export interface XeroTransaction {
  transactionId: string;
  bankAccount: string;
  date: Date;
  description: string;
  payeeName: string | null;
  reference: string | null;
  amountCents: number; // Always cents, never decimals
  isCredit: boolean;
  accountCode: string | null;
  status: string;
}

export interface XeroContact {
  contactId: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  isSupplier: boolean;
  isCustomer: boolean;
}

export interface XeroInvoice {
  invoiceId: string;
  invoiceNumber: string;
  contactId: string;
  status: string;
  issueDate: Date;
  dueDate: Date;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  amountPaidCents: number;
  amountDueCents: number;
}

export interface XeroPayment {
  paymentId: string;
  invoiceId: string;
  amountCents: number;
  paymentDate: Date;
  reference: string | null;
}

export interface XeroTokenSet {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
  scope: string;
}
