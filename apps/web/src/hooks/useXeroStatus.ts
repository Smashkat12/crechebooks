'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { queryKeys } from '@/lib/api/query-keys';
import { xeroApi } from '@/lib/api/xero';

export interface XeroConnectionStatus {
  isConnected: boolean;
  lastSyncAt: Date | null;
  tokenExpiresAt: Date | null;
  pendingSyncCount: number;
  syncErrors: number;
  organizationName?: string;
  lastSyncStatus?: 'success' | 'partial' | 'failed';
  errorMessage?: string;
}

export function useXeroStatus() {
  const queryClient = useQueryClient();
  const router = useRouter();

  // Auto-refresh every 60 seconds
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.xero.status(),
    queryFn: xeroApi.getStatus,
    refetchInterval: 60000, // 60 seconds
    refetchOnWindowFocus: true,
  });

  // Manual sync mutation
  const syncMutation = useMutation({
    mutationFn: () => xeroApi.syncNow(),
    onSuccess: () => {
      // Invalidate status to refresh after sync
      queryClient.invalidateQueries({ queryKey: queryKeys.xero.status() });
    },
  });

  // Reconnect function
  const reconnect = () => {
    router.push('/settings/integrations?reconnect=xero');
  };

  return {
    status: data ?? null,
    isLoading,
    error: error as Error | null,
    syncNow: syncMutation.mutateAsync,
    reconnect,
    isSyncing: syncMutation.isPending,
  };
}
