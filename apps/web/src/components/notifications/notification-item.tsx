'use client';

import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import type { NotificationItem as NotificationItemType } from '@/types/notification.types';
import {
  UserPlus, CreditCard, FileText, AlertTriangle, Calendar,
  CheckCircle, XCircle, Users, Clock, Bell,
} from 'lucide-react';

const typeConfig: Record<string, { icon: React.ElementType; color: string }> = {
  ENROLLMENT_COMPLETED: { icon: UserPlus, color: 'text-green-600' },
  PAYMENT_RECEIVED: { icon: CreditCard, color: 'text-blue-600' },
  PAYMENT_ALLOCATED: { icon: CreditCard, color: 'text-blue-600' },
  INVOICE_GENERATED: { icon: FileText, color: 'text-indigo-600' },
  INVOICE_SENT: { icon: FileText, color: 'text-indigo-600' },
  INVOICE_DELIVERY_FAILED: { icon: XCircle, color: 'text-red-600' },
  ARREARS_NEW: { icon: AlertTriangle, color: 'text-amber-600' },
  ARREARS_ESCALATION: { icon: AlertTriangle, color: 'text-red-600' },
  SARS_DEADLINE: { icon: Calendar, color: 'text-red-600' },
  RECONCILIATION_COMPLETE: { icon: CheckCircle, color: 'text-green-600' },
  RECONCILIATION_DISCREPANCY: { icon: AlertTriangle, color: 'text-amber-600' },
  XERO_SYNC_FAILURE: { icon: XCircle, color: 'text-red-600' },
  STAFF_LEAVE_REQUEST: { icon: Users, color: 'text-purple-600' },
  STAFF_LEAVE_DECISION: { icon: Users, color: 'text-purple-600' },
  STAFF_ONBOARDING_COMPLETE: { icon: UserPlus, color: 'text-green-600' },
  PAYSLIP_AVAILABLE: { icon: FileText, color: 'text-blue-600' },
  STATEMENT_AVAILABLE: { icon: FileText, color: 'text-indigo-600' },
  TRIAL_EXPIRING: { icon: Clock, color: 'text-amber-600' },
  SYSTEM_ALERT: { icon: Bell, color: 'text-gray-600' },
};

interface Props {
  notification: NotificationItemType;
  onClick: (notification: NotificationItemType) => void;
}

export function NotificationItemComponent({ notification, onClick }: Props) {
  const config = typeConfig[notification.type] || { icon: Bell, color: 'text-gray-600' };
  const Icon = config.icon;
  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true });

  return (
    <button
      className={cn(
        'w-full flex items-start gap-3 p-3 text-left transition-colors hover:bg-muted/50',
        !notification.isRead && 'bg-blue-50/50 dark:bg-blue-950/20',
        notification.priority === 'URGENT' && 'border-l-2 border-red-500',
      )}
      onClick={() => onClick(notification)}
    >
      <div className="flex-shrink-0 mt-1">
        {!notification.isRead ? (
          <div className="h-2 w-2 rounded-full bg-blue-500" />
        ) : (
          <div className="h-2 w-2" />
        )}
      </div>
      <div className={cn('flex-shrink-0 mt-0.5', config.color)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-sm', !notification.isRead && 'font-medium')}>
          {notification.title}
        </p>
        {notification.body && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {notification.body}
          </p>
        )}
        <p className="text-xs text-muted-foreground mt-1">{timeAgo}</p>
      </div>
    </button>
  );
}
