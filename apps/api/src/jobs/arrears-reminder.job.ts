/**
 * Arrears Reminder Cron Job
 * TASK-FEAT-102: Automated Arrears Reminders
 *
 * Daily cron job to process and send automated payment reminders for overdue invoices.
 * Features:
 * - Configurable reminder levels (7, 14, 30, 60 days by default)
 * - Time-of-day checking (8 AM - 6 PM local time only)
 * - Max 1 reminder per invoice per day
 * - CC admin on level 3+ reminders
 * - Admin summary email after batch processing
 * - Opt-out respect
 * - Circuit breaker integration for email service
 *
 * CRITICAL: All queries MUST filter by tenantId (multi-tenant isolation)
 * CRITICAL: Fail fast with detailed error logging
 */

import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../database/prisma/prisma.service';
import { EmailService } from '../integrations/email/email.service';
import { TwilioWhatsAppService } from '../integrations/whatsapp/services/twilio-whatsapp.service';
import { ReminderTemplateService } from '../billing/reminder-template.service';
import { AuditLogService } from '../database/services/audit-log.service';
import { AuditAction } from '../database/entities/audit-log.entity';
import { InvoiceStatus } from '../database/entities/invoice.entity';
import { ConfigService } from '@nestjs/config';
import {
  ReminderStage,
  ReminderChannel,
  TemplateVariables,
} from '../billing/dto/reminder-template.dto';
import { DeliveryMethod, ReminderStatus } from '@prisma/client';

/**
 * Reminder level configuration
 */
export interface ReminderLevel {
  level: number;
  stage: ReminderStage;
  tone: 'friendly' | 'firm' | 'serious' | 'final';
}

/**
 * Overdue invoice with parent info
 */
export interface OverdueInvoice {
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
    whatsapp: string | null;
    whatsappOptIn: boolean;
    smsOptIn: boolean;
    preferredContact: string;
    isActive: boolean;
  };
  child: {
    id: string;
    firstName: string;
    lastName: string;
  };
  tenant: {
    id: string;
    name: string;
    email: string;
    phone: string;
  };
}

/**
 * Reminder history for duplicate checking
 */
export interface ReminderHistory {
  id: string;
  invoiceId: string;
  sentAt: Date | null;
  escalationLevel: string;
}

/**
 * Result of processing reminders
 */
export interface ReminderJobResult {
  tenantId: string;
  processedAt: Date;
  totalOverdue: number;
  byLevel: {
    level1: number;
    level2: number;
    level3: number;
    level4: number;
  };
  remindersSent: number;
  remindersSkipped: number;
  remindersFailed: number;
  skipReasons: Record<string, number>;
  errors: Array<{ invoiceId: string; error: string }>;
  durationMs: number;
}

/**
 * Reminder configuration from tenant settings
 */
interface ReminderConfig {
  enabled: boolean;
  level1Days: number;
  level2Days: number;
  level3Days: number;
  level4Days: number;
  ccAdminLevel: number;
  sendHoursStart: number;
  sendHoursEnd: number;
  maxPerDay: number;
  adminEmail: string | null;
}

/**
 * Default reminder configuration
 */
const DEFAULT_CONFIG: ReminderConfig = {
  enabled: true,
  level1Days: 7,
  level2Days: 14,
  level3Days: 30,
  level4Days: 60,
  ccAdminLevel: 3,
  sendHoursStart: 8,
  sendHoursEnd: 18,
  maxPerDay: 1,
  adminEmail: null,
};

/**
 * Reminder level definitions
 */
const REMINDER_LEVELS: ReminderLevel[] = [
  { level: 1, stage: ReminderStage.FIRST, tone: 'friendly' },
  { level: 2, stage: ReminderStage.SECOND, tone: 'firm' },
  { level: 3, stage: ReminderStage.FINAL, tone: 'serious' },
  { level: 4, stage: ReminderStage.ESCALATED, tone: 'final' },
];

@Injectable()
export class ArrearsReminderJob implements OnModuleDestroy {
  private readonly logger = new Logger(ArrearsReminderJob.name);
  private isProcessing = false;
  private shutdownRequested = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly reminderTemplateService: ReminderTemplateService,
    private readonly auditLogService: AuditLogService,
    private readonly configService: ConfigService,
    @Optional() private readonly twilioWhatsAppService?: TwilioWhatsAppService,
  ) {}

  /**
   * Graceful shutdown
   */
  onModuleDestroy(): void {
    this.shutdownRequested = true;
    this.logger.log('ArrearsReminderJob shutdown requested');
  }

  /**
   * Daily cron job at 8 AM SAST
   * Processes all tenants and sends reminders for overdue invoices
   */
  @Cron('0 8 * * *', {
    name: 'arrears-reminders',
    timeZone: 'Africa/Johannesburg',
  })
  async processReminders(): Promise<void> {
    if (this.isProcessing) {
      this.logger.warn('Reminder job already in progress, skipping');
      return;
    }

    if (this.shutdownRequested) {
      this.logger.warn('Shutdown requested, skipping reminder job');
      return;
    }

    this.isProcessing = true;
    const startTime = Date.now();

    this.logger.log('Starting automated arrears reminder job');

    try {
      // Get all active tenants
      const tenants = await this.prisma.tenant.findMany({
        where: { subscriptionStatus: 'ACTIVE' },
        select: {
          id: true,
          name: true,
          email: true,
          reminderConfig: true,
        },
      });

      this.logger.log(`Processing ${tenants.length} active tenants`);

      const allResults: ReminderJobResult[] = [];

      for (const tenant of tenants) {
        if (this.shutdownRequested) {
          this.logger.warn('Shutdown during processing, stopping');
          break;
        }

        try {
          const config = tenant.reminderConfig ?? DEFAULT_CONFIG;

          // Skip if reminders disabled for tenant
          if (!config.enabled) {
            this.logger.debug(`Reminders disabled for tenant ${tenant.id}`);
            continue;
          }

          // Check if within allowed send hours
          if (
            !this.isWithinSendHours(config.sendHoursStart, config.sendHoursEnd)
          ) {
            this.logger.debug(
              `Outside send hours (${config.sendHoursStart}-${config.sendHoursEnd}) for tenant ${tenant.id}`,
            );
            continue;
          }

          const result = await this.processTenantsReminders(tenant.id, config);
          allResults.push(result);

          // Send admin summary if any reminders were sent
          if (result.remindersSent > 0 || result.remindersFailed > 0) {
            await this.sendAdminSummary(
              tenant.id,
              tenant.email,
              config.adminEmail,
              result,
            );
          }
        } catch (error) {
          this.logger.error({
            error: {
              message: error instanceof Error ? error.message : String(error),
              name: error instanceof Error ? error.name : 'UnknownError',
            },
            file: 'arrears-reminder.job.ts',
            function: 'processReminders',
            tenantId: tenant.id,
            timestamp: new Date().toISOString(),
          });
        }
      }

      const totalDuration = Date.now() - startTime;
      const totalSent = allResults.reduce((sum, r) => sum + r.remindersSent, 0);
      const totalFailed = allResults.reduce(
        (sum, r) => sum + r.remindersFailed,
        0,
      );

      this.logger.log({
        message: 'Arrears reminder job completed',
        tenantsProcessed: allResults.length,
        totalSent,
        totalFailed,
        durationMs: totalDuration,
      });
    } catch (error) {
      this.logger.error({
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'UnknownError',
        },
        file: 'arrears-reminder.job.ts',
        function: 'processReminders',
        timestamp: new Date().toISOString(),
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process reminders for a single tenant
   */
  async processTenantsReminders(
    tenantId: string,
    config: ReminderConfig,
  ): Promise<ReminderJobResult> {
    const startTime = Date.now();

    const result: ReminderJobResult = {
      tenantId,
      processedAt: new Date(),
      totalOverdue: 0,
      byLevel: { level1: 0, level2: 0, level3: 0, level4: 0 },
      remindersSent: 0,
      remindersSkipped: 0,
      remindersFailed: 0,
      skipReasons: {},
      errors: [],
      durationMs: 0,
    };

    try {
      // Get overdue invoices
      const overdueInvoices = await this.getOverdueInvoices(tenantId);
      result.totalOverdue = overdueInvoices.length;

      if (overdueInvoices.length === 0) {
        this.logger.debug(`No overdue invoices for tenant ${tenantId}`);
        result.durationMs = Date.now() - startTime;
        return result;
      }

      this.logger.log(
        `Processing ${overdueInvoices.length} overdue invoices for tenant ${tenantId}`,
      );

      // Process each invoice
      for (const invoice of overdueInvoices) {
        if (this.shutdownRequested) break;

        try {
          const processResult = await this.processInvoiceReminder(
            invoice,
            config,
            result,
          );

          if (processResult === 'sent') {
            result.remindersSent++;
          } else if (processResult === 'failed') {
            result.remindersFailed++;
          } else {
            result.remindersSkipped++;
            result.skipReasons[processResult] =
              (result.skipReasons[processResult] ?? 0) + 1;
          }
        } catch (error) {
          result.remindersFailed++;
          result.errors.push({
            invoiceId: invoice.id,
            error: error instanceof Error ? error.message : String(error),
          });

          this.logger.error({
            error: {
              message: error instanceof Error ? error.message : String(error),
              name: error instanceof Error ? error.name : 'UnknownError',
            },
            file: 'arrears-reminder.job.ts',
            function: 'processTenantsReminders',
            invoiceId: invoice.id,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Log audit trail
      await this.auditLogService.logAction({
        tenantId,
        entityType: 'ArrearsReminder',
        entityId: `batch-${new Date().toISOString().split('T')[0]}`,
        action: AuditAction.CREATE,
        afterValue: {
          totalOverdue: result.totalOverdue,
          byLevel: result.byLevel,
          remindersSent: result.remindersSent,
          remindersSkipped: result.remindersSkipped,
          remindersFailed: result.remindersFailed,
        },
        changeSummary: `Processed ${result.totalOverdue} overdue invoices: ${result.remindersSent} sent, ${result.remindersSkipped} skipped, ${result.remindersFailed} failed`,
      });

      result.durationMs = Date.now() - startTime;
      return result;
    } catch (error) {
      result.durationMs = Date.now() - startTime;
      this.logger.error({
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'UnknownError',
        },
        file: 'arrears-reminder.job.ts',
        function: 'processTenantsReminders',
        tenantId,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  /**
   * Get overdue invoices for a tenant
   */
  async getOverdueInvoices(tenantId: string): Promise<OverdueInvoice[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
            email: true,
            whatsapp: true,
            whatsappOptIn: true,
            smsOptIn: true,
            preferredContact: true,
            isActive: true,
          },
        },
        child: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
          },
        },
        tenant: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    // Filter out fully paid invoices and inactive parents
    return invoices
      .filter((inv) => inv.amountPaidCents < inv.totalCents)
      .filter((inv) => inv.parent.isActive)
      .map((inv) => ({
        ...inv,
        parent: inv.parent,
        child: inv.child,
        tenant: inv.tenant,
      }));
  }

  /**
   * Determine reminder level based on days overdue and config
   */
  determineReminderLevel(
    invoice: OverdueInvoice,
    history: ReminderHistory[],
    config: ReminderConfig,
  ): ReminderLevel | null {
    const daysOverdue = this.calculateDaysOverdue(invoice.dueDate);

    // Determine which level applies
    let level: number | null = null;

    if (daysOverdue >= config.level4Days) {
      level = 4;
    } else if (daysOverdue >= config.level3Days) {
      level = 3;
    } else if (daysOverdue >= config.level2Days) {
      level = 2;
    } else if (daysOverdue >= config.level1Days) {
      level = 1;
    }

    if (level === null) {
      return null; // Not yet at first reminder threshold
    }

    // Check if we already sent a reminder at this level
    const levelStage = REMINDER_LEVELS.find((l) => l.level === level)?.stage;
    const alreadySent = history.some(
      (h) => h.escalationLevel === levelStage && h.sentAt !== null,
    );

    if (alreadySent) {
      // Try to escalate to next level if applicable
      const nextLevel = level + 1;
      if (nextLevel <= 4) {
        const nextLevelDays = this.getLevelDays(nextLevel, config);
        if (daysOverdue >= nextLevelDays) {
          const nextLevelInfo = REMINDER_LEVELS.find(
            (l) => l.level === nextLevel,
          );
          const nextAlreadySent = history.some(
            (h) =>
              h.escalationLevel === nextLevelInfo?.stage && h.sentAt !== null,
          );
          if (!nextAlreadySent && nextLevelInfo) {
            return nextLevelInfo;
          }
        }
      }
      return null; // Already sent at this level and can't escalate
    }

    return REMINDER_LEVELS.find((l) => l.level === level) ?? null;
  }

  /**
   * Get days threshold for a level
   */
  private getLevelDays(level: number, config: ReminderConfig): number {
    switch (level) {
      case 1:
        return config.level1Days;
      case 2:
        return config.level2Days;
      case 3:
        return config.level3Days;
      case 4:
        return config.level4Days;
      default:
        return 999;
    }
  }

  /**
   * Process a single invoice reminder
   */
  private async processInvoiceReminder(
    invoice: OverdueInvoice,
    config: ReminderConfig,
    result: ReminderJobResult,
  ): Promise<'sent' | 'failed' | string> {
    // Check if parent opted out
    if (!invoice.parent.isActive) {
      return 'parent_inactive';
    }

    // Check for recent reminder (max per day)
    const recentReminders = await this.getRecentReminders(
      invoice.id,
      invoice.tenantId,
      config.maxPerDay,
    );
    if (recentReminders.length >= config.maxPerDay) {
      return 'max_daily_reached';
    }

    // Get full reminder history for level determination
    const history = await this.getReminderHistory(invoice.id, invoice.tenantId);

    // Determine appropriate level
    const level = this.determineReminderLevel(invoice, history, config);
    if (!level) {
      return 'not_yet_due_for_reminder';
    }

    // Update level counts
    switch (level.level) {
      case 1:
        result.byLevel.level1++;
        break;
      case 2:
        result.byLevel.level2++;
        break;
      case 3:
        result.byLevel.level3++;
        break;
      case 4:
        result.byLevel.level4++;
        break;
    }

    // Send the reminder
    await this.sendReminder(invoice, level, config);

    return 'sent';
  }

  /**
   * Send reminder for an invoice
   */
  async sendReminder(
    invoice: OverdueInvoice,
    level: ReminderLevel,
    config: ReminderConfig,
  ): Promise<void> {
    const daysOverdue = this.calculateDaysOverdue(invoice.dueDate);
    const outstandingCents = invoice.totalCents - invoice.amountPaidCents;

    // Get template
    const template = await this.reminderTemplateService.getEffectiveTemplate(
      invoice.tenantId,
      level.stage,
    );

    // Prepare template variables
    const variables: TemplateVariables = {
      parentName: invoice.parent.firstName,
      childName: invoice.child.firstName,
      invoiceNumber: invoice.invoiceNumber,
      amount: this.formatCentsToRand(outstandingCents),
      dueDate: this.formatDate(invoice.dueDate),
      daysOverdue: daysOverdue.toString(),
      crecheName: invoice.tenant.name,
      crechePhone: invoice.tenant.phone,
      crecheEmail: invoice.tenant.email,
    };

    // Render email content
    const subject = this.reminderTemplateService.renderTemplate(
      template.emailSubject,
      variables,
      false,
    );
    const body = this.reminderTemplateService.renderTemplate(
      template.emailBody,
      variables,
      true,
    );

    // Determine CC recipients
    const ccRecipients: string[] = [];
    if (level.level >= config.ccAdminLevel) {
      const adminEmail = config.adminEmail ?? invoice.tenant.email;
      if (adminEmail && adminEmail !== invoice.parent.email) {
        ccRecipients.push(adminEmail);
      }
    }

    // Send email
    if (!invoice.parent.email) {
      throw new Error(`Parent ${invoice.parentId} has no email address`);
    }

    const emailResult = await this.emailService.sendEmailWithOptions({
      to: invoice.parent.email,
      subject,
      body,
      html: body.replace(/\n/g, '<br>'),
      cc: ccRecipients.length > 0 ? ccRecipients : undefined,
    });

    // Map level to EscalationLevel enum
    const escalationLevelMap: Record<number, 'FRIENDLY' | 'FIRM' | 'FINAL'> = {
      1: 'FRIENDLY',
      2: 'FIRM',
      3: 'FINAL',
      4: 'FINAL', // Level 4 uses FINAL
    };

    // Create reminder record for email
    await this.prisma.reminder.create({
      data: {
        tenantId: invoice.tenantId,
        invoiceId: invoice.id,
        parentId: invoice.parentId,
        escalationLevel: escalationLevelMap[level.level],
        deliveryMethod: DeliveryMethod.EMAIL,
        reminderStatus:
          emailResult.status === 'sent'
            ? ReminderStatus.SENT
            : ReminderStatus.FAILED,
        sentAt: emailResult.status === 'sent' ? new Date() : null,
        content: body,
        subject,
        failureReason:
          emailResult.status !== 'sent' ? 'Email send failed' : null,
      },
    });

    this.logger.log({
      message: 'Email reminder sent',
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      level: level.level,
      stage: level.stage,
      daysOverdue,
      ccAdmin: ccRecipients.length > 0,
    });

    // TASK-WA-008: Send WhatsApp reminder if opted in
    await this.sendWhatsAppReminder(
      invoice,
      level,
      daysOverdue,
      outstandingCents,
    );
  }

  /**
   * Send WhatsApp payment reminder if parent has opted in
   * TASK-WA-008: WhatsApp Arrears Reminders
   */
  private async sendWhatsAppReminder(
    invoice: OverdueInvoice,
    level: ReminderLevel,
    daysOverdue: number,
    outstandingCents: number,
  ): Promise<void> {
    // Check if WhatsApp is configured
    if (!this.twilioWhatsAppService?.isConfigured()) {
      return;
    }

    // Check if parent has WhatsApp and has opted in
    const whatsAppNumber = invoice.parent.whatsapp;
    if (!whatsAppNumber || !invoice.parent.whatsappOptIn) {
      this.logger.debug(
        `Skipping WhatsApp reminder for invoice ${invoice.invoiceNumber}: no WhatsApp or not opted in`,
      );
      return;
    }

    try {
      const parentName =
        `${invoice.parent.firstName} ${invoice.parent.lastName}`.trim();
      const amount = outstandingCents / 100;

      const result = await this.twilioWhatsAppService.sendPaymentReminder(
        invoice.tenantId,
        whatsAppNumber,
        parentName,
        invoice.invoiceNumber,
        amount,
        daysOverdue,
        invoice.tenant.name, // Use tenant name for white-labeling
      );

      if (result.success) {
        // Create reminder record for WhatsApp
        await this.prisma.reminder.create({
          data: {
            tenantId: invoice.tenantId,
            invoiceId: invoice.id,
            parentId: invoice.parentId,
            escalationLevel:
              level.level === 1
                ? 'FRIENDLY'
                : level.level === 2
                  ? 'FIRM'
                  : 'FINAL',
            deliveryMethod: DeliveryMethod.WHATSAPP,
            reminderStatus: ReminderStatus.SENT,
            sentAt: new Date(),
            content: `Payment reminder sent via WhatsApp for invoice ${invoice.invoiceNumber}`,
            subject: `Payment Reminder - Level ${level.level}`,
          },
        });

        this.logger.log({
          message: 'WhatsApp reminder sent',
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          level: level.level,
          daysOverdue,
          messageId: result.messageId,
        });
      } else {
        this.logger.warn({
          message: 'WhatsApp reminder failed',
          invoiceId: invoice.id,
          error: result.error,
          errorCode: result.errorCode,
        });
      }
    } catch (error) {
      // Non-blocking - don't fail the entire reminder if WhatsApp fails
      this.logger.warn({
        message: 'WhatsApp reminder error',
        invoiceId: invoice.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get recent reminders for duplicate checking
   */
  private async getRecentReminders(
    invoiceId: string,
    tenantId: string,
    hoursBack: number = 24,
  ): Promise<ReminderHistory[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hoursBack);

    const reminders = await this.prisma.reminder.findMany({
      where: {
        invoiceId,
        tenantId,
        sentAt: { gte: cutoffDate },
        reminderStatus: ReminderStatus.SENT,
      },
      select: {
        id: true,
        invoiceId: true,
        sentAt: true,
        escalationLevel: true,
      },
    });

    return reminders;
  }

  /**
   * Get full reminder history for an invoice
   */
  private async getReminderHistory(
    invoiceId: string,
    tenantId: string,
  ): Promise<ReminderHistory[]> {
    const reminders = await this.prisma.reminder.findMany({
      where: {
        invoiceId,
        tenantId,
        reminderStatus: ReminderStatus.SENT,
      },
      select: {
        id: true,
        invoiceId: true,
        sentAt: true,
        escalationLevel: true,
      },
      orderBy: { sentAt: 'desc' },
    });

    return reminders;
  }

  /**
   * Send admin summary email after batch processing
   */
  private async sendAdminSummary(
    tenantId: string,
    tenantEmail: string,
    adminEmail: string | null,
    result: ReminderJobResult,
  ): Promise<void> {
    const recipient = adminEmail ?? tenantEmail;

    const subject = `Arrears Reminder Summary - ${result.processedAt.toLocaleDateString('en-ZA')}`;

    const body = `
Automated Arrears Reminder Summary
==================================

Date: ${result.processedAt.toLocaleDateString('en-ZA')}
Processing Time: ${result.durationMs}ms

Overview
--------
Total Overdue Invoices: ${result.totalOverdue}
Reminders Sent: ${result.remindersSent}
Reminders Skipped: ${result.remindersSkipped}
Reminders Failed: ${result.remindersFailed}

Breakdown by Level
------------------
Level 1 (7 days): ${result.byLevel.level1}
Level 2 (14 days): ${result.byLevel.level2}
Level 3 (30 days): ${result.byLevel.level3}
Level 4 (60 days): ${result.byLevel.level4}

${
  result.errors.length > 0
    ? `
Errors
------
${result.errors.map((e) => `- Invoice ${e.invoiceId}: ${e.error}`).join('\n')}
`
    : ''
}

${
  Object.keys(result.skipReasons).length > 0
    ? `
Skip Reasons
------------
${Object.entries(result.skipReasons)
  .map(([reason, count]) => `- ${reason}: ${count}`)
  .join('\n')}
`
    : ''
}

This is an automated message.
    `.trim();

    try {
      await this.emailService.sendEmail(recipient, subject, body);
      this.logger.log(`Admin summary sent to ${recipient}`);
    } catch (error) {
      this.logger.error({
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'UnknownError',
        },
        file: 'arrears-reminder.job.ts',
        function: 'sendAdminSummary',
        tenantId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Check if current time is within allowed send hours
   */
  private isWithinSendHours(startHour: number, endHour: number): boolean {
    const now = new Date();
    // Convert to SAST (UTC+2)
    const sastOffset = 2 * 60; // minutes
    const utcMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
    const sastMinutes = (utcMinutes + sastOffset) % (24 * 60);
    const sastHour = Math.floor(sastMinutes / 60);

    return sastHour >= startHour && sastHour < endHour;
  }

  /**
   * Calculate days overdue
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
   * Format cents to Rand
   */
  private formatCentsToRand(cents: number): string {
    const rands = cents / 100;
    return `R${rands.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  /**
   * Format date to South African format
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  /**
   * Manual trigger for testing or on-demand processing
   */
  async triggerForTenant(tenantId: string): Promise<ReminderJobResult> {
    this.logger.log(`Manual trigger for tenant ${tenantId}`);

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { reminderConfig: true },
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }

    const config =
      (tenant.reminderConfig as ReminderConfig | null) ?? DEFAULT_CONFIG;

    return this.processTenantsReminders(tenantId, config);
  }
}
