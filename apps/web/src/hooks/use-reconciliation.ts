import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import type { IReconciliation } from '@crechebooks/types';

// API response format (snake_case from backend)
interface ApiReconciliationSummary {
  success: boolean;
  data: {
    total_reconciled: number;
    total_unreconciled: number;
    last_reconciliation_date: string | null;
    reconciliation_rate: number;
    discrepancy_amount: number;
    period_count: number;
  };
}

// Frontend format (camelCase)
interface ReconciliationSummary {
  period: string;
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
  bankBalance: number;
  accountingBalance: number;
  difference: number;
  reconciled: boolean;
}

// API response for discrepancies endpoint (snake_case from backend)
interface ApiDiscrepancyItem {
  id: string;
  reconciliation_id: string;
  type: 'in_bank_not_xero' | 'in_xero_not_bank' | 'amount_mismatch' | 'date_mismatch';
  bank_transaction_id: string | null;
  xero_transaction_id: string | null;
  description: string;
  bank_amount: number | null;
  xero_amount: number | null;
  discrepancy_amount: number;
  transaction_date: string;
  status: 'pending' | 'resolved' | 'ignored';
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

interface ApiDiscrepanciesResponse {
  success: boolean;
  data: ApiDiscrepancyItem[];
  summary: {
    in_bank_not_xero: number;
    in_xero_not_bank: number;
    amount_mismatches: number;
    date_mismatches: number;
    total_count: number;
    total_amount: number;
  };
}

// Frontend format for discrepancies (camelCase, compatible with IReconciliationItem)
import type { IReconciliationItem } from '@crechebooks/types';

// Transform API discrepancy to IReconciliationItem for DiscrepancyList component
function transformDiscrepancyToItem(item: ApiDiscrepancyItem): IReconciliationItem {
  return {
    id: item.id,
    reconciliationId: item.reconciliation_id,
    transactionId: item.bank_transaction_id || item.xero_transaction_id || item.id,
    xeroTransactionId: item.xero_transaction_id || undefined,
    description: item.description,
    amount: item.bank_amount ?? item.xero_amount ?? item.discrepancy_amount,
    date: new Date(item.transaction_date),
    matched: false, // Discrepancies are unmatched by definition
    discrepancy: item.discrepancy_amount !== 0 ? item.discrepancy_amount : undefined,
  };
}

interface IncomeStatement {
  period: string;
  income: {
    category: string;
    amount: number;
  }[];
  expenses: {
    category: string;
    amount: number;
  }[];
  totalIncome: number;
  totalExpenses: number;
  netProfit: number;
}

interface ReconciliationParams extends Record<string, unknown> {
  startDate?: string;
  endDate?: string;
}

interface ReconcileParams {
  startDate: string;
  endDate: string;
  bankAccount?: string;
  openingBalance?: number;
  closingBalance?: number;
}

interface ReconcileApiResponse {
  success: boolean;
  data: {
    id: string;
    status: string;
    bank_account: string;
    period_start: string;
    period_end: string;
    opening_balance: number;
    closing_balance: number;
    calculated_balance: number;
    discrepancy: number;
    matched_count: number;
    unmatched_count: number;
  };
}

// API response for list endpoint (snake_case from backend)
interface ApiReconciliationListItem {
  id: string;
  tenant_id: string;
  bank_account: string;
  period_start: string;
  period_end: string;
  opening_balance: number;
  closing_balance: number; // This IS the statement balance
  calculated_balance: number;
  discrepancy: number;
  status: string;
  reconciled_at: string | null;
  reconciled_by: string | null;
  matched_count: number;
  unmatched_count: number;
  created_at: string;
  updated_at: string;
}

interface ApiReconciliationListResponse {
  success: boolean;
  data: ApiReconciliationListItem[];
  total: number;
  page: number;
  limit: number;
}

interface ReconciliationHistoryParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
}

// Transform API snake_case response to frontend camelCase IReconciliation
function transformReconciliationItem(item: ApiReconciliationListItem): IReconciliation {
  return {
    id: item.id,
    tenantId: item.tenant_id,
    bankAccountId: item.bank_account,
    periodStart: new Date(item.period_start),
    periodEnd: new Date(item.period_end),
    openingBalance: item.opening_balance,
    closingBalance: item.closing_balance,
    statementBalance: item.closing_balance, // closing_balance IS the statement balance
    calculatedBalance: item.calculated_balance,
    discrepancy: item.discrepancy,
    status: item.status as IReconciliation['status'],
    reconciledAt: item.reconciled_at ? new Date(item.reconciled_at) : undefined,
    reconciledBy: item.reconciled_by || undefined,
    items: [], // Items are not returned in list endpoint
  };
}

// Get reconciliation history list
export function useReconciliationHistory(params?: ReconciliationHistoryParams) {
  return useQuery<{ data: IReconciliation[]; total: number; page: number; limit: number }, AxiosError>({
    queryKey: queryKeys.reconciliation.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiReconciliationListResponse>(
        endpoints.reconciliation.list,
        { params }
      );
      return {
        data: data.data.map(transformReconciliationItem),
        total: data.total,
        page: data.page,
        limit: data.limit,
      };
    },
  });
}

// Get reconciliation summary
export function useReconciliationSummary(params?: ReconciliationParams) {
  return useQuery<ReconciliationSummary, AxiosError>({
    queryKey: queryKeys.reconciliation.summary(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiReconciliationSummary>(
        endpoints.reconciliation.summary,
        {
          params,
        }
      );
      // Transform API snake_case response to frontend camelCase
      const apiData = data.data;
      return {
        period: apiData.last_reconciliation_date || 'No reconciliations yet',
        totalIncome: 0, // Income comes from income-statement endpoint
        totalExpenses: 0, // Expenses come from income-statement endpoint
        netProfit: 0, // Net profit comes from income-statement endpoint
        bankBalance: apiData.total_reconciled,
        accountingBalance: apiData.total_unreconciled,
        difference: apiData.discrepancy_amount,
        reconciled: apiData.reconciliation_rate >= 100 && apiData.period_count > 0,
      };
    },
  });
}

// Get reconciliation discrepancies
export function useReconciliationDiscrepancies() {
  return useQuery<{ items: IReconciliationItem[]; summary: ApiDiscrepanciesResponse['summary'] }, AxiosError>({
    queryKey: queryKeys.reconciliation.discrepancies(),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiDiscrepanciesResponse>(
        endpoints.reconciliation.discrepancies
      );
      return {
        items: data.data.map(transformDiscrepancyToItem),
        summary: data.summary,
      };
    },
  });
}

// Get income statement
export function useIncomeStatement(params?: ReconciliationParams) {
  return useQuery<IncomeStatement, AxiosError>({
    queryKey: queryKeys.reports.incomeStatement(params),
    queryFn: async () => {
      const { data } = await apiClient.get<IncomeStatement>(
        endpoints.reconciliation.incomeStatement,
        {
          params,
        }
      );
      return data;
    },
  });
}

// Perform reconciliation
export function useReconcile() {
  const queryClient = useQueryClient();

  return useMutation<ReconcileApiResponse, AxiosError, ReconcileParams>({
    mutationFn: async ({ startDate, endDate, bankAccount, openingBalance, closingBalance }) => {
      // Format dates as YYYY-MM-DD
      const formatDate = (isoDate: string) => isoDate.split('T')[0];

      // Send JSON request with required fields
      const { data } = await apiClient.post<ReconcileApiResponse>(
        endpoints.reconciliation.reconcile,
        {
          bank_account: bankAccount || 'MAIN',
          period_start: formatDate(startDate),
          period_end: formatDate(endDate),
          opening_balance: openingBalance ?? 0,
          closing_balance: closingBalance ?? 0,
        }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reconciliation.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  });
}
