/**
 * TASK-ACCT-UI-002: General Ledger React Query hooks
 * Provides data fetching for general ledger, account ledger, and trial balance.
 */

import { useQuery } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

// Types matching backend DTOs
export type SourceType = 'CATEGORIZATION' | 'PAYROLL' | 'MANUAL' | 'INVOICE' | 'PAYMENT';

export interface JournalEntry {
  id: string;
  date: string;
  description: string;
  accountCode: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
  sourceType: SourceType;
  sourceId: string;
  reference?: string;
}

export interface AccountLedger {
  accountCode: string;
  accountName: string;
  accountType: string;
  openingBalanceCents: number;
  entries: JournalEntry[];
  closingBalanceCents: number;
}

export interface TrialBalanceLine {
  accountCode: string;
  accountName: string;
  accountType: string;
  debitBalanceCents: number;
  creditBalanceCents: number;
}

export interface TrialBalance {
  asOfDate: string;
  lines: TrialBalanceLine[];
  totalDebitsCents: number;
  totalCreditsCents: number;
  isBalanced: boolean;
}

export interface LedgerSummary {
  totalEntries: number;
  totalDebitsCents: number;
  totalCreditsCents: number;
  uniqueAccounts: number;
}

export interface GLListParams extends Record<string, unknown> {
  fromDate: string;
  toDate: string;
  accountCode?: string;
  sourceType?: SourceType;
}

// API response wrapper types
interface ApiResponse<T> {
  success: boolean;
  data: T;
}

interface ApiListResponse<T> {
  success: boolean;
  data: T[];
}

/**
 * Get general ledger entries with filters
 */
export function useGeneralLedger(params: GLListParams) {
  return useQuery<JournalEntry[], AxiosError>({
    queryKey: queryKeys.generalLedger.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiListResponse<JournalEntry>>(endpoints.generalLedger.list, {
        params: {
          from_date: params.fromDate,
          to_date: params.toDate,
          account_code: params.accountCode,
          source_type: params.sourceType,
        },
      });
      return data.data;
    },
    enabled: !!params.fromDate && !!params.toDate,
  });
}

/**
 * Get account ledger (transactions for a specific account)
 */
export function useAccountLedger(accountCode: string, fromDate: string, toDate: string) {
  return useQuery<AccountLedger, AxiosError>({
    queryKey: queryKeys.generalLedger.accountLedger(accountCode, { fromDate, toDate }),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<AccountLedger>>(
        endpoints.generalLedger.accountLedger(accountCode),
        { params: { from_date: fromDate, to_date: toDate } }
      );
      return data.data;
    },
    enabled: !!accountCode && !!fromDate && !!toDate,
  });
}

/**
 * Get trial balance as of a specific date
 */
export function useGLTrialBalance(asOfDate: string) {
  return useQuery<TrialBalance, AxiosError>({
    queryKey: queryKeys.generalLedger.trialBalance(asOfDate),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<TrialBalance>>(endpoints.generalLedger.trialBalance, {
        params: { as_of_date: asOfDate },
      });
      return data.data;
    },
    enabled: !!asOfDate,
  });
}

/**
 * Get ledger summary (totals for a date range)
 */
export function useLedgerSummary(fromDate: string, toDate: string) {
  return useQuery<LedgerSummary, AxiosError>({
    queryKey: queryKeys.generalLedger.summary({ fromDate, toDate }),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiResponse<LedgerSummary>>(endpoints.generalLedger.summary, {
        params: { from_date: fromDate, to_date: toDate },
      });
      return data.data;
    },
    enabled: !!fromDate && !!toDate,
  });
}
