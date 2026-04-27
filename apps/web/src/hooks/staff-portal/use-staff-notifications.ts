'use client';

import { useState, useEffect, useCallback } from 'react';
import type { NotificationItem } from '@/types/notification.types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getToken() {
  return typeof window !== 'undefined'
    ? localStorage.getItem('staff_session_token')
    : null;
}

async function fetchStaffApi<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const token = getToken();
  if (!token) throw new Error('No staff session token');
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export function useStaffUnreadCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchStaffApi<{ count: number }>(
        '/staff-portal/notifications/unread-count',
      );
      setCount(data.count);
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { count, refresh };
}

export function useStaffMarkAsRead() {
  return useCallback(async (id: string) => {
    await fetchStaffApi(`/staff-portal/notifications/${id}/read`, {
      method: 'PATCH',
    });
  }, []);
}

export function useStaffMarkAllAsRead() {
  return useCallback(async () => {
    await fetchStaffApi('/staff-portal/notifications/read-all', {
      method: 'PATCH',
    });
  }, []);
}

export function useStaffNotificationList() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchStaffApi<{
        data: NotificationItem[];
        meta: Record<string, unknown>;
      }>('/staff-portal/notifications?limit=20');
      setNotifications(data.data);
    } catch {
      /* silent */
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { notifications, loading, refresh };
}
