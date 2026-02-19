/**
 * Payment Reminder Service
 * TASK-PAY-015: Payment Reminder Scheduler Service
 *
 * Manages payment reminder scheduling for tenants.
 * Features:
 * - Tenant-configurable schedule
 * - Default: 09:00 SAST daily
 * - Manual trigger support
 * - Schedule cancellation
 */

import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { SchedulerService } from '../scheduler/scheduler.service';
import { PrismaService } from '../database/prisma/prisma.service';
import { AuditLogService } from '../database/services/audit-log.service';
import { AuditAction } from '../database/entities/audit-log.entity';
import {
  QUEUE_NAMES,
  PaymentReminderJobData,
} from '../scheduler/types/scheduler.types';
import { BusinessException } from '../shared/exceptions';
import { InvoiceStatus } from '../database/entities/invoice.entity';
import { todayUTC, diffCalendarDays } from '../shared/utils/date.util';
import {
  ReminderStage,
  OverdueInvoice,
  ReminderHistory,
  getStageForDaysOverdue,
} from './types/reminder.types';

/** Default cron: 09:00 SAST daily */
const DEFAULT_CRON = '0 9 * * *';

/** Default timezone for South Africa */
const DEFAULT_TIMEZONE = 'Africa/Johannesburg';

@Injectable()
export class PaymentReminderService {
  private readonly logger = new Logger(PaymentReminderService.name);

  constructor(
    private readonly schedulerService: SchedulerService,
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Schedule payment reminders for a tenant
   *
   * @param tenantId - Tenant ID
   * @param cronExpression - Optional custom cron (default: 0 9 * * *)
   */
  async scheduleReminders(
    tenantId: string,
    cronExpression: string = DEFAULT_CRON,
  ): Promise<void> {
    // Validate tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      this.logger.error({
        error: { message: 'Tenant not found', name: 'NotFoundError' },
        file: 'payment-reminder.service.ts',
        function: 'scheduleReminders',
        inputs: { tenantId },
        timestamp: new Date().toISOString(),
      });
      throw new BusinessException(
        `Tenant ${tenantId} not found`,
        'TENANT_NOT_FOUND',
      );
    }

    // Validate cron expression
    if (!this.isValidCronExpression(cronExpression)) {
      throw new BusinessException(
        `Invalid cron expression: ${cronExpression}`,
        'INVALID_CRON_EXPRESSION',
      );
    }

    // Create job data
    const jobData: PaymentReminderJobData = {
      tenantId,
      triggeredBy: 'cron',
      scheduledAt: new Date(),
      reminderType: 'gentle', // Type determined at runtime based on days overdue
    };

    // Schedule recurring cron job
    await this.schedulerService.scheduleCronJob(
      QUEUE_NAMES.PAYMENT_REMINDER,
      jobData,
      cronExpression,
    );

    this.logger.log({
      message: 'Payment reminders scheduled',
      tenantId,
      tenantName: tenant.name,
      cronExpression,
      timezone: DEFAULT_TIMEZONE,
      timestamp: new Date().toISOString(),
    });

    // Audit log
    await this.auditLogService.logAction({
      tenantId,
      entityType: 'PaymentReminderSchedule',
      entityId: tenantId,
      action: AuditAction.CREATE,
      afterValue: {
        cronExpression,
        timezone: DEFAULT_TIMEZONE,
        enabled: true,
        scheduledAt: new Date().toISOString(),
      },
      changeSummary: `Payment reminders scheduled: ${cronExpression} (${DEFAULT_TIMEZONE})`,
    });
  }

  /**
   * Cancel payment reminder schedule for a tenant
   *
   * @param tenantId - Tenant ID
   */
  async cancelReminders(tenantId: string): Promise<void> {
    this.logger.log({
      message: 'Payment reminder schedule cancellation requested',
      tenantId,
      timestamp: new Date().toISOString(),
    });

    // Audit log
    await this.auditLogService.logAction({
      tenantId,
      entityType: 'PaymentReminderSchedule',
      entityId: tenantId,
      action: AuditAction.UPDATE,
      afterValue: {
        enabled: false,
        cancelledAt: new Date().toISOString(),
      },
      changeSummary: 'Payment reminder schedule cancelled',
    });

    // TODO: Implement actual job cancellation when job tracking is added
  }

  /**
   * Get all overdue invoices for a tenant
   *
   * @param tenantId - Tenant ID
   * @returns List of overdue invoices with reminder status
   */
  async getOverdueInvoices(tenantId: string): Promise<OverdueInvoice[]> {
    const today = todayUTC();

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        isDeleted: false,
        dueDate: { lt: today },
        status: {
          in: [
            InvoiceStatus.SENT,
            InvoiceStatus.OVERDUE,
            InvoiceStatus.PARTIALLY_PAID,
          ],
        },
      },
      include: {
        parent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        child: {
          select: { id: true },
        },
        reminders: {
          orderBy: { sentAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    // Filter out fully paid and calculate overdue info
    return invoices
      .filter((inv) => inv.amountPaidCents < inv.totalCents)
      .map((inv) => {
        const daysOverdue = this.calculateDaysOverdue(inv.dueDate);
        const stage = getStageForDaysOverdue(daysOverdue);
        const lastReminder = inv.reminders[0];

        return {
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          parentId: inv.parentId,
          parentName: `${inv.parent.firstName} ${inv.parent.lastName}`,
          childId: inv.childId,
          dueDate: inv.dueDate,
          daysOverdue,
          outstandingCents: inv.totalCents - inv.amountPaidCents,
          stage: stage ?? 'FIRST',
          remindersSent: inv.reminders.length,
          lastReminderAt: lastReminder?.sentAt ?? null,
          isEscalated: stage === 'ESCALATED',
        };
      });
  }

  /**
   * Get reminder history for an invoice
   *
   * @param invoiceId - Invoice ID
   * @returns List of reminders sent for this invoice
   */
  async getReminderHistory(invoiceId: string): Promise<ReminderHistory[]> {
    const reminders = await this.prisma.reminder.findMany({
      where: { invoiceId },
      include: {
        invoice: {
          select: { invoiceNumber: true },
        },
      },
      orderBy: { sentAt: 'desc' },
    });

    return reminders.map((r) => ({
      id: r.id,
      invoiceId: r.invoiceId,
      invoiceNumber: r.invoice.invoiceNumber,
      stage: this.mapEscalationLevelToStage(r.escalationLevel),
      channel: r.deliveryMethod.toLowerCase() as 'email' | 'whatsapp',
      sentAt: r.sentAt ?? r.createdAt,
      status:
        r.reminderStatus === 'SENT'
          ? 'sent'
          : r.reminderStatus === 'DELIVERED'
            ? 'delivered'
            : 'failed',
      errorMessage: r.failureReason ?? undefined,
    }));
  }

  /**
   * Mark invoice as escalated for manual review
   *
   * @param invoiceId - Invoice ID
   */
  async markEscalated(invoiceId: string): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { id: true, invoiceNumber: true, tenantId: true },
    });

    if (!invoice) {
      throw new BusinessException(
        `Invoice ${invoiceId} not found`,
        'INVOICE_NOT_FOUND',
      );
    }

    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        notes: `[ESCALATED ${new Date().toISOString()}] Invoice requires manual follow-up.`,
        status: InvoiceStatus.OVERDUE,
      },
    });

    this.logger.log({
      message: 'Invoice marked as escalated',
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      timestamp: new Date().toISOString(),
    });

    // Audit log
    await this.auditLogService.logAction({
      tenantId: invoice.tenantId,
      entityType: 'Invoice',
      entityId: invoiceId,
      action: AuditAction.UPDATE,
      afterValue: {
        escalated: true,
        escalatedAt: new Date().toISOString(),
      },
      changeSummary: `Invoice ${invoice.invoiceNumber} escalated for manual review`,
    });
  }

  /**
   * Trigger manual reminder processing
   *
   * @param tenantId - Tenant ID
   * @param invoiceIds - Optional specific invoice IDs to process
   * @returns The scheduled job
   */
  async triggerManualReminders(
    tenantId: string,
    invoiceIds?: string[],
  ): Promise<Job<PaymentReminderJobData>> {
    // Validate tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true },
    });

    if (!tenant) {
      throw new BusinessException(
        `Tenant ${tenantId} not found`,
        'TENANT_NOT_FOUND',
      );
    }

    const jobData: PaymentReminderJobData = {
      tenantId,
      triggeredBy: 'manual',
      scheduledAt: new Date(),
      reminderType: 'gentle',
      invoiceIds,
    };

    const job = await this.schedulerService.scheduleJob(
      QUEUE_NAMES.PAYMENT_REMINDER,
      jobData,
    );

    this.logger.log({
      message: 'Manual payment reminder triggered',
      tenantId,
      invoiceIds: invoiceIds ?? 'all overdue',
      jobId: job.id,
      timestamp: new Date().toISOString(),
    });

    // Audit log
    await this.auditLogService.logAction({
      tenantId,
      entityType: 'PaymentReminder',
      entityId: String(job.id),
      action: AuditAction.CREATE,
      afterValue: {
        triggeredBy: 'manual',
        invoiceIds: invoiceIds ?? 'all',
        scheduledAt: new Date().toISOString(),
      },
      changeSummary: `Manual payment reminder triggered${invoiceIds ? ` for ${invoiceIds.length} invoices` : ''}`,
    });

    return job;
  }

  /**
   * Calculate days overdue (timezone-safe for @db.Date)
   */
  private calculateDaysOverdue(dueDate: Date): number {
    return Math.max(0, diffCalendarDays(dueDate, new Date()));
  }

  /**
   * Validate cron expression
   */
  private isValidCronExpression(cron: string): boolean {
    const parts = cron.trim().split(/\s+/);
    if (parts.length !== 5) return false;
    const fieldPattern = /^(\*|(\d+(-\d+)?(,\d+(-\d+)?)*)|(\/\d+)|\*\/\d+)$/;
    return parts.every((part) => fieldPattern.test(part));
  }

  /**
   * Map existing escalation level to reminder stage
   */
  private mapEscalationLevelToStage(escalationLevel: string): ReminderStage {
    switch (escalationLevel) {
      case 'FRIENDLY':
        return 'FIRST';
      case 'FIRM':
        return 'SECOND';
      case 'FINAL':
        return 'FINAL';
      default:
        return 'ESCALATED';
    }
  }
}
