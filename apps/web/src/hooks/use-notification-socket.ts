'use client';

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from './use-websocket';
import { useNotificationStore } from '@/stores/notification-store';
import { useToast } from '@/hooks/use-toast';
import type { NotificationItem, NotificationCreatedEvent } from '@/types/notification.types';

export function useNotificationSocket() {
  const { on, isConnected } = useWebSocket();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const incrementUnreadCount = useNotificationStore((s) => s.incrementUnreadCount);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!isConnected) return;

    const cleanup = on('notification_created', (event: unknown) => {
      const data = (event as { data: NotificationCreatedEvent }).data;

      const notification: NotificationItem = {
        id: data.notificationId,
        type: data.type,
        priority: data.priority,
        title: data.title,
        body: '',
        actionUrl: null,
        metadata: null,
        isRead: false,
        createdAt: new Date().toISOString(),
      };

      addNotification(notification);
      incrementUnreadCount();

      if (data.priority === 'HIGH' || data.priority === 'URGENT') {
        toast({
          title: data.title,
          variant: data.priority === 'URGENT' ? 'destructive' : 'default',
        });
      }

      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    });

    return cleanup;
  }, [isConnected, on, addNotification, incrementUnreadCount, queryClient, toast]);
}
