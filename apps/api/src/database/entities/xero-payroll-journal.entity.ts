/**
 * Xero Payroll Journal Entities
 * TASK-STAFF-003: Xero Integration for Payroll Journal Entries
 *
 * This module defines the entity interfaces for:
 * - XeroAccountMapping: Maps internal account types to Xero chart of accounts
 * - PayrollJournal: Tracks payroll journal entries posted to Xero
 * - PayrollJournalLine: Individual debit/credit lines in a journal
 */

// Re-export enums from Prisma (they are the source of truth)
export { XeroAccountType, PayrollJournalStatus } from '@prisma/client';

/**
 * Interface for Xero Account Mapping
 * Maps internal payroll account types to Xero chart of accounts
 */
export interface IXeroAccountMapping {
  id: string;
  tenantId: string;
  accountType: import('@prisma/client').XeroAccountType;
  xeroAccountId: string;
  xeroAccountCode: string;
  xeroAccountName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for Payroll Journal
 * Represents a journal entry to be posted to Xero
 */
export interface IPayrollJournal {
  id: string;
  tenantId: string;
  payrollId: string;
  xeroJournalId: string | null;
  journalNumber: string | null;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  status: import('@prisma/client').PayrollJournalStatus;
  totalDebitCents: number;
  totalCreditCents: number;
  narration: string;
  postedAt: Date | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for Payroll Journal Line
 * Individual debit or credit line in a journal entry
 */
export interface IPayrollJournalLine {
  id: string;
  journalId: string;
  accountType: import('@prisma/client').XeroAccountType;
  xeroAccountCode: string;
  description: string;
  debitCents: number;
  creditCents: number;
  sortOrder: number;
}

// Xero API Response types for integration

/**
 * Xero Account from Accounts API
 * Used when fetching chart of accounts for mapping suggestions
 */
export interface XeroAccount {
  accountId: string;
  code: string;
  name: string;
  type: string;
  class: string;
  status: string;
}

/**
 * Xero Manual Journal for posting
 * Structure expected by Xero API when creating manual journals
 */
export interface XeroManualJournal {
  manualJournalId?: string;
  narration: string;
  date: string;
  status: 'DRAFT' | 'POSTED' | 'VOIDED';
  journalLines: XeroJournalLine[];
}

/**
 * Xero Journal Line for posting
 * Individual line within a manual journal
 */
export interface XeroJournalLine {
  lineAmount: number;
  accountCode: string;
  description: string;
  taxType?: string;
}

/**
 * Xero API Response wrapper
 * Generic response structure from Xero API calls
 */
export interface XeroApiResponse<T> {
  Id: string;
  Status: string;
  ProviderName: string;
  DateTimeUTC: string;
  ManualJournals?: T[];
  Accounts?: T[];
  Errors?: XeroApiError[];
}

/**
 * Xero API Error
 * Error structure returned by Xero API
 */
export interface XeroApiError {
  Message: string;
  Type?: string;
}
