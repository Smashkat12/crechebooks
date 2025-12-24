/**
 * Duplicate Detection Types
 * TASK-RECON-015: Reconciliation Duplicate Detection Service
 */

export enum DuplicateResolution {
  KEEP_BOTH = 'KEEP_BOTH',
  MERGE = 'MERGE',
  REJECT_NEW = 'REJECT_NEW',
  REJECT_EXISTING = 'REJECT_EXISTING',
}

export enum DuplicateStatus {
  NONE = 'NONE',
  FLAGGED = 'FLAGGED',
  RESOLVED = 'RESOLVED',
}

export interface TransactionInput {
  id?: string;
  tenantId: string;
  bankAccount: string;
  date: Date;
  description: string;
  payeeName?: string | null;
  reference?: string | null;
  amountCents: number;
  isCredit: boolean;
  source: string;
  importBatchId?: string | null;
}

export interface Transaction extends TransactionInput {
  id: string;
  xeroTransactionId?: string | null;
  status: string;
  isReconciled: boolean;
  reconciledAt?: Date | null;
  isDeleted: boolean;
  deletedAt?: Date | null;
  transactionHash?: string | null;
  duplicateOfId?: string | null;
  duplicateStatus: DuplicateStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DuplicateCheckResult {
  clean: TransactionInput[];
  potentialDuplicates: Array<{
    transaction: TransactionInput;
    existingMatch: Transaction;
    confidence: number;
  }>;
}

export interface PotentialDuplicate {
  id: string;
  newTransaction: Transaction;
  existingTransaction: Transaction;
  flaggedAt: Date;
  resolvedAt?: Date;
  resolution?: DuplicateResolution;
}
