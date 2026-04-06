/**
 * In-App Notification Types
 * TASK-NOTIF-010: In-App Notification Backend (Phase 1)
 *
 * Shared types for the in-app notification service, processor, and emitter.
 */

export type RecipientType = 'USER' | 'PARENT' | 'STAFF';

export interface CreateNotificationInput {
  tenantId: string;
  recipientType: RecipientType;
  recipientId: string;
  type: string; // NotificationType enum value
  priority?: string; // NotificationPriority, defaults to NORMAL
  title: string;
  body: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
}

export interface NotificationListQuery {
  tenantId: string;
  recipientType: RecipientType;
  recipientId: string;
  isRead?: boolean;
  type?: string;
  cursor?: string; // notification ID for cursor pagination
  limit?: number; // default 20, max 50
}

export interface NotificationListResponse {
  data: NotificationItem[];
  meta: {
    unreadCount: number;
    nextCursor: string | null;
    hasMore: boolean;
  };
}

export interface NotificationItem {
  id: string;
  type: string;
  priority: string;
  title: string;
  body: string;
  actionUrl: string | null;
  metadata: Record<string, unknown> | null;
  isRead: boolean;
  createdAt: Date;
}

export interface NotificationJobData {
  notification: CreateNotificationInput;
}
