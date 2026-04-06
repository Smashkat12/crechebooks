'use client';

import { create } from 'zustand';
import type { NotificationItem } from '@/types/notification.types';

interface NotificationState {
  notifications: NotificationItem[];
  unreadCount: number;
  isOpen: boolean;
  hasMore: boolean;
  cursor: string | null;

  // Actions
  setNotifications: (items: NotificationItem[]) => void;
  appendNotifications: (items: NotificationItem[], cursor: string | null, hasMore: boolean) => void;
  addNotification: (item: NotificationItem) => void;
  setUnreadCount: (count: number) => void;
  incrementUnreadCount: () => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  setOpen: (open: boolean) => void;
  reset: () => void;
}

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,
  hasMore: false,
  cursor: null,

  setNotifications: (items) => set({ notifications: items }),
  appendNotifications: (items, cursor, hasMore) =>
    set((state) => ({
      notifications: [...state.notifications, ...items],
      cursor,
      hasMore,
    })),
  addNotification: (item) =>
    set((state) => ({
      notifications: [item, ...state.notifications],
    })),
  setUnreadCount: (count) => set({ unreadCount: count }),
  incrementUnreadCount: () =>
    set((state) => ({ unreadCount: state.unreadCount + 1 })),
  markAsRead: (id) =>
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),
  markAllAsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    })),
  setOpen: (open) => set({ isOpen: open }),
  reset: () =>
    set({
      notifications: [],
      unreadCount: 0,
      isOpen: false,
      hasMore: false,
      cursor: null,
    }),
}));
