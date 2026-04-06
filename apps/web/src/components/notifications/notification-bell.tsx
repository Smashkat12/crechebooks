'use client';

import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useNotificationStore } from '@/stores/notification-store';
import { useUnreadCount } from '@/hooks/use-notifications';
import { useNotificationSocket } from '@/hooks/use-notification-socket';
import { NotificationPanel } from './notification-panel';
import { useMobile } from '@/hooks/use-mobile';

export function NotificationBell() {
  const { unreadCount, isOpen, setOpen } = useNotificationStore();
  useUnreadCount();
  useNotificationSocket();

  const isMobile = useMobile();

  const bellButton = (
    <Button variant="ghost" size="icon" className="relative h-9 w-9">
      <Bell className="h-4 w-4" />
      {unreadCount > 0 && (
        <Badge
          variant="destructive"
          className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 flex items-center justify-center text-[10px] font-bold"
        >
          {unreadCount > 99 ? '99+' : unreadCount}
        </Badge>
      )}
      <span className="sr-only">
        {unreadCount > 0 ? `${unreadCount} unread notifications` : 'Notifications'}
      </span>
    </Button>
  );

  if (isMobile) {
    return (
      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetTrigger asChild>{bellButton}</SheetTrigger>
        <SheetContent side="bottom" className="h-[70vh] p-0">
          <NotificationPanel />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={isOpen} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{bellButton}</PopoverTrigger>
      <PopoverContent className="w-[380px] p-0" align="end" sideOffset={8}>
        <NotificationPanel />
      </PopoverContent>
    </Popover>
  );
}
