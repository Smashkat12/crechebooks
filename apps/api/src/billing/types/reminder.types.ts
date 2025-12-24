/**
 * Payment Reminder Types
 * TASK-PAY-015: Payment Reminder Scheduler Service
 *
 * Defines reminder stages, schedules, and configuration types.
 */

/**
 * Reminder stage based on days overdue
 * - FIRST: 7 days overdue (gentle reminder)
 * - SECOND: 14 days overdue (firmer tone)
 * - FINAL: 30 days overdue (serious warning)
 * - ESCALATED: 45 days overdue (flagged for manual review)
 */
export type ReminderStage = 'FIRST' | 'SECOND' | 'FINAL' | 'ESCALATED';

/**
 * Delivery channel for reminders
 */
export type ReminderChannel = 'email' | 'whatsapp';

/**
 * Schedule configuration for a reminder stage
 */
export interface ReminderSchedule {
  stage: ReminderStage;
  daysOverdue: number;
  channels: ReminderChannel[];
}

/**
 * Default reminder schedule based on days overdue
 *
 * - 7 days: Email only (gentle reminder)
 * - 14 days: Email + WhatsApp (second notice)
 * - 30 days: Email + WhatsApp (final warning)
 * - 45 days: Email only (escalation for manual review)
 */
export const DEFAULT_REMINDER_SCHEDULE: ReminderSchedule[] = [
  { stage: 'FIRST', daysOverdue: 7, channels: ['email'] },
  { stage: 'SECOND', daysOverdue: 14, channels: ['email', 'whatsapp'] },
  { stage: 'FINAL', daysOverdue: 30, channels: ['email', 'whatsapp'] },
  { stage: 'ESCALATED', daysOverdue: 45, channels: ['email'] },
];

/**
 * Invoice with parent information for reminder processing
 */
export interface InvoiceWithParent {
  id: string;
  invoiceNumber: string;
  tenantId: string;
  parentId: string;
  childId: string;
  dueDate: Date;
  totalCents: number;
  amountPaidCents: number;
  parent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    whatsappOptIn: boolean;
    preferredContact: string;
  };
}

/**
 * Overdue invoice summary for API responses
 */
export interface OverdueInvoice {
  invoiceId: string;
  invoiceNumber: string;
  parentId: string;
  parentName: string;
  childId: string;
  dueDate: Date;
  daysOverdue: number;
  outstandingCents: number;
  stage: ReminderStage;
  remindersSent: number;
  lastReminderAt: Date | null;
  isEscalated: boolean;
}

/**
 * Reminder history entry for tracking
 */
export interface ReminderHistory {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  stage: ReminderStage;
  channel: ReminderChannel;
  sentAt: Date;
  status: 'sent' | 'delivered' | 'failed';
  errorMessage?: string;
}

/**
 * Result summary from payment reminder processor
 */
export interface PaymentReminderResult {
  tenantId: string;
  processedAt: Date;
  totalOverdue: number;
  byStage: {
    first: number;
    second: number;
    final: number;
    escalated: number;
  };
  remindersSent: number;
  remindersSkipped: number;
  remindersFailed: number;
  durationMs: number;
}

/**
 * Get the reminder stage for a given number of days overdue
 *
 * @param daysOverdue - Number of days past due date
 * @returns Reminder stage or null if not overdue
 */
export function getStageForDaysOverdue(
  daysOverdue: number,
): ReminderStage | null {
  if (daysOverdue >= 45) return 'ESCALATED';
  if (daysOverdue >= 30) return 'FINAL';
  if (daysOverdue >= 14) return 'SECOND';
  if (daysOverdue >= 7) return 'FIRST';
  return null;
}

/**
 * Get schedule entry for a stage
 */
export function getScheduleForStage(stage: ReminderStage): ReminderSchedule {
  const schedule = DEFAULT_REMINDER_SCHEDULE.find((s) => s.stage === stage);
  if (!schedule) {
    throw new Error(`No schedule found for stage: ${stage}`);
  }
  return schedule;
}

/**
 * Check if a stage warrants WhatsApp delivery
 */
export function shouldUseWhatsApp(stage: ReminderStage): boolean {
  const schedule = getScheduleForStage(stage);
  return schedule.channels.includes('whatsapp');
}
