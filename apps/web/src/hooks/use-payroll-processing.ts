/**
 * Payroll Processing Hook
 * TASK-PAY-021: Complete Payroll Processing Frontend Integration
 *
 * Provides mutations for generating Xero journals and posting journals to Xero.
 * Note: useProcessPayroll is exported from use-staff.ts
 */

'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { apiClient, endpoints, queryKeys } from '@/lib/api';

// ============================================================================
// Types
// ============================================================================

export interface GenerateJournalsParams {
  payrollPeriodStart: string;
  payrollPeriodEnd: string;
}

export interface GeneratedJournal {
  id: string;
  payrollId: string;
  status: string;
}

export interface GenerateJournalsResult {
  created: GeneratedJournal[];
  skipped: Array<{
    payrollId: string;
    reason: string;
  }>;
}

export interface BulkPostParams {
  journalIds: string[];
}

export interface BulkPostResultItem {
  journalId: string;
  payrollId: string;
  status: 'POSTED' | 'FAILED';
  xeroJournalId?: string;
  errorMessage?: string;
}

export interface BulkPostResult {
  total: number;
  posted: number;
  failed: number;
  results: BulkPostResultItem[];
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Generate Xero journal entries for a pay period.
 *
 * Calls POST /api/v1/xero/payroll-journals/generate to create
 * journal entries from processed payroll records.
 */
export function useGenerateXeroJournals() {
  const queryClient = useQueryClient();

  return useMutation<GenerateJournalsResult, AxiosError, GenerateJournalsParams>({
    mutationFn: async ({ payrollPeriodStart, payrollPeriodEnd }) => {
      const { data } = await apiClient.post<GenerateJournalsResult>(
        endpoints.xeroJournals.generate,
        { payrollPeriodStart, payrollPeriodEnd }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.xeroJournals.all });
    },
  });
}

/**
 * Bulk post journals to Xero.
 *
 * Calls POST /api/v1/xero/payroll-journals/bulk-post to post
 * multiple journal entries to Xero in a single request.
 */
export function useBulkPostXeroJournals() {
  const queryClient = useQueryClient();

  return useMutation<BulkPostResult, AxiosError, BulkPostParams>({
    mutationFn: async ({ journalIds }) => {
      const { data } = await apiClient.post<BulkPostResult>(
        endpoints.xeroJournals.bulkPost,
        { journalIds }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.xeroJournals.all });
    },
  });
}

/**
 * Post a single journal to Xero.
 *
 * Calls POST /api/v1/xero/payroll-journals/:id/post to post
 * a single journal entry to Xero.
 */
export function usePostXeroJournal() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; xeroJournalId?: string }, AxiosError, string>({
    mutationFn: async (journalId) => {
      const { data } = await apiClient.post<{ success: boolean; xeroJournalId?: string }>(
        endpoints.xeroJournals.post(journalId)
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.xeroJournals.all });
    },
  });
}
