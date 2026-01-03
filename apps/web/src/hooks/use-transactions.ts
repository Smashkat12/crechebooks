import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';
import type { ITransaction, ICategorizationResult, TransactionStatus, TransactionType } from '@crechebooks/types';

// Types for frontend (camelCase)
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
  categoryId: string; // Actually account_code from Chart of Accounts
  confidence?: number; // Optional, for UI display purposes
  notes?: string; // Optional notes
}

// Map account codes to names (must match CategorySelect)
const ACCOUNT_CODE_TO_NAME: Record<string, string> = {
  '4000': 'Fee Income',
  '4100': 'Enrollment Fees',
  '4200': 'Activity Fees',
  '4900': 'Other Income',
  '5000': 'Salaries and Wages',
  '5100': 'Staff Benefits',
  '5200': 'Facility Costs',
  '5300': 'Learning Materials',
  '5400': 'Food and Nutrition',
  '5500': 'Utilities',
  '5600': 'Administrative',
  '5700': 'Professional Services',
  '5800': 'Taxes and Licenses',
  '5900': 'Other Expenses',
};

interface BatchCategorizeParams {
  transactionIds: string[];
  categoryId: string;
}

// API response types (snake_case from backend)
interface ApiCategorization {
  account_code: string;
  account_name: string;
  confidence_score: number;
  source: string;
  reviewed_at?: string;
}

interface ApiTransaction {
  id: string;
  date: string;
  description: string;
  payee_name?: string;
  reference?: string;
  amount_cents: number;
  is_credit: boolean;
  status: string;
  is_reconciled: boolean;
  categorization?: ApiCategorization;
  created_at: string;
}

interface ApiTransactionsListResponse {
  success: boolean;
  data: ApiTransaction[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Transform API response to frontend format
function transformTransaction(api: ApiTransaction): TransactionWithCategorization {
  return {
    id: api.id,
    tenantId: '', // Not returned by list API
    date: new Date(api.date),
    description: api.description,
    reference: api.reference,
    amount: api.amount_cents, // Amount stored in cents
    type: api.is_credit ? 'CREDIT' as TransactionType : 'DEBIT' as TransactionType,
    status: api.status as TransactionStatus,
    accountCode: api.categorization?.account_code,
    reconciled: api.is_reconciled,
    confidence: api.categorization?.confidence_score,
    needsReview: api.status === 'NEEDS_REVIEW',
    categorization: api.categorization ? {
      transactionId: api.id,
      categoryId: api.categorization.account_code, // Use account_code as ID
      accountCode: api.categorization.account_code,
      confidence: api.categorization.confidence_score,
      reasoning: api.categorization.source,
      needsReview: api.status === 'NEEDS_REVIEW',
    } : undefined,
  };
}

// List transactions with pagination and filters
export function useTransactionsList(params?: TransactionListParams) {
  return useQuery<TransactionsListResponse, AxiosError>({
    queryKey: queryKeys.transactions.list(params),
    queryFn: async () => {
      const { data } = await apiClient.get<ApiTransactionsListResponse>(endpoints.transactions.list, {
        params,
      });
      return {
        transactions: data.data.map(transformTransaction),
        total: data.meta.total,
        page: data.meta.page,
        limit: data.meta.limit,
      };
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

// API response type for categorization update
interface UpdateCategorizationResponse {
  success: boolean;
  data: {
    id: string;
    status: string;
    account_code: string;
    account_name: string;
    source: string;
    pattern_created: boolean;
  };
}

// Categorize a single transaction
export function useCategorizeTransaction() {
  const queryClient = useQueryClient();

  return useMutation<TransactionWithCategorization, AxiosError, CategorizeTransactionParams>({
    mutationFn: async ({ transactionId, categoryId }) => {
      // categoryId is actually an account_code (e.g., '5100')
      const accountName = ACCOUNT_CODE_TO_NAME[categoryId] || 'Unknown Category';

      // API expects PUT with account_code, account_name, is_split, vat_type
      const { data } = await apiClient.put<UpdateCategorizationResponse>(
        endpoints.transactions.categorize(transactionId),
        {
          account_code: categoryId,
          account_name: accountName,
          is_split: false,
          vat_type: 'STANDARD',
          create_pattern: true, // Learn from user corrections
        }
      );

      // Transform response to match expected type
      return {
        id: data.data.id,
        tenantId: '',
        date: new Date(),
        description: '',
        amount: 0,
        type: 'DEBIT' as TransactionType,
        status: data.data.status as TransactionStatus,
        accountCode: data.data.account_code,
        reconciled: false,
        needsReview: false,
      };
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
