// Payment types
// TASK-STMT-002: Enhanced payment allocation types for statement generation

/**
 * Summary of a parent's account for statement generation
 */
export interface IParentAccountSummary {
  parentId: string;
  parentName: string;
  email: string | null;
  phone: string | null;
  totalOutstandingCents: number;
  creditBalanceCents: number;
  netBalanceCents: number; // positive = owes, negative = credit
  childCount: number;
  oldestOutstandingDate?: Date;
}

/**
 * Transaction record for account statement
 */
export interface IAccountTransaction {
  id: string;
  date: Date;
  type: 'INVOICE' | 'PAYMENT' | 'CREDIT_NOTE' | 'ADJUSTMENT';
  referenceNumber: string;
  description: string;
  debitCents: number;
  creditCents: number;
  runningBalanceCents: number;
}

/**
 * Input for allocating a payment to invoices
 */
export interface IAllocatePaymentInput {
  tenantId: string;
  transactionId: string;
  parentId: string;
  allocations: IInvoiceAllocation[];
  userId: string;
}

/**
 * Single invoice allocation within a payment
 */
export interface IInvoiceAllocation {
  invoiceId: string;
  amountCents: number;
}

/**
 * Suggested allocation for FIFO payment allocation
 */
export interface ISuggestedAllocation {
  invoiceId: string;
  invoiceNumber: string;
  dueDate: Date;
  outstandingCents: number;
  suggestedAmountCents: number;
}

export interface IPayment {
  id: string;
  tenantId: string;
  transactionId?: string;
  parentId: string;
  amount: number;
  date: Date;
  reference?: string;
  source: PaymentSource;
  status: PaymentStatus;
  allocations: IPaymentAllocation[];
  unallocatedAmount: number;
  matchConfidence?: number;
  matchedBy?: MatchMethod;
}

export interface IPaymentAllocation {
  id: string;
  paymentId: string;
  invoiceId: string;
  amount: number;
  allocatedAt: Date;
}

export enum PaymentSource {
  BANK = 'BANK',
  CASH = 'CASH',
  EFT = 'EFT',
  CARD = 'CARD',
  OTHER = 'OTHER',
}

export enum PaymentStatus {
  UNMATCHED = 'UNMATCHED',
  PARTIALLY_MATCHED = 'PARTIALLY_MATCHED',
  MATCHED = 'MATCHED',
  ALLOCATED = 'ALLOCATED',
}

export enum MatchMethod {
  EXACT = 'EXACT',
  REFERENCE = 'REFERENCE',
  AMOUNT = 'AMOUNT',
  AI = 'AI',
  MANUAL = 'MANUAL',
}

export interface IPaymentMatch {
  paymentId: string;
  invoiceId: string;
  confidence: number;
  matchType: MatchMethod;
  reasoning?: string;
}

export interface IArrears {
  parentId: string;
  parentName: string;
  totalOutstanding: number;
  oldestDueDate: Date;
  daysOverdue: number;
  invoiceCount: number;
  invoices: IArrearsInvoice[];
  lastReminderSent?: Date;
  reminderCount: number;
}

export interface IArrearsInvoice {
  invoiceId: string;
  invoiceNumber: string;
  dueDate: Date;
  amountDue: number;
  daysOverdue: number;
}
