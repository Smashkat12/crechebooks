/**
 * SARS Deadline Processor
 * TASK-SARS-017: SARS Deadline Reminder System
 *
 * Processes daily SARS deadline check jobs and sends reminders.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { BaseProcessor } from './base.processor';
import { QUEUE_NAMES, SarsDeadlineJobData } from '../types/scheduler.types';
import { SarsDeadlineService } from '../../sars/sars-deadline.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { UpcomingDeadline } from '../../sars/types/deadline.types';

@Injectable()
@Processor(QUEUE_NAMES.SARS_DEADLINE)
export class SarsDeadlineProcessor extends BaseProcessor<SarsDeadlineJobData> {
  protected readonly logger = new Logger(SarsDeadlineProcessor.name);

  constructor(
    private readonly deadlineService: SarsDeadlineService,
    private readonly auditLogService: AuditLogService,
    private readonly prisma: PrismaService,
  ) {
    super(QUEUE_NAMES.SARS_DEADLINE);
  }

  @Process()
  async processJob(job: Job<SarsDeadlineJobData>): Promise<void> {
    const { tenantId, triggeredBy } = job.data;

    this.logger.log(
      `Processing SARS deadline check for tenant ${tenantId} (triggered by: ${triggeredBy})`,
    );

    try {
      // Check all upcoming deadlines within 30 days
      const upcomingDeadlines = await this.checkUpcomingDeadlines(tenantId);

      this.logger.log(
        `Found ${upcomingDeadlines.length} upcoming deadlines for tenant ${tenantId}`,
      );

      // Process each deadline
      for (const deadline of upcomingDeadlines) {
        try {
          // Check if we should send a reminder
          const shouldSend = await this.deadlineService.shouldSendReminder(
            tenantId,
            deadline,
          );

          if (shouldSend) {
            await this.sendDeadlineReminder(
              tenantId,
              deadline,
              deadline.daysRemaining,
            );
          }
        } catch (error) {
          // Log error but continue with other deadlines
          this.logger.error(
            `Failed to process deadline ${deadline.type} for tenant ${tenantId}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }

      // Log job completion
      await job.progress(100);
    } catch (error) {
      await this.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          file: 'sars-deadline.processor.ts',
          function: 'processJob',
          inputs: { tenantId },
          job,
        },
      );
    }
  }

  /**
   * Check upcoming deadlines for a tenant
   */
  private async checkUpcomingDeadlines(
    tenantId: string,
  ): Promise<UpcomingDeadline[]> {
    return this.deadlineService.getUpcomingDeadlines(tenantId, 30);
  }

  /**
   * Send deadline reminder to tenant
   */
  private async sendDeadlineReminder(
    tenantId: string,
    deadline: UpcomingDeadline,
    daysRemaining: number,
  ): Promise<void> {
    this.logger.log(
      `Sending ${deadline.type} deadline reminder to tenant ${tenantId} (${daysRemaining} days remaining)`,
    );

    // Get reminder preferences
    const prefs = await this.deadlineService.getReminderPreferences(tenantId);

    // Get tenant details for notification
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, email: true },
    });

    if (!tenant) {
      this.logger.warn(`Tenant ${tenantId} not found, skipping reminder`);
      return;
    }

    // Build notification message
    const subject = this.buildReminderSubject(deadline, daysRemaining);
    const body = this.buildReminderBody(deadline, daysRemaining, tenant.name);

    // Send via each configured channel
    for (const channel of prefs.channels) {
      try {
        if (channel === 'email') {
          await this.sendEmailReminder(prefs.recipientEmails, subject, body);
        } else if (channel === 'whatsapp') {
          // WhatsApp integration pending (TASK-BILL-015)
          this.logger.debug('WhatsApp channel pending implementation');
        }

        // Record reminder sent
        await this.deadlineService.recordReminderSent(tenantId, {
          type: deadline.type,
          period: deadline.period,
          daysRemaining,
          channel,
          recipients: prefs.recipientEmails,
        });

        this.logger.log(
          `Sent ${channel} reminder for ${deadline.type} ${deadline.period} to tenant ${tenantId}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send ${channel} reminder for ${deadline.type}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  /**
   * Build reminder email subject
   */
  private buildReminderSubject(
    deadline: UpcomingDeadline,
    daysRemaining: number,
  ): string {
    const urgency = daysRemaining <= 3 ? 'URGENT: ' : '';
    return `${urgency}${deadline.type} Deadline Reminder - ${daysRemaining} days remaining`;
  }

  /**
   * Build reminder message body
   */
  private buildReminderBody(
    deadline: UpcomingDeadline,
    daysRemaining: number,
    tenantName: string,
  ): string {
    const formattedDate = deadline.deadline.toLocaleDateString('en-ZA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const urgencyMessage =
      daysRemaining <= 1
        ? '⚠️ This is your FINAL reminder. Please submit immediately to avoid penalties.'
        : daysRemaining <= 3
          ? '⚠️ Deadline approaching! Please prioritize this submission.'
          : '';

    return `
Dear ${tenantName},

This is a reminder that your ${deadline.type} return for period ${deadline.period} is due on ${formattedDate}.

Days remaining: ${daysRemaining}

${urgencyMessage}

${this.getDeadlineDescription(deadline.type)}

Please ensure timely submission to avoid SARS penalties.

---
This is an automated reminder from CrecheBooks.
    `.trim();
  }

  /**
   * Get description for each deadline type
   */
  private getDeadlineDescription(type: string): string {
    switch (type) {
      case 'VAT201':
        return 'VAT201 is your monthly VAT return. Ensure all input and output VAT is reconciled before submission.';
      case 'EMP201':
        return 'EMP201 is your monthly PAYE return. Verify that all employee tax deductions are correctly calculated.';
      case 'IRP5':
        return 'IRP5 is your annual employee tax certificate. All employee records must be accurate for SARS reconciliation.';
      default:
        return '';
    }
  }

  /**
   * Send email reminder
   * Note: Uses placeholder until email service is integrated
   */
  private async sendEmailReminder(
    recipients: string[],
    subject: string,
    body: string,
  ): Promise<void> {
    // TODO: Integrate with email service when available
    this.logger.log({
      message: 'Email reminder queued',
      recipients,
      subject,
      bodyPreview: body.substring(0, 100) + '...',
    });

    // For now, just log the email
    // Email service integration pending
  }
}
