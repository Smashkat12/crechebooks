/**
 * ReminderService
 * TASK-PAY-014: Payment Reminder Service
 *
 * @module database/services/reminder
 * @description Handles automated and manual payment reminders for overdue invoices
 * with template-based content, escalation levels, and multi-channel delivery.
 *
 * CRITICAL: All monetary values in cents (integers)
 * CRITICAL: Fail fast with detailed logging BEFORE throwing
 * CRITICAL: Filter by tenantId on ALL queries (multi-tenant isolation)
 * CRITICAL: Try-catch with logging before throwing
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { ParentRepository } from '../repositories/parent.repository';
import {
  ReminderRepository,
  CreateReminderData,
} from '../repositories/reminder.repository';
import { ArrearsService } from './arrears.service';
import { EmailService } from '../../integrations/email/email.service';
import { WhatsAppProviderService } from '../../integrations/whatsapp/services/whatsapp-provider.service';
import { NotFoundException, BusinessException } from '../../shared/exceptions';
import { MessageTemplateResolverService } from './message-template-resolver.service';
import type {
  MessageTemplateKeyLiteral,
  MessageTemplateChannelLiteral,
} from '../constants/message-template-defaults';
import {
  EscalationLevel,
  ReminderStatus,
  DeliveryChannel,
  ReminderContent,
  ReminderResult,
  ManualReminderResult,
  EscalationResult,
  ReminderHistoryEntry,
  ScheduleReminderDto,
} from '../dto/reminder.dto';
import { PreferredContact } from '../entities/parent.entity';

/**
 * Minimum days between reminders for same invoice (duplicate prevention)
 */
const MIN_DAYS_BETWEEN_REMINDERS = 3;

@Injectable()
export class ReminderService {
  private readonly logger = new Logger(ReminderService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly invoiceRepo: InvoiceRepository,
    private readonly parentRepo: ParentRepository,
    private readonly reminderRepo: ReminderRepository,
    private readonly arrearsService: ArrearsService,
    private readonly emailService: EmailService,
    private readonly whatsAppService: WhatsAppProviderService,
    private readonly templateResolver: MessageTemplateResolverService,
  ) {}

  /**
   * Map an escalation level to the corresponding MessageTemplate key so the
   * resolver returns the right customizable template.
   */
  private static readonly TEMPLATE_KEY_BY_LEVEL: Record<
    EscalationLevel,
    MessageTemplateKeyLiteral
  > = {
    [EscalationLevel.FRIENDLY]: 'ARREARS_REMINDER_FRIENDLY',
    [EscalationLevel.FIRM]: 'ARREARS_REMINDER_FIRM',
    [EscalationLevel.FINAL]: 'ARREARS_REMINDER_FINAL',
  };

  /**
   * Send reminders for specified invoices
   *
   * Main business logic for sending payment reminders with:
   * - Automatic escalation level determination
   * - Duplicate prevention (3-day minimum)
   * - Multi-channel delivery (Email/WhatsApp)
   * - Comprehensive tracking and logging
   *
   * @param invoiceIds - Array of invoice IDs to send reminders for
   * @param channel - Optional delivery channel override (defaults to parent preference)
   * @param tenantId - Tenant ID for multi-tenant isolation
   * @returns Summary of sent, failed, and skipped reminders
   */
  async sendReminders(
    invoiceIds: string[],
    channel: DeliveryChannel | undefined,
    tenantId: string,
  ): Promise<ReminderResult> {
    this.logger.log(
      `Sending reminders for ${invoiceIds.length} invoices (tenant: ${tenantId})`,
    );

    const result: ReminderResult = {
      sent: 0,
      failed: 0,
      skipped: 0,
      details: [],
    };

    for (const invoiceId of invoiceIds) {
      try {
        // 1. Fetch invoice with parent, child, tenant relations
        const invoice = await this.prisma.invoice.findUnique({
          where: { id: invoiceId, tenantId, isDeleted: false },
          include: { parent: true, child: true, tenant: true },
        });

        if (!invoice) {
          result.skipped++;
          result.details.push({
            invoiceId,
            invoiceNumber: 'UNKNOWN',
            status: 'SKIPPED',
            escalationLevel: EscalationLevel.FRIENDLY,
            deliveryChannel: DeliveryChannel.EMAIL,
            error: 'Invoice not found',
          });
          this.logger.warn(`Invoice ${invoiceId} not found, skipping`);
          continue;
        }

        // 2. Skip if fully paid
        if (invoice.amountPaidCents >= invoice.totalCents) {
          result.skipped++;
          result.details.push({
            invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            status: 'SKIPPED',
            escalationLevel: EscalationLevel.FRIENDLY,
            deliveryChannel: DeliveryChannel.EMAIL,
            error: 'Invoice already paid',
          });
          this.logger.log(
            `Invoice ${invoice.invoiceNumber} already paid, skipping`,
          );
          continue;
        }

        // 3. Check for recent reminder
        if (await this.hasRecentReminder(invoiceId, tenantId)) {
          result.skipped++;
          result.details.push({
            invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            status: 'SKIPPED',
            escalationLevel: EscalationLevel.FRIENDLY,
            deliveryChannel: DeliveryChannel.EMAIL,
            error: 'Recent reminder already sent (within 3 days)',
          });
          this.logger.log(
            `Invoice ${invoice.invoiceNumber} has recent reminder, skipping`,
          );
          continue;
        }

        // 4. Calculate days overdue
        const daysOverdue = this.calculateDaysOverdue(invoice.dueDate);
        if (daysOverdue < 1) {
          result.skipped++;
          result.details.push({
            invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            status: 'SKIPPED',
            escalationLevel: EscalationLevel.FRIENDLY,
            deliveryChannel: DeliveryChannel.EMAIL,
            error: 'Invoice not yet overdue',
          });
          this.logger.log(
            `Invoice ${invoice.invoiceNumber} not yet overdue, skipping`,
          );
          continue;
        }

        // 5. Determine escalation level
        const escalationLevel = this.determineEscalationLevel(daysOverdue);

        // 6. Generate content
        const content = await this.generateReminderContent(
          invoiceId,
          escalationLevel,
          tenantId,
        );

        // 7. Determine delivery channel
        const deliveryChannel =
          channel ??
          this.mapPreferredContactToChannel(
            invoice.parent.preferredContact as PreferredContact,
          );

        // 8. Send via appropriate channel(s)
        let emailResult: {
          success: boolean;
          messageId?: string;
          error?: string;
        } | null = null;
        let whatsappResult: {
          success: boolean;
          messageId?: string;
          error?: string;
        } | null = null;

        if (
          deliveryChannel === DeliveryChannel.EMAIL ||
          deliveryChannel === DeliveryChannel.BOTH
        ) {
          emailResult = await this.sendViaEmail(invoice.parent.email, content);
        }

        if (
          deliveryChannel === DeliveryChannel.WHATSAPP ||
          deliveryChannel === DeliveryChannel.BOTH
        ) {
          whatsappResult = await this.sendViaWhatsApp(
            invoice.parent.whatsapp,
            content,
            tenantId,
          );
        }

        // 9. Determine overall status
        const anySuccess = emailResult?.success || whatsappResult?.success;

        // 10. Create reminder record
        const reminderData: CreateReminderData = {
          tenantId,
          invoiceId,
          parentId: invoice.parentId,
          escalationLevel,
          deliveryMethod: deliveryChannel,
          reminderStatus: anySuccess
            ? ReminderStatus.SENT
            : ReminderStatus.FAILED,
          sentAt: anySuccess ? new Date() : undefined,
          content: content.body,
          subject: content.subject,
          failureReason: !anySuccess
            ? (emailResult?.error ?? whatsappResult?.error)
            : undefined,
        };

        const reminder = await this.reminderRepo.create(reminderData);

        if (anySuccess) {
          result.sent++;
          result.details.push({
            invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            status: 'SENT',
            escalationLevel,
            deliveryChannel,
            reminderId: reminder.id,
          });
          this.logger.log(
            `Reminder sent for invoice ${invoice.invoiceNumber} (${escalationLevel}, ${deliveryChannel})`,
          );
        } else {
          result.failed++;
          result.details.push({
            invoiceId,
            invoiceNumber: invoice.invoiceNumber,
            status: 'FAILED',
            escalationLevel,
            deliveryChannel,
            error: emailResult?.error ?? whatsappResult?.error,
          });
          this.logger.error(
            `Reminder failed for invoice ${invoice.invoiceNumber}: ${emailResult?.error ?? whatsappResult?.error}`,
          );
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Failed to send reminder for ${invoiceId}: ${errorMessage}`,
          error instanceof Error ? error.stack : String(error),
        );
        result.failed++;
        result.details.push({
          invoiceId,
          invoiceNumber: 'UNKNOWN',
          status: 'FAILED',
          escalationLevel: EscalationLevel.FRIENDLY,
          deliveryChannel: DeliveryChannel.EMAIL,
          error: errorMessage,
        });
      }
    }

    this.logger.log(
      `Reminder batch complete: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped`,
    );

    return result;
  }

  /**
   * Send manual (user-initiated) reminders to specific parents.
   *
   * Backs POST /arrears/reminder. Unlike the automated engines, this is an
   * explicit operator action, so the 3-day duplicate-prevention window is
   * intentionally NOT applied. Per parent:
   * - finds their overdue unpaid invoices (oldest = anchor for the record)
   * - uses the caller's template text when provided (the frontend
   *   pre-resolves [Parent Name]/[Creche Name], but substitution is applied
   *   again here for robustness), else falls back to the escalation-level
   *   template for the anchor invoice
   * - delivers via the requested channel(s) and records a Reminder row
   *
   * @param params.tenantId - Tenant ID (multi-tenant isolation)
   * @param params.parentIds - Parents to remind
   * @param params.channel - EMAIL, WHATSAPP, or BOTH
   * @param params.template - Optional custom message body from the caller
   * @returns True per-parent and per-channel sent/failed/skipped counts
   */
  async sendManualParentReminders(params: {
    tenantId: string;
    parentIds: string[];
    channel: DeliveryChannel;
    template?: string;
  }): Promise<ManualReminderResult> {
    const { tenantId, parentIds, channel, template } = params;

    this.logger.log(
      `Manual reminder send for ${parentIds.length} parent(s) via ${channel} (tenant: ${tenantId})`,
    );

    const result: ManualReminderResult = {
      sent: 0,
      failed: 0,
      skipped: 0,
      byChannel: {
        email: { sent: 0, failed: 0 },
        whatsapp: { sent: 0, failed: 0 },
      },
      details: [],
    };

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, tradingName: true },
    });

    if (!tenant) {
      this.logger.error(`Tenant ${tenantId} not found for manual reminders`);
      throw new NotFoundException('Tenant', tenantId);
    }

    const crecheName = tenant.tradingName ?? tenant.name;
    const useEmail =
      channel === DeliveryChannel.EMAIL || channel === DeliveryChannel.BOTH;
    const useWhatsApp =
      channel === DeliveryChannel.WHATSAPP || channel === DeliveryChannel.BOTH;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const parentId of parentIds) {
      try {
        const parent = await this.parentRepo.findById(parentId, tenantId);
        if (!parent) {
          result.skipped++;
          result.details.push({
            parentId,
            status: 'SKIPPED',
            error: 'Parent not found',
          });
          continue;
        }

        // Overdue unpaid invoices — oldest is the anchor for the record
        const overdueInvoices = await this.prisma.invoice.findMany({
          where: {
            tenantId,
            parentId,
            isDeleted: false,
            dueDate: { lt: today },
            status: { in: ['SENT', 'VIEWED', 'PARTIALLY_PAID', 'OVERDUE'] },
          },
          orderBy: { dueDate: 'asc' },
        });
        const unpaidInvoices = overdueInvoices.filter(
          (inv) => inv.amountPaidCents < inv.totalCents,
        );

        if (unpaidInvoices.length === 0) {
          result.skipped++;
          result.details.push({
            parentId,
            status: 'SKIPPED',
            error: 'No overdue invoices',
          });
          continue;
        }

        const anchorInvoice = unpaidInvoices[0];
        const daysOverdue = this.calculateDaysOverdue(anchorInvoice.dueDate);
        const escalationLevel = this.determineEscalationLevel(daysOverdue);

        // Build content: caller's template (with placeholder substitution
        // re-applied for robustness) or the escalation-level default.
        let subject: string;
        let body: string;

        if (template && template.trim().length > 0) {
          const parentName =
            `${parent.firstName} ${parent.lastName}`.trim() || 'Parent';
          body = template
            .replaceAll('[Parent Name]', parentName)
            .replaceAll('[Creche Name]', crecheName);
          subject = `Payment Reminder - ${crecheName}`;
        } else {
          const content = await this.generateReminderContent(
            anchorInvoice.id,
            escalationLevel,
            tenantId,
          );
          subject = content.subject;
          body = content.body;
        }

        // Deliver via requested channel(s)
        let emailResult: {
          success: boolean;
          messageId?: string;
          error?: string;
        } | null = null;
        let whatsappResult: {
          success: boolean;
          messageId?: string;
          error?: string;
        } | null = null;

        if (useEmail) {
          emailResult = await this.sendViaEmail(parent.email, {
            subject,
            body,
            escalationLevel,
            invoiceNumber: anchorInvoice.invoiceNumber,
            outstandingCents:
              anchorInvoice.totalCents - anchorInvoice.amountPaidCents,
            daysOverdue,
          });
          if (emailResult.success) {
            result.byChannel.email.sent++;
          } else {
            result.byChannel.email.failed++;
          }
        }

        if (useWhatsApp) {
          // Manual sends deliver the operator's message verbatim — do NOT
          // route through the escalation WhatsApp templates.
          whatsappResult = await this.sendManualWhatsAppMessage(
            parent.whatsapp,
            body,
          );
          if (whatsappResult.success) {
            result.byChannel.whatsapp.sent++;
          } else {
            result.byChannel.whatsapp.failed++;
          }
        }

        const anySuccess =
          emailResult?.success === true || whatsappResult?.success === true;

        // Record the reminder against the anchor invoice
        const reminderData: CreateReminderData = {
          tenantId,
          invoiceId: anchorInvoice.id,
          parentId,
          escalationLevel,
          deliveryMethod: channel,
          reminderStatus: anySuccess
            ? ReminderStatus.SENT
            : ReminderStatus.FAILED,
          sentAt: anySuccess ? new Date() : undefined,
          content: body,
          subject,
          failureReason: !anySuccess
            ? (emailResult?.error ?? whatsappResult?.error)
            : undefined,
        };
        await this.reminderRepo.create(reminderData);

        if (anySuccess) {
          result.sent++;
          result.details.push({
            parentId,
            status: 'SENT',
            invoiceId: anchorInvoice.id,
          });
        } else {
          result.failed++;
          result.details.push({
            parentId,
            status: 'FAILED',
            invoiceId: anchorInvoice.id,
            error: emailResult?.error ?? whatsappResult?.error,
          });
        }
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Manual reminder failed for parent ${parentId}: ${errorMessage}`,
          error instanceof Error ? error.stack : String(error),
        );
        result.failed++;
        result.details.push({
          parentId,
          status: 'FAILED',
          error: errorMessage,
        });
      }
    }

    this.logger.log(
      `Manual reminder batch complete: ${result.sent} sent, ${result.failed} failed, ${result.skipped} skipped ` +
        `(email ${result.byChannel.email.sent}/${result.byChannel.email.sent + result.byChannel.email.failed}, ` +
        `whatsapp ${result.byChannel.whatsapp.sent}/${result.byChannel.whatsapp.sent + result.byChannel.whatsapp.failed})`,
    );

    return result;
  }

  /**
   * Send a verbatim WhatsApp message for manual reminders
   *
   * @param parentPhone - Parent's WhatsApp number (may be null)
   * @param body - Resolved message body to send as-is
   * @returns Success status with message ID or error
   */
  private async sendManualWhatsAppMessage(
    parentPhone: string | null,
    body: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!parentPhone) {
      return {
        success: false,
        error: 'Parent has no WhatsApp number configured',
      };
    }

    try {
      const result = await this.whatsAppService.sendMessage(parentPhone, body);
      if (!result.success) {
        return {
          success: false,
          error: result.error ?? 'WhatsApp send failed',
        };
      }
      return { success: true, messageId: result.messageId };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `WhatsApp send failed to ${parentPhone}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Generate reminder content based on escalation level
   *
   * Fetches invoice with all relations and uses template system to generate
   * personalized reminder content with proper ZAR formatting.
   *
   * @param invoiceId - Invoice to generate content for
   * @param escalationLevel - Tone/severity level (FRIENDLY, FIRM, FINAL)
   * @param tenantId - Tenant ID for isolation
   * @returns Rendered reminder content with all placeholders filled
   * @throws NotFoundException if invoice doesn't exist
   */
  async generateReminderContent(
    invoiceId: string,
    escalationLevel: EscalationLevel,
    tenantId: string,
  ): Promise<ReminderContent> {
    try {
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: invoiceId, tenantId },
        include: { parent: true, child: true, tenant: true },
      });

      if (!invoice) {
        this.logger.error(
          `Invoice ${invoiceId} not found for content generation`,
        );
        throw new NotFoundException('Invoice', invoiceId);
      }

      const outstandingCents = invoice.totalCents - invoice.amountPaidCents;
      const daysOverdue = this.calculateDaysOverdue(invoice.dueDate);

      const values = {
        parentName: invoice.parent.firstName,
        childName: invoice.child.firstName,
        invoiceNumber: invoice.invoiceNumber,
        amount: this.formatCentsToRand(outstandingCents),
        dueDate: this.formatDate(invoice.dueDate),
        daysOverdue: daysOverdue.toString(),
        crecheName: invoice.tenant.name,
        crechePhone: invoice.tenant.phone ?? '',
        crecheEmail: invoice.tenant.email ?? '',
        // TODO: Add bank details to Tenant model when available
        bankName: '',
        accountNumber: '',
        branchCode: '',
      };

      // Resolve the tenant's override (or fall through to the coded default)
      // for this escalation level, then substitute placeholders.
      const templateKey =
        ReminderService.TEMPLATE_KEY_BY_LEVEL[escalationLevel];
      const rendered = await this.templateResolver.resolveAndRender(
        tenantId,
        templateKey,
        'EMAIL',
        values,
      );
      if (!rendered || !rendered.subject) {
        throw new BusinessException(
          `No email template resolved for escalation level ${escalationLevel}`,
          'TEMPLATE_NOT_FOUND',
        );
      }

      return {
        subject: rendered.subject,
        body: rendered.body,
        escalationLevel,
        invoiceNumber: invoice.invoiceNumber,
        outstandingCents,
        daysOverdue,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to generate reminder content for invoice ${invoiceId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Schedule a reminder for future delivery
   *
   * Creates a PENDING reminder that can be processed by a scheduled job.
   *
   * @param dto - Contains invoiceId, sendDate, and delivery channel
   * @param tenantId - Tenant ID for isolation
   * @returns Reminder ID and scheduled date
   * @throws NotFoundException if invoice doesn't exist
   * @throws BusinessException if sendDate is in the past
   */
  async scheduleReminder(
    dto: ScheduleReminderDto,
    tenantId: string,
  ): Promise<{ reminderId: string; scheduledFor: Date }> {
    try {
      const invoice = await this.invoiceRepo.findById(dto.invoiceId, tenantId);
      if (!invoice) {
        this.logger.error(
          `Invoice ${dto.invoiceId} not found for scheduling reminder`,
        );
        throw new NotFoundException('Invoice', dto.invoiceId);
      }

      if (dto.sendDate <= new Date()) {
        this.logger.error(
          `Cannot schedule reminder for past date: ${dto.sendDate.toISOString()}`,
        );
        throw new BusinessException(
          'Schedule date must be in the future',
          'INVALID_SCHEDULE_DATE',
        );
      }

      const daysOverdue = this.calculateDaysOverdue(invoice.dueDate);
      const escalationLevel = this.determineEscalationLevel(daysOverdue);

      const reminderData: CreateReminderData = {
        tenantId,
        invoiceId: dto.invoiceId,
        parentId: invoice.parentId,
        escalationLevel,
        deliveryMethod: dto.channel,
        reminderStatus: ReminderStatus.PENDING,
        scheduledFor: dto.sendDate,
        content: '', // Generated at send time
        subject: '',
      };

      const reminder = await this.reminderRepo.create(reminderData);

      this.logger.log(
        `Reminder scheduled for invoice ${invoice.invoiceNumber} on ${dto.sendDate.toISOString()}`,
      );

      return {
        reminderId: reminder.id,
        scheduledFor: reminder.scheduledFor!,
      };
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BusinessException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to schedule reminder for invoice ${dto.invoiceId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Process all overdue invoices and send escalated reminders
   *
   * Uses ArrearsService to get overdue invoices and sends reminders
   * based on escalation rules, respecting duplicate prevention.
   *
   * @param tenantId - Tenant ID for isolation
   * @returns Breakdown by escalation level and overall stats
   */
  async escalateOverdue(tenantId: string): Promise<EscalationResult> {
    this.logger.log(`Processing overdue escalation for tenant ${tenantId}`);

    const result: EscalationResult = {
      friendly: 0,
      firm: 0,
      final: 0,
      totalProcessed: 0,
      totalSent: 0,
      totalSkipped: 0,
      details: [],
    };

    try {
      // Use ArrearsService to get overdue invoices
      const arrearsReport =
        await this.arrearsService.getArrearsReport(tenantId);

      for (const arrearsInvoice of arrearsReport.invoices) {
        result.totalProcessed++;

        const escalationLevel = this.determineEscalationLevel(
          arrearsInvoice.daysOverdue,
        );

        // Check for recent reminder
        if (await this.hasRecentReminder(arrearsInvoice.invoiceId, tenantId)) {
          result.totalSkipped++;
          continue;
        }

        // Send reminder
        const sendResult = await this.sendReminders(
          [arrearsInvoice.invoiceId],
          undefined,
          tenantId,
        );

        if (sendResult.sent > 0) {
          result.totalSent++;
          switch (escalationLevel) {
            case EscalationLevel.FRIENDLY:
              result.friendly++;
              break;
            case EscalationLevel.FIRM:
              result.firm++;
              break;
            case EscalationLevel.FINAL:
              result.final++;
              break;
          }
          // Add details from sendResult
          result.details.push(...sendResult.details);
        } else {
          result.totalSkipped++;
        }
      }

      this.logger.log(
        `Escalation complete: ${result.totalSent} sent (${result.friendly} friendly, ${result.firm} firm, ${result.final} final), ${result.totalSkipped} skipped`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to process overdue escalation for tenant ${tenantId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Get reminder history for a parent
   *
   * Returns all reminders sent to a specific parent, ordered by date.
   *
   * @param parentId - Parent UUID
   * @param tenantId - Tenant ID for isolation
   * @returns Array of reminder history entries
   * @throws NotFoundException if parent doesn't exist
   */
  async getReminderHistory(
    parentId: string,
    tenantId: string,
  ): Promise<ReminderHistoryEntry[]> {
    try {
      const parent = await this.parentRepo.findById(parentId, tenantId);
      if (!parent) {
        this.logger.error(`Parent ${parentId} not found for reminder history`);
        throw new NotFoundException('Parent', parentId);
      }

      const reminders = await this.prisma.reminder.findMany({
        where: { parentId, tenantId },
        include: { invoice: true },
        orderBy: { createdAt: 'desc' },
      });

      return reminders.map((r) => ({
        reminderId: r.id,
        invoiceId: r.invoiceId,
        invoiceNumber: r.invoice.invoiceNumber,
        sentAt: r.sentAt ?? new Date(),
        escalationLevel: r.escalationLevel as EscalationLevel,
        deliveryChannel: r.deliveryMethod as DeliveryChannel,
        reminderStatus: r.reminderStatus as ReminderStatus,
        outstandingCents: r.invoice.totalCents - r.invoice.amountPaidCents,
      }));
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to get reminder history for parent ${parentId}`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }

  /**
   * Determine escalation level based on days overdue
   *
   * Escalation rules:
   * - FRIENDLY: 1-7 days overdue (gentle reminder)
   * - FIRM: 8-14 days overdue (stronger tone)
   * - FINAL: 15+ days overdue (serious consequences)
   *
   * @param daysOverdue - Number of days past due date
   * @returns Appropriate escalation level
   */
  private determineEscalationLevel(daysOverdue: number): EscalationLevel {
    if (daysOverdue <= 7) {
      return EscalationLevel.FRIENDLY;
    } else if (daysOverdue <= 14) {
      return EscalationLevel.FIRM;
    } else {
      return EscalationLevel.FINAL;
    }
  }

  /**
   * Check if invoice has recent reminder (within MIN_DAYS_BETWEEN_REMINDERS)
   *
   * Duplicate prevention: prevents sending multiple reminders for same invoice
   * within the minimum timeframe to avoid harassment.
   *
   * @param invoiceId - Invoice to check
   * @param tenantId - Tenant ID for isolation
   * @returns True if recent reminder exists
   */
  private async hasRecentReminder(
    invoiceId: string,
    tenantId: string,
  ): Promise<boolean> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - MIN_DAYS_BETWEEN_REMINDERS);

    const recentReminders = await this.reminderRepo.findRecentForInvoice(
      invoiceId,
      tenantId,
      cutoffDate,
    );

    return recentReminders.length > 0;
  }

  /**
   * Send reminder via email
   *
   * @param parentEmail - Parent's email address (may be null)
   * @param content - Generated reminder content
   * @returns Success status with message ID or error
   */
  private async sendViaEmail(
    parentEmail: string | null,
    content: ReminderContent,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!parentEmail) {
      return {
        success: false,
        error: 'Parent has no email address configured',
      };
    }

    try {
      const result = await this.emailService.sendEmail(
        parentEmail,
        content.subject,
        content.body,
      );
      return { success: true, messageId: result.messageId };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Email send failed to ${parentEmail}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Send reminder via WhatsApp
   *
   * @param parentPhone - Parent's WhatsApp number (may be null)
   * @param content - Generated reminder content
   * @returns Success status with message ID or error
   */
  private async sendViaWhatsApp(
    parentPhone: string | null,
    content: ReminderContent,
    tenantId: string,
  ): Promise<{ success: boolean; messageId?: string; error?: string }> {
    if (!parentPhone) {
      return {
        success: false,
        error: 'Parent has no WhatsApp number configured',
      };
    }

    try {
      // Recover the values used for the email template from the ReminderContent
      // (still regex-based for backwards compatibility with pre-template callers)
      // and pass them to the resolver so the tenant's WHATSAPP override — or the
      // coded default — renders with the same substitutions.
      const parentNameMatch = content.body.match(/Dear ([^,]+)/);
      const childNameMatch = content.body.match(/for ([^']+)'s/);
      const crecheNameMatch = content.body.match(/([^\n]+)$/);

      const templateKey =
        ReminderService.TEMPLATE_KEY_BY_LEVEL[content.escalationLevel];
      const rendered = await this.templateResolver.resolveAndRender(
        tenantId,
        templateKey,
        'WHATSAPP',
        {
          parentName: parentNameMatch?.[1] ?? 'Parent',
          childName: childNameMatch?.[1] ?? 'your child',
          invoiceNumber: content.invoiceNumber,
          amount: this.formatCentsToRand(content.outstandingCents),
          daysOverdue: content.daysOverdue.toString(),
          dueDate: '', // Would need to pass this separately
          crecheName: crecheNameMatch?.[1] ?? '',
          crechePhone: '',
          crecheEmail: '',
          bankName: '',
          accountNumber: '',
          branchCode: '',
        },
      );
      if (!rendered) {
        return {
          success: false,
          error: `No WhatsApp template for escalation level ${content.escalationLevel}`,
        };
      }

      const result = await this.whatsAppService.sendMessage(
        parentPhone,
        rendered.body,
      );
      if (!result.success) {
        throw new Error(result.error ?? 'WhatsApp send failed');
      }
      return { success: true, messageId: result.messageId };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `WhatsApp send failed to ${parentPhone}: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Format cents to Rand string (e.g., 150000 -> "R1,500.00")
   *
   * South African currency formatting with comma thousands separator.
   *
   * @param cents - Amount in cents (integer)
   * @returns Formatted ZAR string
   */
  private formatCentsToRand(cents: number): string {
    const rands = cents / 100;
    return `R${rands.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  /**
   * Calculate number of days overdue for an invoice
   *
   * @param dueDate - Invoice due date
   * @returns Days overdue (0 if not yet due, positive if overdue)
   */
  private calculateDaysOverdue(dueDate: Date): number {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(dueDate);
    due.setHours(0, 0, 0, 0);

    const diffTime = today.getTime() - due.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return Math.max(0, diffDays);
  }

  /**
   * Map parent's PreferredContact to DeliveryChannel
   *
   * @param preferredContact - Parent's preferred contact method
   * @returns Corresponding delivery channel
   */
  private mapPreferredContactToChannel(
    preferredContact: PreferredContact,
  ): DeliveryChannel {
    switch (preferredContact) {
      case PreferredContact.EMAIL:
        return DeliveryChannel.EMAIL;
      case PreferredContact.WHATSAPP:
        return DeliveryChannel.WHATSAPP;
      case PreferredContact.BOTH:
        return DeliveryChannel.BOTH;
    }
    // Exhaustive switch - TypeScript will error if a case is missing
    const exhaustiveCheck: never = preferredContact;
    throw new BusinessException(
      `Unknown preferred contact method: ${String(exhaustiveCheck)}`,
      'INVALID_PREFERRED_CONTACT',
    );
  }

  /**
   * Format date to readable South African format
   *
   * @param date - Date to format
   * @returns Formatted date string (e.g., "15 January 2025")
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }
}
