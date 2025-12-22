// Transaction types

export interface ITransaction {
  id: string;
  tenantId: string;
  bankAccountId?: string;
  xeroTransactionId?: string;
  date: Date;
  description: string;
  reference?: string;
  amount: number; // Stored in cents
  type: TransactionType;
  status: TransactionStatus;
  categoryId?: string;
  accountCode?: string;
  vatAmount?: number;
  payeeId?: string;
  reconciled: boolean;
  reconciledAt?: Date;
  confidence?: number;
  needsReview: boolean;
}

export enum TransactionType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  CATEGORIZED = 'CATEGORIZED',
  RECONCILED = 'RECONCILED',
  NEEDS_REVIEW = 'NEEDS_REVIEW',
}

export interface ICategorizationResult {
  transactionId: string;
  categoryId: string;
  accountCode: string;
  confidence: number;
  reasoning?: string;
  needsReview: boolean;
}

export interface IPayeePattern {
  id: string;
  tenantId: string;
  pattern: string;
  payeeName: string;
  defaultCategoryId?: string;
  defaultAccountCode?: string;
  matchCount: number;
}
