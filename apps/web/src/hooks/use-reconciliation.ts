import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import type { IReconciliation } from '@crechebooks/types';

// Types for API responses
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

interface Discrepancy {
  id: string;
  type: 'missing_transaction' | 'amount_mismatch' | 'duplicate';
  description: string;
  amount: number;
  bankDate?: string;
  accountingDate?: string;
  severity: 'low' | 'medium' | 'high';
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
  bankStatementFile?: File;
}

// Get reconciliation summary
export function useReconciliationSummary(params?: ReconciliationParams) {
  return useQuery<ReconciliationSummary, AxiosError>({
    queryKey: queryKeys.reconciliation.summary(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ReconciliationSummary>(
        endpoints.reconciliation.summary,
        {
          params,
        }
      );
      return data;
    },
  });
}

// Get reconciliation discrepancies
export function useReconciliationDiscrepancies() {
  return useQuery<Discrepancy[], AxiosError>({
    queryKey: queryKeys.reconciliation.discrepancies(),
    queryFn: async () => {
      const { data } = await apiClient.get<Discrepancy[]>(endpoints.reconciliation.summary, {
        params: { includeDiscrepancies: true },
      });
      return data;
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

  return useMutation<IReconciliation, AxiosError, ReconcileParams>({
    mutationFn: async ({ startDate, endDate, bankStatementFile }) => {
      const formData = new FormData();
      formData.append('startDate', startDate);
      formData.append('endDate', endDate);
      if (bankStatementFile) {
        formData.append('bankStatement', bankStatementFile);
      }

      const { data } = await apiClient.post<IReconciliation>(
        endpoints.reconciliation.reconcile,
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
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
