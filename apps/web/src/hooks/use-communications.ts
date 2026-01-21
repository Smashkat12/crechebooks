/**
 * Communications Hooks
 * TASK-COMM-004: Frontend Communication Dashboard
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  communicationsApi,
  BroadcastMessage,
  BroadcastDetail,
  BroadcastListParams,
  CreateBroadcastDto,
  RecipientGroup,
  RecipientFilter,
  RecipientPreview,
} from '@/lib/api/communications';

// Query keys
export const communicationsQueryKeys = {
  broadcasts: ['broadcasts'] as const,
  broadcast: (id: string) => ['broadcast', id] as const,
  groups: ['recipientGroups'] as const,
  group: (id: string) => ['recipientGroup', id] as const,
};

/**
 * Hook for managing broadcasts list and mutations
 */
export function useCommunications(params?: BroadcastListParams) {
  const queryClient = useQueryClient();

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: [...communicationsQueryKeys.broadcasts, params],
    queryFn: () => communicationsApi.listBroadcasts(params),
  });

  const { mutateAsync: createBroadcast, isPending: isCreating } = useMutation({
    mutationFn: (data: CreateBroadcastDto) => communicationsApi.createBroadcast(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communicationsQueryKeys.broadcasts });
    },
  });

  const { mutateAsync: sendBroadcast, isPending: isSending } = useMutation({
    mutationFn: (id: string) => communicationsApi.sendBroadcast(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communicationsQueryKeys.broadcasts });
    },
  });

  const { mutateAsync: cancelBroadcast, isPending: isCancelling } = useMutation({
    mutationFn: (id: string) => communicationsApi.cancelBroadcast(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communicationsQueryKeys.broadcasts });
    },
  });

  return {
    broadcasts: data?.broadcasts ?? [],
    meta: data?.meta,
    isLoading,
    error,
    refetch,
    createBroadcast,
    isCreating,
    sendBroadcast,
    isSending,
    cancelBroadcast,
    isCancelling,
  };
}

/**
 * Hook for a single broadcast
 */
export function useBroadcast(id: string) {
  const queryClient = useQueryClient();

  const {
    data: broadcast,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: communicationsQueryKeys.broadcast(id),
    queryFn: () => communicationsApi.getBroadcast(id),
    enabled: !!id,
  });

  const { mutateAsync: send, isPending: isSending } = useMutation({
    mutationFn: () => communicationsApi.sendBroadcast(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communicationsQueryKeys.broadcast(id) });
      queryClient.invalidateQueries({ queryKey: communicationsQueryKeys.broadcasts });
    },
  });

  const { mutateAsync: cancel, isPending: isCancelling } = useMutation({
    mutationFn: () => communicationsApi.cancelBroadcast(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communicationsQueryKeys.broadcast(id) });
      queryClient.invalidateQueries({ queryKey: communicationsQueryKeys.broadcasts });
    },
  });

  return {
    broadcast,
    isLoading,
    error,
    refetch,
    send,
    isSending,
    cancel,
    isCancelling,
  };
}

/**
 * Hook for recipient groups
 */
export function useRecipientGroups() {
  const queryClient = useQueryClient();

  const {
    data: groups,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: communicationsQueryKeys.groups,
    queryFn: () => communicationsApi.listGroups(),
  });

  const { mutateAsync: createGroup, isPending: isCreating } = useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      recipient_type: string;
      filter_criteria: RecipientFilter;
    }) => communicationsApi.createGroup(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communicationsQueryKeys.groups });
    },
  });

  const { mutateAsync: deleteGroup, isPending: isDeleting } = useMutation({
    mutationFn: (id: string) => communicationsApi.deleteGroup(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: communicationsQueryKeys.groups });
    },
  });

  return {
    groups: groups ?? [],
    isLoading,
    error,
    refetch,
    createGroup,
    isCreating,
    deleteGroup,
    isDeleting,
  };
}

/**
 * Hook for previewing recipients
 */
export function useRecipientPreview() {
  const { mutateAsync: previewRecipients, isPending: isPreviewing, data: preview } = useMutation({
    mutationFn: (data: {
      recipient_type: string;
      filter?: RecipientFilter;
      channel?: string;
    }) => communicationsApi.previewRecipients(data),
  });

  return {
    previewRecipients,
    isPreviewing,
    preview,
  };
}

// Re-export types for convenience
export type {
  BroadcastMessage,
  BroadcastDetail,
  BroadcastListParams,
  CreateBroadcastDto,
  RecipientGroup,
  RecipientFilter,
  RecipientPreview,
};
