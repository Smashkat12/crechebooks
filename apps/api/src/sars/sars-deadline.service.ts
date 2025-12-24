/**
 * SARS Deadline Service
 * TASK-SARS-017: SARS Deadline Reminder System
 *
 * Manages SARS deadline calculations and reminder preferences.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import {
  SarsDeadlineType,
  UpcomingDeadline,
  DeadlineReminderPrefs,
  DeadlineReminder,
  DEFAULT_REMINDER_DAYS,
  SARS_DEADLINE_CALENDAR,
} from './types/deadline.types';

@Injectable()
export class SarsDeadlineService {
  private readonly logger = new Logger(SarsDeadlineService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get upcoming deadlines for a tenant
   *
   * @param tenantId - Tenant ID
   * @param lookAheadDays - Number of days to look ahead (default: 30)
   * @returns Array of upcoming deadlines
   */
  async getUpcomingDeadlines(
    tenantId: string,
    lookAheadDays = 30,
  ): Promise<UpcomingDeadline[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const lookAheadDate = new Date(today);
    lookAheadDate.setDate(lookAheadDate.getDate() + lookAheadDays);

    const deadlines: UpcomingDeadline[] = [];

    // Check each deadline type
    const types: SarsDeadlineType[] = ['VAT201', 'EMP201', 'IRP5'];

    for (const type of types) {
      // Get next deadline date
      const deadline = this.getNextDeadline(type, today);

      if (deadline <= lookAheadDate) {
        const daysRemaining = Math.ceil(
          (deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
        );

        // Get period string
        const period = this.getPeriodString(type, deadline);

        // Check if already submitted
        const submission = await this.checkSubmissionStatus(
          tenantId,
          type,
          period,
        );

        deadlines.push({
          type,
          deadline,
          daysRemaining,
          period,
          isSubmitted: submission.isSubmitted,
          submittedAt: submission.submittedAt,
        });
      }
    }

    // Sort by days remaining
    return deadlines.sort((a, b) => a.daysRemaining - b.daysRemaining);
  }

  /**
   * Get the next deadline date for a submission type
   *
   * @param type - SARS deadline type
   * @param referenceDate - Reference date (default: today)
   * @returns Deadline date
   */
  getNextDeadline(
    type: SarsDeadlineType,
    referenceDate: Date = new Date(),
  ): Date {
    const config = SARS_DEADLINE_CALENDAR[type];
    const ref = new Date(referenceDate);
    ref.setHours(0, 0, 0, 0);

    if (config.frequency === 'ANNUAL') {
      // Annual deadline (IRP5)
      const deadline = new Date(
        ref.getFullYear(),
        config.monthOfYear,
        config.dayOfMonth,
      );

      // If we've passed this year's deadline, use next year
      if (deadline < ref) {
        deadline.setFullYear(deadline.getFullYear() + 1);
      }

      return deadline;
    }

    // Monthly deadline (VAT201, EMP201)
    // The deadline is for the previous month's return
    const deadlineMonth = ref.getMonth() + config.monthOffset - 1;
    let deadline = new Date(
      ref.getFullYear(),
      deadlineMonth,
      config.dayOfMonth,
    );

    // If we've passed this month's deadline, calculate next month's
    if (deadline < ref) {
      deadline = new Date(
        ref.getFullYear(),
        deadlineMonth + 1,
        config.dayOfMonth,
      );
    }

    return deadline;
  }

  /**
   * Get deadline date for a specific reference date
   * Used for calculating deadlines for historical periods
   *
   * @param type - SARS deadline type
   * @param referenceDate - The date to calculate deadline for
   * @returns Deadline date
   */
  getDeadlineDate(type: SarsDeadlineType, referenceDate: Date): Date {
    return this.getNextDeadline(type, referenceDate);
  }

  /**
   * Get reminder preferences for a tenant
   *
   * @param tenantId - Tenant ID
   * @returns Reminder preferences
   */
  async getReminderPreferences(
    tenantId: string,
  ): Promise<DeadlineReminderPrefs> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { email: true },
    });

    // Return defaults - preferences can be stored in a settings table if needed
    return {
      reminderDays: [...DEFAULT_REMINDER_DAYS],
      channels: ['email'],
      recipientEmails: tenant?.email ? [tenant.email] : [],
      enabled: true,
    };
  }

  /**
   * Update reminder preferences for a tenant
   * Note: Would require a TenantSettings model for full implementation
   *
   * @param tenantId - Tenant ID
   * @param prefs - Preferences to update
   */
  async updateReminderPreferences(
    tenantId: string,
    prefs: Partial<DeadlineReminderPrefs>,
  ): Promise<void> {
    this.logger.log(
      `Updating reminder preferences for tenant ${tenantId}`,
      prefs,
    );
    // TODO: Store in TenantSettings when that table is available
    // For now, preferences are default-based
  }

  /**
   * Get reminder history for a deadline type
   *
   * @param tenantId - Tenant ID
   * @param type - SARS deadline type
   * @returns Array of past reminders
   */
  async getReminderHistory(
    tenantId: string,
    type: SarsDeadlineType,
  ): Promise<DeadlineReminder[]> {
    // Query audit log for reminder records
    const auditLogs = await this.prisma.auditLog.findMany({
      where: {
        tenantId,
        entityType: 'SarsDeadlineReminder',
        action: 'CREATE',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return auditLogs
      .map((log) => {
        const details = log.afterValue as Record<string, unknown> | null;
        if (!details || details.type !== type) {
          return null;
        }
        return {
          id: log.id,
          tenantId: log.tenantId,
          type: details.type as SarsDeadlineType,
          period: details.period as string,
          daysRemaining: details.daysRemaining as number,
          sentAt: log.createdAt,
          channel: details.channel as 'email' | 'whatsapp',
          recipients: details.recipients as string[],
        };
      })
      .filter((r): r is DeadlineReminder => r !== null);
  }

  /**
   * Check if reminders should be sent for a deadline
   *
   * @param tenantId - Tenant ID
   * @param deadline - Upcoming deadline
   * @returns Whether to send reminders
   */
  async shouldSendReminder(
    tenantId: string,
    deadline: UpcomingDeadline,
  ): Promise<boolean> {
    // Don't send reminders for submitted returns
    if (deadline.isSubmitted) {
      return false;
    }

    const prefs = await this.getReminderPreferences(tenantId);

    // Check if reminders are enabled
    if (!prefs.enabled) {
      return false;
    }

    // Check if this is a reminder day
    if (!prefs.reminderDays.includes(deadline.daysRemaining)) {
      return false;
    }

    // Check if we already sent a reminder today for this deadline
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const existingReminder = await this.prisma.auditLog.findFirst({
      where: {
        tenantId,
        entityType: 'SarsDeadlineReminder',
        entityId: `${deadline.type}-${deadline.period}`,
        createdAt: { gte: today },
      },
    });

    if (existingReminder) {
      this.logger.debug(
        `Reminder already sent today for ${deadline.type} ${deadline.period}`,
      );
      return false;
    }

    return true;
  }

  /**
   * Record that a reminder was sent
   *
   * @param tenantId - Tenant ID
   * @param reminder - Reminder details
   */
  async recordReminderSent(
    tenantId: string,
    reminder: Omit<DeadlineReminder, 'id' | 'tenantId' | 'sentAt'>,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        entityType: 'SarsDeadlineReminder',
        entityId: `${reminder.type}-${reminder.period}`,
        action: 'CREATE',
        afterValue: {
          type: reminder.type,
          period: reminder.period,
          daysRemaining: reminder.daysRemaining,
          channel: reminder.channel,
          recipients: reminder.recipients,
        },
        changeSummary: `Sent ${reminder.channel} reminder for ${reminder.type} ${reminder.period} (${reminder.daysRemaining} days remaining)`,
      },
    });
  }

  /**
   * Get period string for a deadline
   */
  private getPeriodString(type: SarsDeadlineType, deadline: Date): string {
    const config = SARS_DEADLINE_CALENDAR[type];

    if (config.frequency === 'ANNUAL') {
      return deadline.getFullYear().toString();
    }

    // Monthly - period is the previous month
    const periodMonth = new Date(deadline);
    periodMonth.setMonth(periodMonth.getMonth() - config.monthOffset);

    const year = periodMonth.getFullYear();
    const month = (periodMonth.getMonth() + 1).toString().padStart(2, '0');

    return `${year}-${month}`;
  }

  /**
   * Check if a return has been submitted
   */
  private async checkSubmissionStatus(
    tenantId: string,
    type: SarsDeadlineType,
    period: string,
  ): Promise<{ isSubmitted: boolean; submittedAt?: Date }> {
    // Check SarsSubmission table if it exists
    try {
      // Parse period string (YYYY-MM) to get start of month
      const [year, month] = period.split('-').map(Number);

      // If period is just a year (for annual like IRP5), use Jan 1
      const periodStartDate = month
        ? new Date(year, month - 1, 1)
        : new Date(year, 0, 1);

      // End of period: last day of month or year
      const periodEndDate = month
        ? new Date(year, month, 0) // Last day of month
        : new Date(year, 11, 31); // Dec 31

      const submission = await this.prisma.sarsSubmission.findFirst({
        where: {
          tenantId,
          submissionType: type,
          periodStart: {
            gte: periodStartDate,
          },
          periodEnd: {
            lte: periodEndDate,
          },
          status: 'SUBMITTED',
        },
      });

      if (submission) {
        return {
          isSubmitted: true,
          submittedAt: submission.submittedAt ?? undefined,
        };
      }
    } catch {
      // Table might not exist yet
      this.logger.debug('SarsSubmission table not available');
    }

    return { isSubmitted: false };
  }
}
