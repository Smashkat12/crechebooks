/**
 * Payment Reminder Processor
 * TASK-PAY-015: Payment Reminder Scheduler Service
 *
 * Processes scheduled payment reminder jobs.
 * Features:
 * - Daily cron job at 09:00 SAST
 * - Configurable reminder intervals (7, 14, 30, 45 days)
 * - Multi-channel delivery (email/WhatsApp)
 * - Escalation at 45 days
 * - Duplicate prevention
 */

import { Injectable, Logger } from '@nestjs/common';
import { Process, Processor } from '@nestjs/bull';
import type { Job } from 'bull';
import { BaseProcessor } from './base.processor';
import { QUEUE_NAMES, PaymentReminderJobData } from '../types/scheduler.types';
import { PrismaService } from '../../database/prisma/prisma.service';
import { ReminderService } from '../../database/services/reminder.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { InvoiceStatus } from '../../database/entities/invoice.entity';
import {
  ReminderStage,
  InvoiceWithParent,
  PaymentReminderResult,
  getStageForDaysOverdue,
} from '../../billing/types/reminder.types';

/** Default cron: 09:00 SAST daily (0 9 * * *) */
export const DEFAULT_REMINDER_CRON = '0 9 * * *';

/** Minimum hours between reminders for same invoice (duplicate prevention) */
const MIN_HOURS_BETWEEN_REMINDERS = 24;

@Injectable()
@Processor(QUEUE_NAMES.PAYMENT_REMINDER)
export class PaymentReminderProcessor extends BaseProcessor<PaymentReminderJobData> {
  protected readonly logger = new Logger(PaymentReminderProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reminderService: ReminderService,
    private readonly auditLogService: AuditLogService,
  ) {
    super(QUEUE_NAMES.PAYMENT_REMINDER);
  }

  @Process()
  async processJob(job: Job<PaymentReminderJobData>): Promise<void> {
    const { tenantId, triggeredBy, invoiceIds } = job.data;

    this.logger.log({
      message: 'Starting payment reminder job',
      jobId: job.id,
      tenantId,
      triggeredBy,
      invoiceIds: invoiceIds?.length ?? 'all overdue',
      timestamp: new Date().toISOString(),
    });

    try {
      const result = await this.processReminders(tenantId, invoiceIds, job);

      // Log completion
      this.logger.log({
        message: 'Payment reminder job completed',
        jobId: job.id,
        tenantId,
        result: {
          totalOverdue: result.totalOverdue,
          remindersSent: result.remindersSent,
          remindersSkipped: result.remindersSkipped,
          remindersFailed: result.remindersFailed,
          durationMs: result.durationMs,
        },
        timestamp: new Date().toISOString(),
      });

      // Record audit log
      await this.auditLogService.logAction({
        tenantId,
        entityType: 'PaymentReminder',
        entityId: `batch-${new Date().toISOString().split('T')[0]}`,
        action: AuditAction.CREATE,
        afterValue: {
          triggeredBy,
          totalOverdue: result.totalOverdue,
          byStage: result.byStage,
          remindersSent: result.remindersSent,
          remindersSkipped: result.remindersSkipped,
          remindersFailed: result.remindersFailed,
          durationMs: result.durationMs,
        },
        changeSummary: `Processed ${result.totalOverdue} overdue invoices: ${result.remindersSent} sent, ${result.remindersSkipped} skipped, ${result.remindersFailed} failed`,
      });

      // Send admin notification for escalated invoices
      if (result.byStage.escalated > 0) {
        await this.notifyEscalation(tenantId, result.byStage.escalated);
      }

      // Mark job as complete
      await job.progress(100);
    } catch (error) {
      await this.handleError(
        error instanceof Error ? error : new Error(String(error)),
        {
          file: 'payment-reminder.processor.ts',
          function: 'processJob',
          inputs: { tenantId, triggeredBy },
          job,
        },
      );
    }
  }

  /**
   * Process reminders for overdue invoices
   */
  private async processReminders(
    tenantId: string,
    specificInvoiceIds: string[] | undefined,
    job: Job<PaymentReminderJobData>,
  ): Promise<PaymentReminderResult> {
    const startTime = Date.now();

    const result: PaymentReminderResult = {
      tenantId,
      processedAt: new Date(),
      totalOverdue: 0,
      byStage: { first: 0, second: 0, final: 0, escalated: 0 },
      remindersSent: 0,
      remindersSkipped: 0,
      remindersFailed: 0,
      durationMs: 0,
    };

    // Get overdue invoices
    const overdueInvoices = await this.findOverdueInvoices(
      tenantId,
      specificInvoiceIds,
    );
    result.totalOverdue = overdueInvoices.length;

    if (overdueInvoices.length === 0) {
      this.logger.log(`No overdue invoices found for tenant ${tenantId}`);
      result.durationMs = Date.now() - startTime;
      return result;
    }

    // Process each overdue invoice
    for (let i = 0; i < overdueInvoices.length; i++) {
      const invoice = overdueInvoices[i];
      const daysOverdue = this.calculateDaysOverdue(invoice.dueDate);
      const stage = getStageForDaysOverdue(daysOverdue);

      if (!stage) {
        // Not yet at first reminder threshold (7 days)
        result.remindersSkipped++;
        continue;
      }

      // Count by stage
      switch (stage) {
        case 'FIRST':
          result.byStage.first++;
          break;
        case 'SECOND':
          result.byStage.second++;
          break;
        case 'FINAL':
          result.byStage.final++;
          break;
        case 'ESCALATED':
          result.byStage.escalated++;
          break;
      }

      // Check for duplicate reminder
      const isDuplicate = await this.checkDuplicateReminder(invoice.id, stage);
      if (isDuplicate) {
        result.remindersSkipped++;
        this.logger.debug(
          `Skipping duplicate reminder for invoice ${invoice.invoiceNumber}`,
        );
        continue;
      }

      // Send reminder
      try {
        await this.sendReminder(invoice, stage);
        result.remindersSent++;

        // If escalated, mark the invoice for manual review
        if (stage === 'ESCALATED') {
          await this.markEscalated(invoice.id);
        }
      } catch (error) {
        result.remindersFailed++;
        this.logger.error({
          error: {
            message: error instanceof Error ? error.message : String(error),
            name: error instanceof Error ? error.name : 'UnknownError',
          },
          file: 'payment-reminder.processor.ts',
          function: 'processReminders',
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          timestamp: new Date().toISOString(),
        });
      }

      // Update progress
      const progress = Math.round(((i + 1) / overdueInvoices.length) * 90);
      await job.progress(progress);
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Find overdue invoices for a tenant
   */
  private async findOverdueInvoices(
    tenantId: string,
    specificInvoiceIds?: string[],
  ): Promise<InvoiceWithParent[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const whereClause: any = {
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
    };

    if (specificInvoiceIds && specificInvoiceIds.length > 0) {
      whereClause.id = { in: specificInvoiceIds };
    }

    const invoices = await this.prisma.invoice.findMany({
      where: whereClause,
      include: {
        parent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            whatsapp: true,
            whatsappOptIn: true,
            preferredContact: true,
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    // Filter out fully paid invoices
    return invoices
      .filter((inv) => inv.amountPaidCents < inv.totalCents)
      .map((inv) => ({
        ...inv,
        parent: inv.parent as InvoiceWithParent['parent'],
      }));
  }

  /**
   * Send reminder for an invoice at a specific stage
   */
  private async sendReminder(
    invoice: InvoiceWithParent,
    stage: ReminderStage,
  ): Promise<void> {
    this.logger.log({
      message: 'Sending payment reminder',
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      stage,
      parentId: invoice.parentId,
    });

    // Use the existing ReminderService to send the reminder
    // It handles channel selection, template rendering, and tracking
    const result = await this.reminderService.sendReminders(
      [invoice.id],
      undefined, // Use parent's preferred channel
      invoice.tenantId,
    );

    if (result.failed > 0) {
      const failedDetail = result.details.find((d) => d.status === 'FAILED');
      throw new Error(failedDetail?.error ?? 'Failed to send reminder');
    }
  }

  /**
   * Check if a duplicate reminder was sent recently
   */
  private async checkDuplicateReminder(
    invoiceId: string,
    _stage: ReminderStage,
  ): Promise<boolean> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - MIN_HOURS_BETWEEN_REMINDERS);

    const recentReminder = await this.prisma.reminder.findFirst({
      where: {
        invoiceId,
        sentAt: { gte: cutoffDate },
        reminderStatus: 'SENT',
      },
    });

    return !!recentReminder;
  }

  /**
   * Mark invoice as escalated for manual review
   */
  private async markEscalated(invoiceId: string): Promise<void> {
    // Add a note to the invoice indicating escalation
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        notes: `[ESCALATED ${new Date().toISOString()}] Invoice requires manual follow-up after 45+ days overdue.`,
        status: InvoiceStatus.OVERDUE,
      },
    });

    this.logger.warn(
      `Invoice ${invoiceId} escalated for manual review (45+ days overdue)`,
    );
  }

  /**
   * Calculate days overdue for an invoice
   */
  private calculateDaysOverdue(dueDate: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);

    const diffMs = today.getTime() - due.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Notify admin about escalated invoices
   */
  private async notifyEscalation(
    tenantId: string,
    escalatedCount: number,
  ): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, email: true },
    });

    if (!tenant) {
      this.logger.warn(
        `Tenant ${tenantId} not found for escalation notification`,
      );
      return;
    }

    this.logger.log({
      message: 'Escalation notification prepared',
      tenantId,
      tenantName: tenant.name,
      recipientEmail: tenant.email,
      escalatedCount,
      subject: `Action Required: ${escalatedCount} Invoice(s) Escalated`,
    });

    // TODO: Integrate with email service when available
  }
}
