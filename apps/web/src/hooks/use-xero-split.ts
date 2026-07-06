/**
 * useXeroSplit Hook
 * TASK-RECON-037: React Query hooks for Xero transaction splitting
 *
 * Provides hooks for:
 * - Detecting split parameters from amount mismatches
 * - Creating splits
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import { queryKeys } from '@/lib/api';
import {
  detectSplitParams,
  createXeroSplit,
  type XeroSplit,
  type SplitDetectionResult,
  type CreateXeroSplitRequest,
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

