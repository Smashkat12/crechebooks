/**
 * XeroAccount Entity
 * TASK-XERO-006: Chart of Accounts Database Sync
 *
 * Entity types for storing Xero Chart of Accounts locally
 * for validation before pushing categorizations.
 *
 * CRITICAL: All operations must filter by tenantId.
 */

// Import and re-export the Prisma enum for consistency
import { XeroAccountStatus } from '@prisma/client';
export { XeroAccountStatus };

/**
 * Standard Xero account types
 * Reference: https://developer.xero.com/documentation/api/accounting/types#account-types
 */
export type XeroAccountType =
  | 'BANK'
  | 'CURRENT'
  | 'CURRLIAB'
  | 'DEPRECIATN'
  | 'DIRECTCOSTS'
  | 'EQUITY'
  | 'EXPENSE'
  | 'FIXED'
  | 'INVENTORY'
  | 'LIABILITY'
  | 'NONCURRENT'
  | 'OTHERINCOME'
  | 'OVERHEADS'
  | 'PREPAYMENT'
  | 'REVENUE'
  | 'SALES'
  | 'TERMLIAB'
  | 'PAYGLIABILITY'
  | 'SUPERANNUATIONEXPENSE'
  | 'SUPERANNUATIONLIABILITY'
  | 'WAGESEXPENSE'
  | 'WAGESPAYABLELIABILITY';

/**
 * Core Xero account interface
 */
export interface IXeroAccount {
  id: string;
  tenantId: string;
  accountCode: string;
  name: string;
  type: string;
  taxType: string | null;
  status: XeroAccountStatus;
  xeroAccountId: string | null;
  lastSyncedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Input for creating a new Xero account record
 */
export interface CreateXeroAccountInput {
  tenantId: string;
  accountCode: string;
  name: string;
  type: string;
  taxType?: string;
  status?: XeroAccountStatus;
  xeroAccountId?: string;
  lastSyncedAt?: Date;
}

/**
 * Input for updating a Xero account record
 */
export interface UpdateXeroAccountInput {
  name?: string;
  type?: string;
  taxType?: string | null;
  status?: XeroAccountStatus;
  xeroAccountId?: string;
  lastSyncedAt?: Date;
}

/**
 * Result of Chart of Accounts sync operation
 */
export interface CoaSyncResult {
  /** Total accounts fetched from Xero */
  accountsFetched: number;
  /** Number of new accounts created locally */
  accountsCreated: number;
  /** Number of existing accounts updated */
  accountsUpdated: number;
  /** Number of accounts archived (not in Xero anymore) */
  accountsArchived: number;
  /** Any errors encountered during sync */
  errors: string[];
  /** Timestamp of the sync operation */
  syncedAt: Date;
}

/**
 * Result of account code validation
 */
export interface AccountValidationResult {
  /** Whether the account code is valid and active */
  isValid: boolean;
  /** The account details if found */
  account?: IXeroAccount;
  /** Validation error message if invalid */
  error?: string;
  /** Suggestion for alternative account codes */
  suggestions?: string[];
}

/**
 * Filter options for querying Xero accounts
 */
export interface XeroAccountFilterOptions {
  /** Filter by status */
  status?: XeroAccountStatus;
  /** Filter by account type */
  type?: string;
  /** Filter by account code prefix */
  codePrefix?: string;
  /** Search by name (partial match) */
  nameSearch?: string;
}

/**
 * Xero account from API response (raw format)
 */
export interface XeroApiAccount {
  accountID?: string;
  code?: string;
  name?: string;
  type?: string;
  taxType?: string;
  status?: string;
  class?: string;
  description?: string;
  bankAccountNumber?: string;
  bankAccountType?: string;
  currencyCode?: string;
  enablePaymentsToAccount?: boolean;
  showInExpenseClaims?: boolean;
  reportingCode?: string;
  reportingCodeName?: string;
  hasAttachments?: boolean;
  updatedDateUTC?: string;
}
