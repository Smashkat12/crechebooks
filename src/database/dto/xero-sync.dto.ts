/**
 * Xero Sync DTOs
 * TASK-TRANS-014
 *
 * Types for Xero synchronization operations.
 * All monetary values are in cents (integers).
 */

/**
 * Result of syncing multiple transactions to Xero
 */
export interface SyncResult {
  totalProcessed: number;
  synced: number;
  failed: number;
  skipped: number;
  errors: SyncError[];
}

/**
 * Individual sync error details
 */
export interface SyncError {
  transactionId: string;
  error: string;
  code?: string;
}

/**
 * Result of syncing Chart of Accounts from Xero
 */
export interface CategorySyncResult {
  accountsFetched: number;
  newAccounts: string[];
  errors: string[];
}

/**
 * Result of pulling transactions from Xero
 */
export interface PullResult {
  transactionsPulled: number;
  duplicatesSkipped: number;
  errors: string[];
}

/**
 * DTO for pushing a transaction to Xero
 */
export interface PushToXeroDto {
  transactionId: string;
  tenantId: string;
}

/**
 * DTO for pulling transactions from Xero
 */
export interface PullFromXeroDto {
  tenantId: string;
  dateFrom: Date;
  dateTo: Date;
  bankAccount?: string;
}

/**
 * DTO for syncing Chart of Accounts
 */
export interface SyncAccountsDto {
  tenantId: string;
}

/**
 * Xero tax type mapping for South African VAT
 */
export const VAT_TO_XERO_TAX: Record<string, string> = {
  STANDARD: 'OUTPUT2', // 15% SA VAT
  ZERO_RATED: 'ZERORATEDOUTPUT',
  EXEMPT: 'EXEMPTOUTPUT',
  NO_VAT: 'NONE',
};

/**
 * Reverse mapping from Xero tax type to CrecheBooks VatType
 */
export const XERO_TAX_TO_VAT: Record<string, string> = {
  OUTPUT2: 'STANDARD',
  ZERORATEDOUTPUT: 'ZERO_RATED',
  EXEMPTOUTPUT: 'EXEMPT',
  NONE: 'NO_VAT',
};
