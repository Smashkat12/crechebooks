'use client';

import { useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useNotificationStore } from '@/stores/notification-store';
import { useNotifications, useMarkAsRead, useMarkAllAsRead } from '@/hooks/use-notifications';
import { NotificationItemComponent } from './notification-item';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import type { NotificationItem } from '@/types/notification.types';

export function NotificationPanel() {
  const router = useRouter();
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useNotifications();
  const markAsRead = useMarkAsRead();
  const markAllAsRead = useMarkAllAsRead();
  const { notifications, unreadCount, setNotifications } = useNotificationStore();

  useEffect(() => {
    if (data?.pages) {
      const allItems = data.pages.flatMap((page) => page.data);
      setNotifications(allItems);
    }
  }, [data, setNotifications]);

  const handleNotificationClick = (notification: NotificationItem) => {
    if (!notification.isRead) {
      markAsRead.mutate(notification.id);
    }
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
      useNotificationStore.getState().setOpen(false);
    }
  };

  const handleMarkAllRead = () => {
    markAllAsRead.mutate();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 pb-2">
        <h3 className="font-semibold text-sm">Notifications</h3>
        {unreadCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={handleMarkAllRead}
            disabled={markAllAsRead.isPending}
          >
            Mark all as read
          </Button>
        )}
      </div>
      <Separator />

      <ScrollArea className="flex-1 max-h-[350px]">
        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Bell className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">No notifications</p>
          </div>
        ) : (
          <div className="divide-y">
            {notifications.map((notification) => (
              <NotificationItemComponent
                key={notification.id}
                notification={notification}
                onClick={handleNotificationClick}
              />
            ))}
          </div>
        )}

        {hasNextPage && (
          <div className="p-2 text-center">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => fetchNextPage()}
              disabled={isFetchingNextPage}
            >
              {isFetchingNextPage ? 'Loading...' : 'Load more'}
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
