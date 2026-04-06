'use client';

import { useMutation, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api/client';
import { useNotificationStore } from '@/stores/notification-store';
import type { NotificationListResponse } from '@/types/notification.types';

export const NOTIFICATION_KEYS = {
  all: ['notifications'] as const,
  list: (params?: Record<string, unknown>) => [...NOTIFICATION_KEYS.all, 'list', params] as const,
  unreadCount: () => [...NOTIFICATION_KEYS.all, 'unread-count'] as const,
};

export function useNotifications() {
  return useInfiniteQuery<NotificationListResponse>({
    queryKey: NOTIFICATION_KEYS.list(),
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams();
      if (pageParam) params.set('cursor', pageParam as string);
      params.set('limit', '20');
      const { data } = await apiClient.get<NotificationListResponse>(
        `/notifications?${params.toString()}`
      );
      return data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.meta.nextCursor,
    staleTime: 30_000,
  });
}

export function useUnreadCount() {
  const setUnreadCount = useNotificationStore((s) => s.setUnreadCount);

  return useQuery<{ count: number }>({
    queryKey: NOTIFICATION_KEYS.unreadCount(),
    queryFn: async () => {
      const { data } = await apiClient.get('/notifications/unread-count');
      return data;
    },
    refetchInterval: 60_000,
    staleTime: 15_000,
    select: (data) => {
      setUnreadCount(data.count);
      return data;
    },
  });
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  const markAsRead = useNotificationStore((s) => s.markAsRead);

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.patch(`/notifications/${id}/read`);
    },
    onMutate: (id) => {
      markAsRead(id);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all });
    },
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();
  const markAllAsRead = useNotificationStore((s) => s.markAllAsRead);

  return useMutation({
    mutationFn: async () => {
      const { data } = await apiClient.patch('/notifications/read-all');
      return data;
    },
    onMutate: () => {
      markAllAsRead();
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: NOTIFICATION_KEYS.all });
    },
  });
}
