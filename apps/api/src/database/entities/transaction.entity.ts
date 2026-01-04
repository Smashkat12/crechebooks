/**
 * Transaction Entity Types
 * TASK-TRANS-001: Transaction Entity and Migration
 */

export enum ImportSource {
  BANK_FEED = 'BANK_FEED',
  CSV_IMPORT = 'CSV_IMPORT',
  PDF_IMPORT = 'PDF_IMPORT',
  MANUAL = 'MANUAL',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  CATEGORIZED = 'CATEGORIZED',
  REVIEW_REQUIRED = 'REVIEW_REQUIRED',
  SYNCED = 'SYNCED',
}

export interface ITransaction {
  id: string;
  tenantId: string;
  xeroTransactionId: string | null;
  bankAccount: string;
  date: Date;
  description: string;
  payeeName: string | null;
  reference: string | null;
  amountCents: number;
  isCredit: boolean;
  source: ImportSource;
  importBatchId: string | null;
  status: TransactionStatus;
  isReconciled: boolean;
  reconciledAt: Date | null;
  isDeleted: boolean;
  deletedAt: Date | null;
  reversesTransactionId?: string | null;
  isReversal: boolean;
  createdAt: Date;
  updatedAt: Date;
}
