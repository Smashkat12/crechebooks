/**
 * Invoice Delivery Service
 * TASK-BILL-013: Invoice Delivery Service
 * TASK-BILL-042: Email Templates and PDF Attachments
 *
 * @module database/services/invoice-delivery
 * @description Delivers invoices via email and WhatsApp.
 * Maps parent's PreferredContact to delivery channel.
 * Tracks delivery attempts with audit logging.
 *
 * Email delivery includes:
 * - HTML-formatted email using EmailTemplateService
 * - PDF invoice attachment using InvoicePdfService
 *
 * CRITICAL: Fail-fast with detailed error logging.
 * CRITICAL: All operations must filter by tenantId for multi-tenant isolation.
 * CRITICAL: No workarounds or fallbacks - fail with BusinessException.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { Invoice } from '@prisma/client';
import { InvoiceRepository } from '../repositories/invoice.repository';
import { InvoiceLineRepository } from '../repositories/invoice-line.repository';
import { ParentRepository } from '../repositories/parent.repository';
import { TenantRepository } from '../repositories/tenant.repository';
import { ChildRepository } from '../repositories/child.repository';
import { AuditLogService } from './audit-log.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { EmailService } from '../../integrations/email/email.service';
import { WhatsAppService } from '../../integrations/whatsapp/whatsapp.service';
import { WhatsAppProviderService } from '../../integrations/whatsapp/services/whatsapp-provider.service';
import {
  EmailTemplateService,
  InvoiceEmailData,
} from '../../common/services/email-template/email-template.service';
import {
  DeliveryResult,
  SendInvoicesDto,
  RetryFailedDto,
} from '../dto/invoice-delivery.dto';
import {
  DeliveryMethod,
  DeliveryStatus,
  InvoiceStatus,
} from '../entities/invoice.entity';
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
    private readonly tenantRepo: TenantRepository,
    private readonly childRepo: ChildRepository,
    private readonly auditLogService: AuditLogService,
    private readonly emailService: EmailService,
    private readonly whatsAppService: WhatsAppService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly invoicePdfService: InvoicePdfService,
    // TASK-WA-007: WhatsApp provider service for Twilio/Meta routing
    @Optional()
    private readonly whatsAppProviderService?: WhatsAppProviderService,
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
        await this.deliverInvoice(dto.tenantId!, invoiceId, dto.method);
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
   * TASK-BILL-042: Enhanced delivery with HTML templates and PDF attachments
   * - Email: HTML-formatted email using EmailTemplateService + PDF attachment
   * - WhatsApp: Plain text message (PDF not supported)
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
    const invoice = await this.invoiceRepo.findById(invoiceId, tenantId);
    if (!invoice) {
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
    const parent = await this.parentRepo.findById(invoice.parentId, tenantId);
    if (!parent) {
      throw new NotFoundException('Parent', invoice.parentId);
    }

    // Load tenant for branding
    const tenant = await this.tenantRepo.findById(tenantId);
    if (!tenant) {
      throw new NotFoundException('Tenant', tenantId);
    }

    // Load child for payment reference
    const child = await this.childRepo.findById(invoice.childId, tenantId);
    if (!child) {
      throw new NotFoundException('Child', invoice.childId);
    }
    const childName = `${child.firstName} ${child.lastName}`;

    // Determine delivery method
    const method =
      methodOverride ??
      this.mapPreferredContactToMethod(
        parent.preferredContact as PreferredContact,
      );

    // Get invoice lines for email body
    const lines = await this.invoiceLineRepo.findByInvoice(invoiceId);

    // Track channel success/failure
    let emailSucceeded = false;
    let whatsAppSucceeded = false;
    let lastError: Error | null = null;

    // Deliver via email with HTML template and PDF attachment
    if (method === DeliveryMethod.EMAIL || method === DeliveryMethod.BOTH) {
      if (!parent.email) {
        throw new BusinessException(
          `Parent ${parent.id} has no email address configured`,
          'NO_EMAIL_ADDRESS',
        );
      }

      try {
        // TASK-BILL-042: Generate HTML email using template service
        // TASK-BILL-043: Include bank details for payment instructions
        const templateData: InvoiceEmailData = {
          // Tenant branding
          tenantName: tenant.tradingName ?? tenant.name,
          supportEmail: tenant.email,
          supportPhone: tenant.phone,
          // TASK-BILL-043: Bank details for payment instructions
          bankName: tenant.bankName ?? undefined,
          bankAccountHolder:
            tenant.bankAccountHolder ?? tenant.tradingName ?? tenant.name,
          bankAccountNumber: tenant.bankAccountNumber ?? undefined,
          bankBranchCode: tenant.bankBranchCode ?? undefined,
          bankAccountType: tenant.bankAccountType ?? undefined,
          bankSwiftCode: tenant.bankSwiftCode ?? undefined,
          // Recipient
          recipientName: `${parent.firstName} ${parent.lastName}`,
          // Invoice details
          invoiceNumber: invoice.invoiceNumber,
          invoiceDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          billingPeriodStart: invoice.billingPeriodStart,
          billingPeriodEnd: invoice.billingPeriodEnd,
          subtotalCents: invoice.subtotalCents,
          vatCents: invoice.vatCents,
          totalCents: invoice.totalCents,
          // Line items
          lineItems: lines.map((line) => ({
            description: line.description,
            quantity:
              typeof line.quantity === 'number'
                ? line.quantity
                : line.quantity.toNumber(),
            unitPriceCents: line.unitPriceCents,
            totalCents: line.totalCents,
          })),
          // Child name for payment reference
          childName,
        };

        const { text, html, subject } =
          this.emailTemplateService.renderInvoiceEmail(templateData);

        this.logger.log(
          `TASK-BILL-042: Rendered HTML template for invoice ${invoice.invoiceNumber}`,
        );

        // TASK-BILL-042: Generate PDF attachment
        const pdfBuffer = await this.invoicePdfService.generatePdf(
          tenantId,
          invoiceId,
        );

        this.logger.log(
          `TASK-BILL-042: Generated PDF (${pdfBuffer.length} bytes) for invoice ${invoice.invoiceNumber}`,
        );

        // Send email with HTML body and PDF attachment
        // Include custom variables for Mailgun webhook correlation
        const emailResult = await this.emailService.sendEmailWithOptions({
          to: parent.email,
          subject,
          body: text, // Plain text fallback
          html, // HTML body
          attachments: [
            {
              filename: `${invoice.invoiceNumber}.pdf`,
              content: pdfBuffer,
              contentType: 'application/pdf',
            },
          ],
          tags: ['invoice', `tenant-${tenantId}`],
          trackOpens: true,
          trackClicks: true,
          customVariables: {
            invoiceId: invoice.id,
            tenantId: invoice.tenantId,
            documentType: 'invoice',
            invoiceNumber: invoice.invoiceNumber,
          },
        });

        this.logger.log(
          `TASK-BILL-035: Email sent with messageId ${emailResult.messageId} for webhook tracking`,
        );

        emailSucceeded = true;
        this.logger.log(
          `TASK-BILL-042: Email sent for invoice ${invoice.invoiceNumber} to ${parent.email} with HTML template and PDF attachment`,
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
    // TASK-WA-007: Use WhatsAppProviderService (Twilio/Meta) when available
    if (method === DeliveryMethod.WHATSAPP || method === DeliveryMethod.BOTH) {
      if (!parent.whatsapp) {
        throw new BusinessException(
          `Parent ${parent.id} has no WhatsApp number configured`,
          'NO_WHATSAPP_NUMBER',
        );
      }

      try {
        // TASK-WA-007: Use provider service for structured invoice notification
        if (this.whatsAppProviderService?.isConfigured()) {
          const organizationName = tenant.tradingName ?? tenant.name;
          const whatsAppResult =
            await this.whatsAppProviderService.sendInvoiceNotification(
              tenantId,
              parent.whatsapp,
              `${parent.firstName} ${parent.lastName}`.trim(),
              invoice.invoiceNumber,
              invoice.totalCents / 100, // Convert cents to Rands
              invoice.dueDate,
              organizationName, // Use tenant name for white-labeling
            );

          if (whatsAppResult.success) {
            whatsAppSucceeded = true;
            this.logger.log(
              `TASK-WA-007: WhatsApp invoice notification sent via provider for ${invoice.invoiceNumber} to ${parent.whatsapp}`,
            );
          } else {
            throw new Error(whatsAppResult.error || 'WhatsApp delivery failed');
          }
        } else {
          // Fallback to legacy WhatsApp service (Meta Cloud API)
          const body = this.buildInvoiceMessage(invoice, lines);
          await this.whatsAppService.sendMessage(parent.whatsapp, body);
          whatsAppSucceeded = true;
          this.logger.log(
            `WhatsApp sent for invoice ${invoice.invoiceNumber} to ${parent.whatsapp}`,
          );
        }
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
      dto.tenantId!,
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
      await this.invoiceRepo.incrementDeliveryRetryCount(
        invoice.id,
        dto.tenantId!,
      );

      try {
        // Retry delivery using invoice's configured method
        await this.deliverInvoice(
          dto.tenantId!,
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
    await this.invoiceRepo.update(invoice.id, invoice.tenantId, {
      status: InvoiceStatus.SENT, // Update invoice status from DRAFT to SENT
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
    await this.invoiceRepo.update(invoice.id, invoice.tenantId, {
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
