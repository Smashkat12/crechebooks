/**
 * Statement Hooks
 * TASK-STMT-006: Statement UI Components
 *
 * React Query hooks for statement management.
 * All monetary values are in CENTS (integers).
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

// Types for API responses
export type StatementStatus = 'DRAFT' | 'FINAL' | 'DELIVERED' | 'CANCELLED';

export interface StatementParent {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
}

export interface StatementLine {
  id: string;
  date: string;
  description: string;
  line_type: string;
  reference_number: string | null;
  debit_cents: number;
  credit_cents: number;
  balance_cents: number;
}

export interface StatementSummary {
  id: string;
  statement_number: string;
  parent: StatementParent;
  period_start: string;
  period_end: string;
  opening_balance_cents: number;
  total_charges_cents: number;
  total_payments_cents: number;
  total_credits_cents: number;
  closing_balance_cents: number;
  status: StatementStatus;
  generated_at: string;
}

export interface StatementDetail extends StatementSummary {
  lines: StatementLine[];
}

interface StatementsListResponse {
  success: boolean;
  data: StatementSummary[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface StatementDetailResponse {
  success: boolean;
  data: StatementDetail;
}

interface GenerateStatementResponse {
  success: boolean;
  data: StatementDetail;
}

interface BulkGenerateResponse {
  success: boolean;
  data: {
    generated: number;
    skipped: number;
    errors: Array<{ parent_id: string; error: string }>;
    statement_ids: string[];
  };
}

interface FinalizeStatementResponse {
  success: boolean;
  message: string;
  data: StatementSummary;
}

interface ParentAccountSummary {
  parent_id: string;
  parent_name: string;
  email: string | null;
  phone: string | null;
  total_outstanding_cents: number;
  credit_balance_cents: number;
  net_balance_cents: number;
  child_count: number;
  oldest_outstanding_date: string | null;
}

interface ParentAccountResponse {
  success: boolean;
  data: ParentAccountSummary;
}

export interface StatementListParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  status?: StatementStatus;
  parentId?: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface GenerateStatementParams {
  parentId: string;
  periodStart: string;
  periodEnd: string;
}

export interface BulkGenerateParams {
  periodStart: string;
  periodEnd: string;
  parentIds?: string[];
  onlyWithActivity?: boolean;
  onlyWithBalance?: boolean;
}

/**
 * List statements with pagination and filters
 */
export function useStatementsList(params?: StatementListParams) {
  return useQuery<StatementsListResponse, AxiosError>({
    queryKey: queryKeys.statements.list(params),
    queryFn: async () => {
      // Transform camelCase params to snake_case for API
      const apiParams: Record<string, string | number | undefined> = {};
      if (params?.page) apiParams.page = params.page;
      if (params?.limit) apiParams.limit = params.limit;
      if (params?.status) apiParams.status = params.status;
      if (params?.parentId) apiParams.parent_id = params.parentId;
      if (params?.periodStart) apiParams.period_start = params.periodStart;
      if (params?.periodEnd) apiParams.period_end = params.periodEnd;

      const { data } = await apiClient.get<StatementsListResponse>(endpoints.statements.list, {
        params: apiParams,
      });

      return data;
    },
  });
}

/**
 * Get single statement detail with lines
 */
export function useStatement(id: string, enabled = true) {
  return useQuery<StatementDetail, AxiosError>({
    queryKey: queryKeys.statements.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<StatementDetailResponse>(endpoints.statements.detail(id));

      if (!data.success) {
        throw new Error('Failed to load statement');
      }

      return data.data;
    },
    enabled: enabled && !!id,
  });
}

/**
 * Get statements for a specific parent
 */
export function useStatementsForParent(parentId: string, enabled = true) {
  return useQuery<StatementSummary[], AxiosError>({
    queryKey: queryKeys.statements.forParent(parentId),
    queryFn: async () => {
      const { data } = await apiClient.get<{ success: boolean; data: StatementSummary[] }>(
        endpoints.statements.forParent(parentId)
      );

      if (!data.success) {
        throw new Error('Failed to load statements for parent');
      }

      return data.data;
    },
    enabled: enabled && !!parentId,
  });
}

/**
 * Get parent account summary
 */
export function useParentAccount(parentId: string, enabled = true) {
  return useQuery<ParentAccountSummary, AxiosError>({
    queryKey: queryKeys.statements.parentAccount(parentId),
    queryFn: async () => {
      const { data } = await apiClient.get<ParentAccountResponse>(
        endpoints.statements.parentAccount(parentId)
      );

      if (!data.success) {
        throw new Error('Failed to load parent account');
      }

      return data.data;
    },
    enabled: enabled && !!parentId,
  });
}

/**
 * Generate statement for a single parent
 */
export function useGenerateStatement() {
  const queryClient = useQueryClient();

  return useMutation<StatementDetail, AxiosError, GenerateStatementParams>({
    mutationFn: async ({ parentId, periodStart, periodEnd }) => {
      const { data } = await apiClient.post<GenerateStatementResponse>(endpoints.statements.generate, {
        parent_id: parentId,
        period_start: periodStart,
        period_end: periodEnd,
      });

      if (!data.success) {
        throw new Error('Failed to generate statement');
      }

      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.statements.all });
    },
  });
}

/**
 * Bulk generate statements
 */
export function useBulkGenerateStatements() {
  const queryClient = useQueryClient();

  return useMutation<BulkGenerateResponse['data'], AxiosError, BulkGenerateParams>({
    mutationFn: async ({ periodStart, periodEnd, parentIds, onlyWithActivity, onlyWithBalance }) => {
      const { data } = await apiClient.post<BulkGenerateResponse>(endpoints.statements.generateBulk, {
        period_start: periodStart,
        period_end: periodEnd,
        parent_ids: parentIds,
        only_with_activity: onlyWithActivity,
        only_with_balance: onlyWithBalance,
      });

      if (!data.success) {
        throw new Error('Failed to generate statements');
      }

      return data.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.statements.all });
    },
  });
}

/**
 * Finalize a statement
 */
export function useFinalizeStatement() {
  const queryClient = useQueryClient();

  return useMutation<StatementSummary, AxiosError, string>({
    mutationFn: async (statementId) => {
      const { data } = await apiClient.post<FinalizeStatementResponse>(
        endpoints.statements.finalize(statementId)
      );

      if (!data.success) {
        throw new Error('Failed to finalize statement');
      }

      return data.data;
    },
    onSuccess: (_, statementId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.statements.detail(statementId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.statements.lists() });
    },
  });
}

/**
 * Download statement PDF
 */
export function useDownloadStatementPdf() {
  const downloadPdf = async (statementId: string, statementNumber: string): Promise<void> => {
    // Get auth token from localStorage (same pattern as apiClient interceptor)
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

    if (!token) {
      throw new Error('Authentication required. Please log in.');
    }

    const response = await fetch(
      `${apiClient.defaults.baseURL}${endpoints.statements.pdf(statementId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    if (!response.ok) {
      let errorMessage = `Failed to download PDF: ${response.status}`;
      try {
        const error = await response.json();
        errorMessage = error.error || error.message || errorMessage;
      } catch {
        // If response is not JSON, use default error message
      }
      throw new Error(errorMessage);
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Statement_${statementNumber}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return { downloadPdf };
}

/**
 * Format cents to Rands for display
 */
export function formatCentsToRands(cents: number): string {
  const rands = cents / 100;
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
  }).format(rands);
}
