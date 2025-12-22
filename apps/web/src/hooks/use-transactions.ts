import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import type { ITransaction, ICategorizationResult } from '@crechebooks/types';

// Types for API responses
interface TransactionWithCategorization extends ITransaction {
  categorization?: ICategorizationResult;
}

interface TransactionsListResponse {
  transactions: TransactionWithCategorization[];
  total: number;
  page: number;
  limit: number;
}

interface CategorizationSuggestion extends ICategorizationResult {
  categoryName: string;
}

interface TransactionListParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  status?: string;
  category?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
}

interface CategorizeTransactionParams {
  transactionId: string;
  categoryId: string;
  confidence: number;
  notes?: string;
}

interface BatchCategorizeParams {
  transactionIds: string[];
  categoryId: string;
}

// List transactions with pagination and filters
export function useTransactionsList(params?: TransactionListParams) {
  return useQuery<TransactionsListResponse, AxiosError>({
    queryKey: queryKeys.transactions.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<TransactionsListResponse>(endpoints.transactions.list, {
        params,
      });
      return data;
    },
  });
}

// Get single transaction detail
export function useTransaction(id: string, enabled = true) {
  return useQuery<TransactionWithCategorization, AxiosError>({
    queryKey: queryKeys.transactions.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<TransactionWithCategorization>(
        endpoints.transactions.detail(id)
      );
      return data;
    },
    enabled: enabled && !!id,
  });
}

// Get categorization suggestions for a transaction
export function useTransactionSuggestions(id: string, enabled = true) {
  return useQuery<CategorizationSuggestion[], AxiosError>({
    queryKey: queryKeys.transactions.suggestions(id),
    queryFn: async () => {
      const { data } = await apiClient.get<CategorizationSuggestion[]>(
        endpoints.transactions.suggestions(id)
      );
      return data;
    },
    enabled: enabled && !!id,
  });
}

// Categorize a single transaction
export function useCategorizeTransaction() {
  const queryClient = useQueryClient();

  return useMutation<TransactionWithCategorization, AxiosError, CategorizeTransactionParams>({
    mutationFn: async ({ transactionId, categoryId, confidence, notes }) => {
      const { data } = await apiClient.post<TransactionWithCategorization>(
        endpoints.transactions.categorize(transactionId),
        {
          categoryId,
          confidence,
          notes,
        }
      );
      return data;
    },
    onSuccess: (data) => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.lists() });
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.detail(data.id) });
    },
  });
}

// Batch categorize multiple transactions
export function useBatchCategorize() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; count: number }, AxiosError, BatchCategorizeParams>({
    mutationFn: async ({ transactionIds, categoryId }) => {
      const { data } = await apiClient.post<{ success: boolean; count: number }>(
        endpoints.transactions.batchCategorize,
        {
          transactionIds,
          categoryId,
        }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all });
    },
  });
}

// Import transactions from file
export function useImportTransactions() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; count: number }, AxiosError, FormData>({
    mutationFn: async (formData) => {
      const { data } = await apiClient.post<{ success: boolean; count: number }>(
        endpoints.transactions.import,
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
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all });
    },
  });
}
