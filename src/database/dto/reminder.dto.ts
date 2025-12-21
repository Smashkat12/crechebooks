/**
 * Reminder DTOs
 * TASK-PAY-014: Automated Reminder System
 *
 * @module database/dto/reminder
 * @description DTOs for automated payment reminder system with
 * escalation levels and multi-channel delivery.
 */

import { IsUUID, IsEnum, IsOptional, IsDate, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Escalation level for reminder tone
 */
export enum EscalationLevel {
  FRIENDLY = 'FRIENDLY',
  FIRM = 'FIRM',
  FINAL = 'FINAL',
}

/**
 * Status of reminder delivery
 */
export enum ReminderStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  READ = 'READ',
  FAILED = 'FAILED',
}

/**
 * Delivery channel for reminders
 */
export enum DeliveryChannel {
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
  BOTH = 'BOTH',
}

/**
 * DTO for sending batch reminders to overdue invoices
 */
export class SendRemindersDto {
  @IsUUID()
  tenantId!: string;

  /**
   * Array of invoice IDs to send reminders for.
   * Service will determine escalation level based on days overdue.
   */
  @IsArray()
  @IsUUID('4', { each: true })
  invoiceIds!: string[];

  /**
   * Delivery channel preference.
   * Defaults to tenant configuration if not specified.
   */
  @IsOptional()
  @IsEnum(DeliveryChannel)
  channel?: DeliveryChannel;
}

/**
 * DTO for scheduling a single reminder
 */
export class ScheduleReminderDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  invoiceId!: string;

  /**
   * Scheduled send date/time.
   */
  @Type(() => Date)
  @IsDate()
  sendDate!: Date;

  @IsEnum(DeliveryChannel)
  channel!: DeliveryChannel;
}

/**
 * Reminder content with template variables
 */
export interface ReminderContent {
  /** Email subject line or WhatsApp header */
  subject: string;

  /** Message body with placeholders filled */
  body: string;

  /** Escalation level used for this reminder */
  escalationLevel: EscalationLevel;

  /** Invoice number for reference */
  invoiceNumber: string;

  /** Outstanding amount in cents */
  outstandingCents: number;

  /** Days past due date */
  daysOverdue: number;
}

/**
 * Result of sending reminders
 */
export interface ReminderResult {
  /** Number of reminders successfully sent */
  sent: number;

  /** Number of reminders that failed */
  failed: number;

  /** Number of reminders skipped (no contact info, already sent, etc.) */
  skipped: number;

  /** Detailed results for each invoice */
  details: ReminderDetail[];
}

/**
 * Detailed result for individual reminder
 */
export interface ReminderDetail {
  /** Invoice ID processed */
  invoiceId: string;

  /** Invoice number for display */
  invoiceNumber: string;

  /** Result status */
  status: 'SENT' | 'FAILED' | 'SKIPPED';

  /** Escalation level applied */
  escalationLevel: EscalationLevel;

  /** Channel(s) used for delivery */
  deliveryChannel: DeliveryChannel;

  /** Error message if failed */
  error?: string;

  /** Created reminder ID if sent */
  reminderId?: string;
}

/**
 * Result of processing reminders by escalation level
 */
export interface EscalationResult {
  /** Count of friendly reminders sent */
  friendly: number;

  /** Count of firm reminders sent */
  firm: number;

  /** Count of final reminders sent */
  final: number;

  /** Total invoices processed */
  totalProcessed: number;

  /** Total reminders successfully sent */
  totalSent: number;

  /** Total reminders skipped */
  totalSkipped: number;

  /** Detailed breakdown */
  details: ReminderDetail[];
}

/**
 * Historical reminder entry for display
 */
export interface ReminderHistoryEntry {
  /** Reminder record ID */
  reminderId: string;

  /** Associated invoice ID */
  invoiceId: string;

  /** Invoice number for display */
  invoiceNumber: string;

  /** When reminder was sent */
  sentAt: Date;

  /** Escalation level used */
  escalationLevel: EscalationLevel;

  /** Delivery channel(s) used */
  deliveryChannel: DeliveryChannel;

  /** Current delivery status */
  reminderStatus: ReminderStatus;

  /** Outstanding amount at time of reminder in cents */
  outstandingCents: number;
}
