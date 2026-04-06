'use client';

import { useState } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import {
  useParentUnreadCount,
  useParentNotificationList,
  useParentMarkAsRead,
  useParentMarkAllAsRead,
} from '@/hooks/parent-portal/use-parent-notifications';
import { NotificationItemComponent } from '@/components/notifications/notification-item';
import { useMobile } from '@/hooks/use-mobile';
import { useRouter } from 'next/navigation';
import type { NotificationItem } from '@/types/notification.types';

export function ParentNotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const { count, refresh: refreshCount } = useParentUnreadCount();
  const { notifications, refresh: refreshList } = useParentNotificationList();
  const markAsRead = useParentMarkAsRead();
  const markAllAsRead = useParentMarkAllAsRead();
  const isMobile = useMobile();
  const router = useRouter();

  const handleClick = async (notification: NotificationItem) => {
    if (!notification.isRead) {
      await markAsRead(notification.id);
      refreshCount();
      refreshList();
    }
    if (notification.actionUrl) {
      router.push(notification.actionUrl);
      setIsOpen(false);
    }
  };

  const handleMarkAllRead = async () => {
    await markAllAsRead();
    refreshCount();
    refreshList();
  };

  const bellButton = (
    <Button variant="ghost" size="icon" className="relative h-9 w-9">
      <Bell className="h-4 w-4" />
      {count > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 flex items-center justify-center text-[10px] font-bold"
        >
          {count > 99 ? '99+' : count}
        </Badge>
      )}
    </Button>
  );

  const panel = (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 pb-2">
        <h3 className="font-semibold text-sm">Notifications</h3>
        {count > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs h-7"
            onClick={handleMarkAllRead}
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
            {notifications.map((n) => (
              <NotificationItemComponent
                key={(n as NotificationItem).id}
                notification={n as NotificationItem}
                onClick={handleClick}
              />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>{bellButton}</SheetTrigger>
        <SheetContent side="bottom" className="h-[70vh] p-0">
          {panel}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>{bellButton}</PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="end" sideOffset={8}>
        {panel}
      </PopoverContent>
    </Popover>
  );
}
