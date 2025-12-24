/**
 * Notification Types
 * TASK-INFRA-012: Multi-Channel Notification Service Enhancement
 *
 * Defines types for multi-channel notification delivery.
 */

export enum NotificationChannelType {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  SMS = 'SMS',
}

export enum NotificationDeliveryStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  OPENED = 'OPENED',
  FAILED = 'FAILED',
}

export interface NotificationPayload {
  recipientId: string; // Parent ID
  subject?: string;
  body: string;
  metadata?: Record<string, unknown>;
  attachments?: NotificationAttachment[];
}

export interface NotificationAttachment {
  filename: string;
  url: string;
  contentType?: string;
}

export interface Notification extends NotificationPayload {
  channelType: NotificationChannelType;
  tenantId: string;
}

export interface DeliveryResult {
  success: boolean;
  channelUsed: NotificationChannelType;
  messageId?: string;
  status: NotificationDeliveryStatus;
  sentAt?: Date;
  error?: string;
  errorCode?: string;
  attemptedChannels?: NotificationChannelType[];
}

export interface NotificationPreferences {
  parentId: string;
  preferredChannels: NotificationChannelType[];
  fallbackOrder: NotificationChannelType[];
  emailEnabled: boolean;
  whatsappEnabled: boolean;
  smsEnabled: boolean;
  emailOptIn: boolean;
  whatsappOptIn: boolean;
  smsOptIn: boolean;
}

export interface ChannelAvailability {
  channelType: NotificationChannelType;
  available: boolean;
  reason?: string;
}

export interface DeliveryAttempt {
  channelType: NotificationChannelType;
  attemptedAt: Date;
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}
