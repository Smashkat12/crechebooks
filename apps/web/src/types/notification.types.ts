export type NotificationType =
  | 'ENROLLMENT_COMPLETED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_ALLOCATED'
  | 'INVOICE_GENERATED'
  | 'INVOICE_SENT'
  | 'INVOICE_DELIVERY_FAILED'
  | 'ARREARS_NEW'
  | 'ARREARS_ESCALATION'
  | 'SARS_DEADLINE'
  | 'RECONCILIATION_COMPLETE'
  | 'RECONCILIATION_DISCREPANCY'
  | 'XERO_SYNC_FAILURE'
  | 'STAFF_LEAVE_REQUEST'
  | 'STAFF_LEAVE_DECISION'
  | 'STAFF_ONBOARDING_COMPLETE'
  | 'PAYSLIP_AVAILABLE'
  | 'STATEMENT_AVAILABLE'
  | 'BROADCAST_SUMMARY'
  | 'TRIAL_EXPIRING'
  | 'SYSTEM_ALERT';

export type NotificationPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface NotificationItem {
  id: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  body: string;
  actionUrl: string | null;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationListResponse {
  data: NotificationItem[];
  meta: {
    unreadCount: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface NotificationCreatedEvent {
  notificationId: string;
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  recipientType: string;
  recipientId: string;
}
