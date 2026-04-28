'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/api/query-keys';
import { xeroApi } from '@/lib/api/xero';

/**
 * Poll the new /xero/sync-status endpoint every 10 seconds while the tab is visible.
 * Pauses polling when the tab is hidden (refetchIntervalInBackground: false).
 */
export function useXeroSyncStatus() {
  return useQuery({
    queryKey: queryKeys.xero.syncStatus(),
    queryFn: xeroApi.getSyncStatus,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
  });
}

/**
 * Mutation that POSTs /xero/sync then immediately invalidates the sync-status query
 * so the UI reflects the newly-queued job without waiting for the next poll.
 */
export function useTriggerXeroSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: xeroApi.syncNow,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.xero.syncStatus() });
    },
  });
}
