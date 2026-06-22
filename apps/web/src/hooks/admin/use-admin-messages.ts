import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
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

// ─── Role guards ──────────────────────────────────────────────────────────────
// Mirror the API's effective authorization for the admin-messages endpoints:
//   reads  (threads / thread / unknown)          → @Roles OWNER, ADMIN, VIEWER
//   writes (reply / send-template / read / link)  → @Roles OWNER, ADMIN
// PLUS RolesGuard grants SUPER_ADMIN full access (bypasses @Roles, see
// roles.guard.ts), so SUPER_ADMIN can read AND write the inbox — include it in both.

const INBOX_READ_ROLES = new Set(['SUPER_ADMIN', 'OWNER', 'ADMIN', 'VIEWER']);
const INBOX_WRITE_ROLES = new Set(['SUPER_ADMIN', 'OWNER', 'ADMIN']);

function useUserRole(): string | undefined {
  const { data: session } = useSession();
  return (session?.user as { role?: string } | undefined)?.role;
}

/** Can the user view the inbox (read endpoints)? */
function useCanViewInbox(): boolean {
  const role = useUserRole();
  return role !== undefined && INBOX_READ_ROLES.has(role);
}

/** Can the user reply / send templates (write endpoints)? VIEWER is read-only. */
export function useCanReplyInbox(): boolean {
  const role = useUserRole();
  return role !== undefined && INBOX_WRITE_ROLES.has(role);
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export function useAdminThreads(params?: AdminThreadsParams) {
  const canView = useCanViewInbox();
  return useQuery<AdminThreadsResponse, AxiosError>({
    queryKey: adminMessageKeys.threadList(params),
    queryFn: () => fetchAdminThreads(params),
    enabled: canView,
    staleTime: 5 * 1000,
    refetchInterval: 5 * 1000,
    refetchIntervalInBackground: false,
  });
}

export function useAdminThread(
  parentId: string,
  params?: AdminThreadParams,
) {
  const canView = useCanViewInbox();
  return useQuery<AdminThreadResponse, AxiosError>({
    queryKey: adminMessageKeys.thread(parentId, params),
    queryFn: () => fetchAdminThread(parentId, params),
    enabled: canView && !!parentId,
    staleTime: 5 * 1000,
    refetchInterval: 5 * 1000,
    refetchIntervalInBackground: false,
  });
}

export function useUnknownMessages() {
  const canView = useCanViewInbox();
  return useQuery<UnknownMessage[], AxiosError>({
    queryKey: adminMessageKeys.unknown(),
    queryFn: fetchUnknownMessages,
    enabled: canView,
    staleTime: 5 * 1000,
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
