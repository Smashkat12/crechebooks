/**
 * WhatsApp Message History Types
 * TASK-WA-001: WhatsApp Message History Entity
 *
 * Types for tracking WhatsApp message history and status updates.
 */

import { WhatsAppMessage } from '@prisma/client';

/**
 * Message status enum - mirrors Prisma enum
 */
export enum WhatsAppMessageStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

/**
 * Context type enum - what the message relates to
 */
export enum WhatsAppContextType {
  INVOICE = 'INVOICE',
  REMINDER = 'REMINDER',
  STATEMENT = 'STATEMENT',
  WELCOME = 'WELCOME',
  ARREARS = 'ARREARS',
}

/**
 * DTO for creating a new WhatsApp message record
 */
export interface CreateWhatsAppMessageDto {
  tenantId: string;
  parentId?: string;
  recipientPhone: string;
  templateName: string;
  templateParams?: Record<string, string>;
  contextType: WhatsAppContextType;
  contextId?: string;
  wamid?: string;
  status?: WhatsAppMessageStatus;
}

/**
 * DTO for updating message status from webhook
 */
export interface UpdateMessageStatusDto {
  wamid: string;
  status: WhatsAppMessageStatus;
  timestamp: Date;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * Options for querying message history
 */
export interface MessageHistoryQueryOptions {
  limit?: number;
  offset?: number;
  status?: WhatsAppMessageStatus;
  contextType?: WhatsAppContextType;
  startDate?: Date;
  endDate?: Date;
}

/**
 * Message history summary for reporting
 */
export interface MessageHistorySummary {
  total: number;
  pending: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  deliveryRate: number; // percentage delivered of total sent
  readRate: number; // percentage read of total delivered
}

/**
 * Webhook status update from Meta
 */
export interface WebhookStatusUpdate {
  wamid: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: Date;
  recipientId: string;
  errorCode?: number;
  errorMessage?: string;
}

/**
 * Result of message creation with entity
 */
export interface MessageCreateResult {
  success: boolean;
  message?: WhatsAppMessage;
  wamid?: string;
  error?: string;
}

/**
 * Export the Prisma type for convenience
 */
export type { WhatsAppMessage };
