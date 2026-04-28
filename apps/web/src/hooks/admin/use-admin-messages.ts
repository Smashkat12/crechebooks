import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AxiosError } from 'axios';
import {
  fetchAdminThreads,
  fetchAdminThread,
  replyAdminThread,
  sendAdminTemplate,
  markMessageRead,
  markAllRead,
  fetchUnknownMessages,
  linkMessageParent,
  type AdminMessageThread,
  type AdminMessage,
  type UnknownMessage,
  type AdminThreadsParams,
  type AdminThreadParams,
  type AdminThreadsResponse,
  type AdminThreadResponse,
  type ReplyRequest,
  type SendTemplateRequest,
  type LinkParentRequest,
} from '@/lib/api/admin-messages';

// ─── Query keys ───────────────────────────────────────────────────────────────

const adminMessageKeys = {
  all: ['admin-messages'] as const,
  threads: () => [...adminMessageKeys.all, 'threads'] as const,
  threadList: (params?: AdminThreadsParams) =>
    [...adminMessageKeys.threads(), params] as const,
  thread: (parentId: string, params?: AdminThreadParams) =>
    [...adminMessageKeys.all, 'thread', parentId, params] as const,
  unknown: () => [...adminMessageKeys.all, 'unknown'] as const,
};

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useAdminThreads(params?: AdminThreadsParams) {
  return useQuery<AdminThreadsResponse, AxiosError>({
    queryKey: adminMessageKeys.threadList(params),
    queryFn: () => fetchAdminThreads(params),
    staleTime: 4 * 1000,
    refetchInterval: 5 * 1000,
    refetchIntervalInBackground: false,
  });
}

export function useAdminThread(
  parentId: string,
  params?: AdminThreadParams,
) {
  return useQuery<AdminThreadResponse, AxiosError>({
    queryKey: adminMessageKeys.thread(parentId, params),
    queryFn: () => fetchAdminThread(parentId, params),
    enabled: !!parentId,
    staleTime: 4 * 1000,
    refetchInterval: 5 * 1000,
    refetchIntervalInBackground: false,
  });
}

export function useUnknownMessages() {
  return useQuery<UnknownMessage[], AxiosError>({
    queryKey: adminMessageKeys.unknown(),
    queryFn: fetchUnknownMessages,
    staleTime: 4 * 1000,
    refetchInterval: 5 * 1000,
    refetchIntervalInBackground: false,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

export function useReplyAdmin(parentId: string) {
  const queryClient = useQueryClient();

  return useMutation<AdminMessage, AxiosError, ReplyRequest>({
    mutationFn: (req) => replyAdminThread(parentId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminMessageKeys.thread(parentId),
      });
      queryClient.invalidateQueries({
        queryKey: adminMessageKeys.threads(),
      });
    },
  });
}

export function useSendTemplate(parentId: string) {
  const queryClient = useQueryClient();

  return useMutation<AdminMessage, AxiosError, SendTemplateRequest>({
    mutationFn: (req) => sendAdminTemplate(parentId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminMessageKeys.thread(parentId),
      });
      queryClient.invalidateQueries({
        queryKey: adminMessageKeys.threads(),
      });
    },
  });
}

export function useMarkMessageRead() {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, string>({
    mutationFn: markMessageRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminMessageKeys.threads() });
    },
  });
}

export function useMarkAllRead(parentId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, AxiosError, void>({
    mutationFn: () => markAllRead(parentId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: adminMessageKeys.thread(parentId),
      });
      queryClient.invalidateQueries({
        queryKey: adminMessageKeys.threads(),
      });
    },
  });
}

export function useLinkParent() {
  const queryClient = useQueryClient();

  return useMutation<
    void,
    AxiosError,
    { messageId: string } & LinkParentRequest
  >({
    mutationFn: ({ messageId, ...req }) => linkMessageParent(messageId, req),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminMessageKeys.unknown() });
      queryClient.invalidateQueries({ queryKey: adminMessageKeys.threads() });
    },
  });
}

// ─── Derived ──────────────────────────────────────────────────────────────────

/** Returns the total unread count across all threads. */
export function useTotalUnread(params?: AdminThreadsParams): number {
  const { data } = useAdminThreads(params);
  if (!data) return 0;
  return data.threads.reduce((sum, t) => sum + t.unreadCount, 0);
}

// Re-export types for convenience in pages/components
export type {
  AdminMessageThread,
  AdminMessage,
  UnknownMessage,
};
