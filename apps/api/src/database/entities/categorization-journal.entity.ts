/**
 * Categorization Journal Entity
 * TASK-XERO-007: Journal Entry Approach for Categorization Sync
 *
 * When a bank transaction is reconciled in Xero, it cannot be edited.
 * This entity tracks journal entries created to move amounts from
 * the suspense account (9999) to the correct expense account.
 */

// Re-export enum from Prisma (source of truth)
export { CategorizationJournalStatus } from '@prisma/client';

/**
 * Interface for Categorization Journal
 * Represents a manual journal entry to move expense from suspense to correct account
 */
export interface ICategorizationJournal {
  id: string;
  tenantId: string;
  transactionId: string;
  xeroJournalId: string | null;
  journalNumber: string | null;
  status: import('@prisma/client').CategorizationJournalStatus;
  fromAccountCode: string; // Suspense account (9999)
  toAccountCode: string; // Target expense account
  amountCents: number;
  isCredit: boolean;
  narration: string;
  postedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a categorization journal
 */
export interface CreateCategorizationJournalInput {
  tenantId: string;
  transactionId: string;
  fromAccountCode: string;
  toAccountCode: string;
  amountCents: number;
  isCredit: boolean;
  narration: string;
}

/**
 * Categorization journal with transaction relation
 */
export interface CategorizationJournalWithTransaction extends ICategorizationJournal {
  transaction: {
    id: string;
    description: string;
    date: Date;
    amountCents: number;
    isCredit: boolean;
    payeeName: string | null;
  };
}

/**
 * Default suspense account code for uncategorized transactions
 */
export const SUSPENSE_ACCOUNT_CODE = '9999';
