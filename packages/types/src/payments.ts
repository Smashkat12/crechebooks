// Payment types

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
