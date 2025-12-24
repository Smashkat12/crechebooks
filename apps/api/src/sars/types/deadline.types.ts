/**
 * SARS Deadline Types
 * TASK-SARS-017: SARS Deadline Reminder System
 *
 * Types for SARS deadline tracking and reminders.
 */

/**
 * SARS deadline submission types
 */
export type SarsDeadlineType = 'VAT201' | 'EMP201' | 'IRP5';

/**
 * Upcoming deadline information
 */
export interface UpcomingDeadline {
  type: SarsDeadlineType;
  deadline: Date;
  daysRemaining: number;
  period: string;
  isSubmitted: boolean;
  submittedAt?: Date;
}

/**
 * Deadline reminder preferences
 */
export interface DeadlineReminderPrefs {
  reminderDays: number[];
  channels: ('email' | 'whatsapp')[];
  recipientEmails: string[];
  enabled: boolean;
}

/**
 * Deadline reminder record
 */
export interface DeadlineReminder {
  id: string;
  tenantId: string;
  type: SarsDeadlineType;
  period: string;
  daysRemaining: number;
  sentAt: Date;
  channel: 'email' | 'whatsapp';
  recipients: string[];
}

/**
 * Default reminder days (30, 14, 7, 3, 1 before deadline)
 */
export const DEFAULT_REMINDER_DAYS = [30, 14, 7, 3, 1] as const;

/**
 * SARS deadline calendar
 * Defines when each return type is due
 */
export const SARS_DEADLINE_CALENDAR = {
  /**
   * VAT201: Due 25th of following month
   * Returns filed monthly
   */
  VAT201: {
    dayOfMonth: 25,
    monthOffset: 1, // Following month
    frequency: 'MONTHLY' as const,
  },
  /**
   * EMP201: Due 7th of following month
   * Monthly PAYE returns
   */
  EMP201: {
    dayOfMonth: 7,
    monthOffset: 1, // Following month
    frequency: 'MONTHLY' as const,
  },
  /**
   * IRP5: Due end of May annually
   * Annual employee tax certificates
   */
  IRP5: {
    dayOfMonth: 31,
    monthOfYear: 4, // May (0-indexed)
    frequency: 'ANNUAL' as const,
  },
} as const;

/**
 * Deadline check job data
 */
export interface SarsDeadlineCheckJobData {
  tenantId: string;
  triggeredBy: 'cron' | 'manual' | 'event';
  scheduledAt: Date;
  metadata?: Record<string, unknown>;
}
