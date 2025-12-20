/**
 * Invoice Delivery Service
 * TASK-BILL-013: Invoice Delivery Service
 *
 * @module database/services/invoice-delivery
 * @description Delivers invoices via email and WhatsApp.
 * Maps parent's PreferredContact to delivery channel.
 * Tracks delivery attempts with audit logging.
 *
 * CRITICAL: Fail-fast with detailed error logging.
 * CRITICAL: All operations must filter by tenantId for multi-tenant isolation.
 * CRITICAL: No workarounds or fallbacks - fail with BusinessException.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Invoice } from '@prisma/client';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { InvoiceLineRepository } from '../repositories/invoice-line.repository';
import { ParentRepository } from '../repositories/parent.repository';
import { AuditLogService } from './audit-log.service';
import { EmailService } from '../../integrations/email/email.service';
import { WhatsAppService } from '../../integrations/whatsapp/whatsapp.service';
import {
  DeliveryResult,
  SendInvoicesDto,
  RetryFailedDto,
} from '../dto/invoice-delivery.dto';
import { DeliveryMethod, DeliveryStatus } from '../entities/invoice.entity';
import { PreferredContact } from '../entities/parent.entity';
import { AuditAction } from '../entities/audit-log.entity';
import { NotFoundException, BusinessException } from '../../shared/exceptions';

/** Maximum delivery retry attempts */
const MAX_RETRY_COUNT = 3;

/** Default max age for retrying failed deliveries (24 hours) */
const DEFAULT_MAX_AGE_HOURS = 24;

@Injectable()
export class InvoiceDeliveryService {
  private readonly logger = new Logger(InvoiceDeliveryService.name);

  constructor(
    private readonly invoiceRepo: InvoiceRepository,
    private readonly invoiceLineRepo: InvoiceLineRepository,
    private readonly parentRepo: ParentRepository,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  /**
   * Send invoices to parents via their preferred contact method
   *
   * @param dto - Contains tenantId, invoiceIds, optional method override
   * @returns Summary of sent/failed deliveries
   */
  async sendInvoices(dto: SendInvoicesDto): Promise<DeliveryResult> {
    this.logger.log(
      `Sending ${dto.invoiceIds.length} invoices for tenant ${dto.tenantId}`,
    );

    const result: DeliveryResult = {
      sent: 0,
      failed: 0,
      failures: [],
    };

    if (dto.invoiceIds.length === 0) {
      return result;
    }

    for (const invoiceId of dto.invoiceIds) {
      try {
        await this.deliverInvoice(dto.tenantId, invoiceId, dto.method);
        result.sent++;
      } catch (error) {
        result.failed++;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorCode =
          error instanceof BusinessException
            ? error.code
            : error instanceof NotFoundException
              ? 'NOT_FOUND'
              : 'DELIVERY_ERROR';

        result.failures.push({
          invoiceId,
          reason: errorMessage,
          code: errorCode,
        });

        this.logger.error(
          `Failed to deliver invoice ${invoiceId}: ${errorMessage}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    this.logger.log(
      `Invoice delivery complete: ${result.sent} sent, ${result.failed} failed`,
    );

    return result;
  }

  /**
   * Deliver a single invoice to the parent
   *
   * @param tenantId - Tenant ID for isolation
   * @param invoiceId - Invoice to deliver
   * @param methodOverride - Optional override for delivery method
   * @throws NotFoundException if invoice or parent not found
   * @throws BusinessException if delivery fails
   */
  async deliverInvoice(
    tenantId: string,
    invoiceId: string,
    methodOverride?: DeliveryMethod,
  ): Promise<void> {
    // Load invoice
    const invoice = await this.invoiceRepo.findById(invoiceId);
    if (!invoice) {
      throw new NotFoundException('Invoice', invoiceId);
    }

    // Verify tenant isolation
    if (invoice.tenantId !== tenantId) {
      throw new NotFoundException('Invoice', invoiceId);
    }

    // CRITICAL: Validate invoice status is DRAFT before sending (REQ-BILL-013)
    if (invoice.status !== 'DRAFT') {
      throw new BusinessException(
        `Invoice ${invoice.invoiceNumber} cannot be sent: status is ${invoice.status}, expected DRAFT`,
        'INVALID_INVOICE_STATUS',
        { invoiceId, currentStatus: invoice.status, expectedStatus: 'DRAFT' },
      );
    }

    // Load parent
    const parent = await this.parentRepo.findById(invoice.parentId);
    if (!parent) {
      throw new NotFoundException('Parent', invoice.parentId);
    }

    // Determine delivery method
    const method =
      methodOverride ??
      this.mapPreferredContactToMethod(
        parent.preferredContact as PreferredContact,
      );

    // Get invoice lines for email body
    const lines = await this.invoiceLineRepo.findByInvoice(invoiceId);

    // Build message content
    const subject = `Invoice ${invoice.invoiceNumber}`;
    const body = this.buildInvoiceMessage(invoice, lines);

    // Track channel success/failure
    let emailSucceeded = false;
    let whatsAppSucceeded = false;
    let lastError: Error | null = null;

    // Deliver via email
    if (method === DeliveryMethod.EMAIL || method === DeliveryMethod.BOTH) {
      if (!parent.email) {
        throw new BusinessException(
          `Parent ${parent.id} has no email address configured`,
          'NO_EMAIL_ADDRESS',
        );
      }

      try {
        await this.emailService.sendEmail(parent.email, subject, body);
        emailSucceeded = true;
        this.logger.log(
          `Email sent for invoice ${invoice.invoiceNumber} to ${parent.email}`,
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `Email failed for invoice ${invoice.invoiceNumber}: ${lastError.message}`,
        );

        // If method is EMAIL only, track failure and throw
        if (method === DeliveryMethod.EMAIL) {
          await this.trackDeliveryFailure(invoice, 'EMAIL', lastError.message);
          throw error;
        }
      }
    }

    // Deliver via WhatsApp
    if (method === DeliveryMethod.WHATSAPP || method === DeliveryMethod.BOTH) {
      if (!parent.whatsapp) {
        throw new BusinessException(
          `Parent ${parent.id} has no WhatsApp number configured`,
          'NO_WHATSAPP_NUMBER',
        );
      }

      try {
        await this.whatsAppService.sendMessage(parent.whatsapp, body);
        whatsAppSucceeded = true;
        this.logger.log(
          `WhatsApp sent for invoice ${invoice.invoiceNumber} to ${parent.whatsapp}`,
        );
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.error(
          `WhatsApp failed for invoice ${invoice.invoiceNumber}: ${lastError.message}`,
        );

        // If method is WHATSAPP only, track failure and throw
        if (method === DeliveryMethod.WHATSAPP) {
          await this.trackDeliveryFailure(
            invoice,
            'WHATSAPP',
            lastError.message,
          );
          throw error;
        }
      }
    }

    // Update final delivery status based on outcomes
    if (emailSucceeded || whatsAppSucceeded) {
      // At least one channel succeeded
      const successChannel = emailSucceeded ? 'EMAIL' : 'WHATSAPP';
      await this.trackDeliverySuccess(invoice, successChannel);
    } else if (lastError) {
      // All channels failed (only possible for BOTH)
      await this.trackDeliveryFailure(invoice, 'EMAIL', lastError.message);
      throw lastError;
    }
  }

  /**
   * Retry failed invoice deliveries
   *
   * @param dto - Contains tenantId and optional maxAgeHours
   * @returns Summary of retry results
   */
  async retryFailed(dto: RetryFailedDto): Promise<DeliveryResult> {
    const maxAgeHours = dto.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;
    const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    this.logger.log(
      `Retrying failed deliveries for tenant ${dto.tenantId} since ${cutoffDate.toISOString()}`,
    );

    // Get failed invoices
    const failedInvoices = await this.invoiceRepo.findByDeliveryStatus(
      dto.tenantId,
      'FAILED',
      cutoffDate,
    );

    const result: DeliveryResult = {
      sent: 0,
      failed: 0,
      failures: [],
    };

    for (const invoice of failedInvoices) {
      // Check retry count
      if (invoice.deliveryRetryCount >= MAX_RETRY_COUNT) {
        result.failures.push({
          invoiceId: invoice.id,
          reason: `Max retry count (${MAX_RETRY_COUNT}) exceeded`,
          code: 'MAX_RETRIES_EXCEEDED',
        });
        result.failed++;
        continue;
      }

      // Increment retry count
      await this.invoiceRepo.incrementDeliveryRetryCount(invoice.id);

      try {
        // Retry delivery using invoice's configured method
        await this.deliverInvoice(
          dto.tenantId,
          invoice.id,
          invoice.deliveryMethod as DeliveryMethod | undefined,
        );
        result.sent++;
      } catch (error) {
        result.failed++;
        const errorMessage =
          error instanceof Error ? error.message : String(error);

        result.failures.push({
          invoiceId: invoice.id,
          reason: errorMessage,
          code:
            error instanceof BusinessException ? error.code : 'RETRY_FAILED',
        });

        this.logger.error(
          `Retry failed for invoice ${invoice.id}: ${errorMessage}`,
        );
      }
    }

    this.logger.log(
      `Retry complete: ${result.sent} sent, ${result.failed} failed out of ${failedInvoices.length} invoices`,
    );

    return result;
  }

  /**
   * Map parent's PreferredContact to DeliveryMethod
   */
  private mapPreferredContactToMethod(
    preferredContact: PreferredContact,
  ): DeliveryMethod {
    switch (preferredContact) {
      case PreferredContact.EMAIL:
        return DeliveryMethod.EMAIL;
      case PreferredContact.WHATSAPP:
        return DeliveryMethod.WHATSAPP;
      case PreferredContact.BOTH:
        return DeliveryMethod.BOTH;
    }
    // Exhaustive switch - TypeScript will error if a case is missing
    // This line is unreachable but satisfies return type requirement
    const exhaustiveCheck: never = preferredContact;
    throw new BusinessException(
      `Unknown preferred contact method: ${String(exhaustiveCheck)}`,
      'INVALID_PREFERRED_CONTACT',
    );
  }

  /**
   * Build invoice message body
   */
  private buildInvoiceMessage(
    invoice: Invoice,
    lines: Array<{ description: string; totalCents: number }>,
  ): string {
    const formatAmount = (cents: number) => `R ${(cents / 100).toFixed(2)}`;

    const lineItems = lines
      .map(
        (line) => `  - ${line.description}: ${formatAmount(line.totalCents)}`,
      )
      .join('\n');

    return `
Invoice: ${invoice.invoiceNumber}

Billing Period: ${invoice.billingPeriodStart.toLocaleDateString()} - ${invoice.billingPeriodEnd.toLocaleDateString()}
Issue Date: ${invoice.issueDate.toLocaleDateString()}
Due Date: ${invoice.dueDate.toLocaleDateString()}

Line Items:
${lineItems}

Subtotal: ${formatAmount(invoice.subtotalCents)}
VAT: ${formatAmount(invoice.vatCents)}
Total Due: ${formatAmount(invoice.totalCents)}

Please ensure payment is made by the due date.
    `.trim();
  }

  /**
   * Track successful delivery
   */
  private async trackDeliverySuccess(
    invoice: Invoice,
    channel: 'EMAIL' | 'WHATSAPP',
  ): Promise<void> {
    await this.invoiceRepo.update(invoice.id, {
      deliveryStatus: DeliveryStatus.SENT,
      deliveryMethod:
        channel === 'EMAIL' ? DeliveryMethod.EMAIL : DeliveryMethod.WHATSAPP,
      deliveredAt: new Date(),
    });

    await this.auditLogService.logAction({
      tenantId: invoice.tenantId,
      entityType: 'Invoice',
      entityId: invoice.id,
      action: AuditAction.UPDATE,
      afterValue: {
        deliveryChannel: channel,
        deliveryStatus: DeliveryStatus.SENT,
        deliveredAt: new Date().toISOString(),
      },
      changeSummary: `Invoice ${invoice.invoiceNumber} delivered via ${channel}`,
    });
  }

  /**
   * Track failed delivery
   */
  private async trackDeliveryFailure(
    invoice: Invoice,
    channel: 'EMAIL' | 'WHATSAPP',
    errorMessage: string,
  ): Promise<void> {
    await this.invoiceRepo.update(invoice.id, {
      deliveryStatus: DeliveryStatus.FAILED,
    });

    await this.auditLogService.logAction({
      tenantId: invoice.tenantId,
      entityType: 'Invoice',
      entityId: invoice.id,
      action: AuditAction.UPDATE,
      afterValue: {
        deliveryChannel: channel,
        deliveryStatus: DeliveryStatus.FAILED,
        error: errorMessage,
        attemptedAt: new Date().toISOString(),
      },
      changeSummary: `Invoice ${invoice.invoiceNumber} delivery failed via ${channel}: ${errorMessage}`,
    });
  }
}
