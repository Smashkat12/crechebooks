/**
 * MCP Tool Input/Output Types
 * All monetary values are in cents (integers)
 */

// Tool Input Types
export interface GetAccountsInput {
  tenantId: string;
}

export interface GetTransactionsInput {
  tenantId: string;
  fromDate?: string; // ISO date string
  toDate?: string; // ISO date string
  bankAccount?: string;
}

export interface UpdateTransactionInput {
  tenantId: string;
  transactionId: string;
  accountCode: string;
}

export interface CreateInvoiceInput {
  tenantId: string;
  contactId: string;
  lineItems: CreateInvoiceLineItem[];
  reference?: string;
  dueDate: string; // ISO date string
}

export interface CreateInvoiceLineItem {
  description: string;
  quantity: number;
  unitAmountCents: number; // In cents
  accountCode: string;
  taxType?: string;
}

export interface GetInvoicesInput {
  tenantId: string;
  status?: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED';
  fromDate?: string;
  toDate?: string;
}

export interface ApplyPaymentInput {
  tenantId: string;
  invoiceId: string;
  amountCents: number; // In cents
  paymentDate: string; // ISO date string
  reference?: string;
  bankAccountCode: string;
}

export interface GetContactsInput {
  tenantId: string;
  isCustomer?: boolean;
  isSupplier?: boolean;
}

export interface CreateContactInput {
  tenantId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  isCustomer?: boolean;
  isSupplier?: boolean;
}

// Tool Output Types
export interface UpdateTransactionResult {
  transactionId: string;
  accountCode: string;
  updatedAt: Date;
}

export interface CreatedInvoice {
  invoiceId: string;
  invoiceNumber: string;
  status: string;
  totalCents: number;
}

export interface CreatedPayment {
  paymentId: string;
  invoiceId: string;
  amountCents: number;
  paymentDate: Date;
}

export interface CreatedContact {
  contactId: string;
  name: string;
}

// MCP Error Types
export interface MCPErrorResponse {
  code: string;
  message: string;
  statusCode?: number;
  context?: Record<string, unknown>;
}
