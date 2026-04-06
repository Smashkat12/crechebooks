'use client';

import { useState, useEffect, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getToken() {
  return typeof window !== 'undefined'
    ? localStorage.getItem('parent_session_token')
    : null;
}

async function fetchParentApi<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const token = getToken();
  if (!token) throw new Error('No parent session token');
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

export function useParentUnreadCount() {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchParentApi<{ count: number }>(
        '/parent-portal/notifications/unread-count',
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

export function useParentMarkAsRead() {
  return useCallback(async (id: string) => {
    await fetchParentApi(`/parent-portal/notifications/${id}/read`, {
      method: 'PATCH',
    });
  }, []);
}

export function useParentMarkAllAsRead() {
  return useCallback(async () => {
    await fetchParentApi('/parent-portal/notifications/read-all', {
      method: 'PATCH',
    });
  }, []);
}

export function useParentNotificationList() {
  const [notifications, setNotifications] = useState<
    Array<Record<string, unknown>>
  >([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchParentApi<{
        data: Array<Record<string, unknown>>;
        meta: Record<string, unknown>;
      }>('/parent-portal/notifications?limit=20');
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
