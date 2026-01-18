/**
 * useXeroSplit Hook
 * TASK-RECON-037: React Query hooks for Xero transaction splitting
 *
 * Provides hooks for:
 * - Detecting split parameters from amount mismatches
 * - Creating, confirming, and cancelling splits
 * - Listing and filtering splits
 * - Getting split summaries
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { queryKeys } from '@/lib/api';
import {
  detectSplitParams,
  createXeroSplit,
  confirmXeroSplit,
  cancelXeroSplit,
  getXeroSplit,
  getXeroSplitByTransaction,
  listXeroSplits,
  getXeroSplitsSummary,
  type XeroSplit,
  type SplitDetectionResult,
  type CreateXeroSplitRequest,
  type XeroSplitFilterParams,
  type XeroSplitStatus,
} from '@/lib/api/xero-split';

// Re-export types
export type { XeroSplit, SplitDetectionResult, XeroSplitStatus };

// Detection params for the mutation
interface DetectSplitMutationParams {
  xeroTransactionId: string;
  xeroAmountCents: number;
  bankAmountCents: number;
  description?: string;
  payeeName?: string;
}

/**
 * Hook to detect split parameters from a transaction mismatch
 */
export function useDetectSplitParams() {
  return useMutation<SplitDetectionResult, AxiosError, DetectSplitMutationParams>({
    mutationFn: async ({
      xeroTransactionId,
      xeroAmountCents,
      bankAmountCents,
      description,
      payeeName,
    }) => {
      return detectSplitParams(
        xeroTransactionId,
        xeroAmountCents,
        bankAmountCents,
        description,
        payeeName
      );
    },
  });
}

/**
 * Hook to create a Xero transaction split
 */
export function useCreateXeroSplit() {
  const queryClient = useQueryClient();

  return useMutation<XeroSplit, AxiosError, CreateXeroSplitRequest>({
    mutationFn: createXeroSplit,
    onSuccess: (data) => {
      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: queryKeys.xeroSplits.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.reconciliation.all });
      // Set the new split in cache
      queryClient.setQueryData(queryKeys.xeroSplits.detail(data.id), data);
      queryClient.setQueryData(
        queryKeys.xeroSplits.byXeroTransaction(data.xeroTransactionId),
        data
      );
    },
  });
}

/**
 * Hook to confirm a pending split
 */
export function useConfirmXeroSplit() {
  const queryClient = useQueryClient();

  return useMutation<
    XeroSplit,
    AxiosError,
    { splitId: string; bankTransactionId?: string; createMatch?: boolean }
  >({
    mutationFn: ({ splitId, bankTransactionId, createMatch }) =>
      confirmXeroSplit(splitId, bankTransactionId, createMatch),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.xeroSplits.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.reconciliation.all });
      queryClient.setQueryData(queryKeys.xeroSplits.detail(data.id), data);
    },
  });
}

/**
 * Hook to cancel a split
 */
export function useCancelXeroSplit() {
  const queryClient = useQueryClient();

  return useMutation<XeroSplit, AxiosError, { splitId: string; reason?: string }>({
    mutationFn: ({ splitId, reason }) => cancelXeroSplit(splitId, reason),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.xeroSplits.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.reconciliation.all });
      queryClient.setQueryData(queryKeys.xeroSplits.detail(data.id), data);
    },
  });
}

/**
 * Hook to get a split by ID
 */
export function useXeroSplit(splitId: string | null) {
  return useQuery<XeroSplit, AxiosError>({
    queryKey: queryKeys.xeroSplits.detail(splitId || ''),
    queryFn: () => getXeroSplit(splitId!),
    enabled: !!splitId,
  });
}

/**
 * Hook to get a split by Xero transaction ID
 */
export function useXeroSplitByTransaction(xeroTransactionId: string | null) {
  return useQuery<XeroSplit | null, AxiosError>({
    queryKey: queryKeys.xeroSplits.byXeroTransaction(xeroTransactionId || ''),
    queryFn: () => getXeroSplitByTransaction(xeroTransactionId!),
    enabled: !!xeroTransactionId,
  });
}

/**
 * Hook to list Xero splits with filtering
 */
export function useXeroSplits(params?: XeroSplitFilterParams) {
  return useQuery<
    { splits: XeroSplit[]; total: number; page: number; limit: number; totalPages: number },
    AxiosError
  >({
    queryKey: queryKeys.xeroSplits.list(params as Record<string, unknown> | undefined),
    queryFn: () => listXeroSplits(params),
  });
}

/**
 * Hook to get Xero splits summary
 */
export function useXeroSplitsSummary() {
  return useQuery<
    {
      totalCount: number;
      byStatus: Record<XeroSplitStatus, number>;
      totalOriginalCents: number;
      totalNetCents: number;
      totalFeeCents: number;
      byFeeType: Record<string, { count: number; totalFeeCents: number }>;
    },
    AxiosError
  >({
    queryKey: queryKeys.xeroSplits.summary(),
    queryFn: getXeroSplitsSummary,
  });
}
