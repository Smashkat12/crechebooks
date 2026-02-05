/**
 * Button Response Handler
 * TASK-WA-009: Interactive Button Response Handlers
 *
 * Handles WhatsApp quick reply button responses from parents.
 * Each button action triggers a specific workflow response.
 *
 * Supported actions:
 * - pay: Send payment link
 * - extension: Request payment extension
 * - contact: Open conversation with creche
 * - paid: Report payment already made
 * - help: Show help menu
 * - plan: Request payment plan
 * - callback: Request callback from creche
 *
 * IMPORTANT: All responses use tenant.tradingName for branding, NOT "CrecheBooks"
 */

import { Injectable, Logger } from '@nestjs/common';
import { Tenant } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AuditLogService } from '../../../database/services/audit-log.service';
import { AuditAction } from '../../../database/entities/audit-log.entity';
import { TwilioContentService } from '../services/twilio-content.service';
import { DocumentUrlService } from '../services/document-url.service';
import {
  parseButtonPayload,
  ButtonAction,
  ParsedButtonPayload,
} from '../types/button.types';

/**
 * Result of button response handling
 */
export interface ButtonResponseResult {
  success: boolean;
  action: ButtonAction;
  referenceId: string;
  error?: string;
}

/**
 * Handler for WhatsApp interactive button responses
 *
 * This service processes button taps from parents and executes
 * the appropriate workflow for each action type.
 */
@Injectable()
export class ButtonResponseHandler {
  private readonly logger = new Logger(ButtonResponseHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentService: TwilioContentService,
    private readonly documentUrlService: DocumentUrlService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Main entry point for handling button responses
   *
   * @param from - Phone number of the parent in E.164 format
   * @param payload - Raw button payload string (e.g., "pay_INV-2026-001234")
   * @param tenantId - Tenant ID for the creche
   */
  async handleButtonResponse(
    from: string,
    payload: string,
    tenantId: string,
  ): Promise<ButtonResponseResult> {
    const parseResult = parseButtonPayload(payload);

    if (!parseResult.success || !parseResult.payload) {
      this.logger.warn(`Invalid button payload: ${payload}`);
      return {
        success: false,
        action: 'help' as ButtonAction,
        referenceId: '',
        error: parseResult.error || 'Failed to parse button payload',
      };
    }

    const parsed = parseResult.payload;

    this.logger.log(
      `Button response: ${parsed.action} for ${parsed.referenceId} from ${from}`,
    );

    // Get tenant for branding in responses
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      this.logger.error(`Tenant not found: ${tenantId}`);
      return {
        success: false,
        action: parsed.action,
        referenceId: parsed.referenceId,
        error: 'Tenant not found',
      };
    }

    try {
      switch (parsed.action) {
        case 'pay':
          await this.handlePayNow(from, parsed.referenceId, tenant);
          break;
        case 'extension':
          await this.handleExtensionRequest(from, parsed.referenceId, tenant);
          break;
        case 'contact':
          await this.handleContactRequest(from, tenant);
          break;
        case 'paid':
          await this.handleAlreadyPaid(from, parsed.referenceId, tenant);
          break;
        case 'help':
          await this.handleHelpRequest(from, tenant);
          break;
        case 'plan':
          await this.handlePaymentPlanRequest(from, parsed.referenceId, tenant);
          break;
        case 'callback':
          await this.handleCallbackRequest(from, parsed.referenceId, tenant);
          break;
        case 'view':
          await this.handleViewInvoice(from, parsed.referenceId, tenant);
          break;
        default:
          this.logger.warn(`Unknown button action: ${parsed.action}`);
          await this.handleUnknownAction(from, tenant);
      }

      // Audit log the button response
      await this.auditLogService.logAction({
        tenantId,
        entityType: 'WhatsAppButtonResponse',
        entityId: parsed.referenceId || 'unknown',
        action: AuditAction.CREATE,
        afterValue: {
          from,
          buttonAction: parsed.action,
          referenceId: parsed.referenceId,
          timestamp: new Date().toISOString(),
        },
        changeSummary: `WhatsApp button response: ${parsed.action} for ${parsed.referenceId}`,
      });

      return {
        success: true,
        action: parsed.action,
        referenceId: parsed.referenceId,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to handle button response: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        success: false,
        action: parsed.action,
        referenceId: parsed.referenceId,
        error: errorMessage,
      };
    }
  }

  /**
   * PAY NOW - Send payment link
   *
   * Sends a direct payment link for the specified invoice.
   */
  private async handlePayNow(
    to: string,
    invoiceId: string,
    tenant: Tenant,
  ): Promise<void> {
    const tenantName = tenant.tradingName || tenant.name;
    // TODO: Make this URL configurable via environment variable
    const paymentUrl = `https://app.elleelephant.co.za/pay/${invoiceId}`;

    await this.contentService.sendSessionMessage(
      to,
      `Here's your secure payment link for ${tenantName}:\n\n${paymentUrl}\n\nThis link will remain active for 7 days.`,
      tenant.id,
    );

    this.logger.log(`Payment link sent for invoice ${invoiceId} to ${to}`);
  }

  /**
   * EXTENSION REQUEST - Log and notify admin
   *
   * Records the extension request and confirms receipt to the parent.
   */
  private async handleExtensionRequest(
    to: string,
    invoiceId: string,
    tenant: Tenant,
  ): Promise<void> {
    const tenantName = tenant.tradingName || tenant.name;

    // Find invoice and parent
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        invoiceNumber: invoiceId,
        tenantId: tenant.id,
        isDeleted: false,
      },
      include: { parent: true },
    });

    if (!invoice) {
      await this.contentService.sendSessionMessage(
        to,
        "We couldn't find that invoice. Please contact us for assistance.",
        tenant.id,
      );
      return;
    }

    // Log the extension request in audit log (no separate table exists)
    await this.auditLogService.logAction({
      tenantId: tenant.id,
      entityType: 'PaymentExtensionRequest',
      entityId: invoice.id,
      action: AuditAction.CREATE,
      afterValue: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        parentId: invoice.parentId,
        parentPhone: to,
        requestedAt: new Date().toISOString(),
        source: 'WHATSAPP',
        status: 'PENDING',
      },
      changeSummary: `Payment extension requested for invoice ${invoice.invoiceNumber} via WhatsApp`,
    });

    // Send confirmation
    await this.contentService.sendSessionMessage(
      to,
      `Your payment extension request for invoice ${invoice.invoiceNumber} has been submitted to ${tenantName}.\n\nOur team will contact you within 24 hours to discuss arrangements.`,
      tenant.id,
    );

    this.logger.log(
      `Extension request logged for invoice ${invoiceId} from ${to}`,
    );
  }

  /**
   * CONTACT US - Open conversation
   *
   * Welcomes the parent and invites them to ask questions.
   */
  private async handleContactRequest(
    to: string,
    tenant: Tenant,
  ): Promise<void> {
    const tenantName = tenant.tradingName || tenant.name;

    await this.contentService.sendSessionMessage(
      to,
      `Thank you for reaching out to ${tenantName}!\n\nI'm here to help. Please type your question and I'll assist you.\n\nOffice hours: Mon-Fri 08:00-17:00\nPhone: ${tenant.phone}`,
      tenant.id,
    );

    this.logger.log(`Contact request from ${to} - conversation opened`);
  }

  /**
   * ALREADY PAID - Request proof of payment
   *
   * Acknowledges the payment claim and requests proof of payment.
   */
  private async handleAlreadyPaid(
    to: string,
    invoiceId: string,
    tenant: Tenant,
  ): Promise<void> {
    const tenantName = tenant.tradingName || tenant.name;

    // Log the payment claim
    await this.auditLogService.logAction({
      tenantId: tenant.id,
      entityType: 'PaymentClaim',
      entityId: invoiceId,
      action: AuditAction.CREATE,
      afterValue: {
        invoiceNumber: invoiceId,
        parentPhone: to,
        claimedAt: new Date().toISOString(),
        source: 'WHATSAPP',
      },
      changeSummary: `Parent claimed payment already made for invoice ${invoiceId} via WhatsApp`,
    });

    await this.contentService.sendSessionMessage(
      to,
      `Thank you for letting ${tenantName} know!\n\nIf your payment was made recently, it may take 1-2 business days to reflect on your account.\n\nIf you have a proof of payment (POP), please share it here and we'll update your account promptly.`,
      tenant.id,
    );

    this.logger.log(`Already paid claim for invoice ${invoiceId} from ${to}`);
  }

  /**
   * HELP - Send help menu
   *
   * Sends an interactive quick reply menu with help options.
   */
  private async handleHelpRequest(to: string, tenant: Tenant): Promise<void> {
    const tenantName = tenant.tradingName || tenant.name;

    await this.contentService.sendSessionQuickReply(
      to,
      `How can ${tenantName} help you today?`,
      [
        { title: 'Check Balance', id: 'menu_balance' },
        { title: 'Payment Methods', id: 'menu_payment' },
        { title: 'Speak to Someone', id: 'menu_human' },
      ],
      tenant.id,
    );

    this.logger.log(`Help menu sent to ${to}`);
  }

  /**
   * PAYMENT PLAN - Request arrangement
   *
   * Records the payment plan request and confirms receipt.
   */
  private async handlePaymentPlanRequest(
    to: string,
    invoiceId: string,
    tenant: Tenant,
  ): Promise<void> {
    const tenantName = tenant.tradingName || tenant.name;

    // Log the payment plan request
    await this.auditLogService.logAction({
      tenantId: tenant.id,
      entityType: 'PaymentPlanRequest',
      entityId: invoiceId,
      action: AuditAction.CREATE,
      afterValue: {
        invoiceNumber: invoiceId,
        parentPhone: to,
        requestedAt: new Date().toISOString(),
        source: 'WHATSAPP',
        status: 'PENDING',
      },
      changeSummary: `Payment plan requested for invoice ${invoiceId} via WhatsApp`,
    });

    await this.contentService.sendSessionMessage(
      to,
      `We'd be happy to discuss a payment plan with you.\n\n${tenantName}'s admin team will contact you within 24 hours to arrange a suitable plan that works for your situation.`,
      tenant.id,
    );

    this.logger.log(
      `Payment plan request logged for invoice ${invoiceId} from ${to}`,
    );
  }

  /**
   * CALLBACK REQUEST - Schedule call
   *
   * Records the callback request and confirms receipt.
   */
  private async handleCallbackRequest(
    to: string,
    invoiceId: string,
    tenant: Tenant,
  ): Promise<void> {
    const tenantName = tenant.tradingName || tenant.name;

    // Log the callback request
    await this.auditLogService.logAction({
      tenantId: tenant.id,
      entityType: 'CallbackRequest',
      entityId: invoiceId,
      action: AuditAction.CREATE,
      afterValue: {
        invoiceNumber: invoiceId,
        parentPhone: to,
        requestedAt: new Date().toISOString(),
        source: 'WHATSAPP',
        status: 'PENDING',
      },
      changeSummary: `Callback requested for invoice ${invoiceId} via WhatsApp`,
    });

    await this.contentService.sendSessionMessage(
      to,
      `We'll call you back during office hours (08:00-17:00, Monday-Friday).\n\nIf you need immediate assistance, please call ${tenantName} directly at ${tenant.phone}.`,
      tenant.id,
    );

    this.logger.log(
      `Callback request logged for invoice ${invoiceId} from ${to}`,
    );
  }

  /**
   * VIEW INVOICE - Send invoice PDF
   * TASK-WA-010: Option A hybrid approach
   *
   * This is the key handler for the hybrid flow:
   * 1. Parent tapped "View Invoice" button (which opens session window)
   * 2. We generate a signed URL for the invoice PDF
   * 3. Send the PDF via session message (no template approval needed!)
   */
  private async handleViewInvoice(
    to: string,
    invoiceNumber: string,
    tenant: Tenant,
  ): Promise<void> {
    const tenantName = tenant.tradingName || tenant.name;

    // Find invoice by number
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        invoiceNumber,
        tenantId: tenant.id,
        isDeleted: false,
      },
      select: {
        id: true,
        invoiceNumber: true,
        totalCents: true,
        amountPaidCents: true,
        dueDate: true,
      },
    });

    if (!invoice) {
      await this.contentService.sendSessionMessage(
        to,
        `We couldn't find invoice ${invoiceNumber}. Please contact ${tenantName} for assistance.`,
        tenant.id,
      );
      return;
    }

    try {
      // Generate signed URL for the invoice PDF
      const signedUrl = await this.documentUrlService.generateInvoiceUrl(
        invoice.id,
        tenant.id,
      );

      // Send the PDF via session message
      const sendResult = await this.contentService.sendMediaMessage(
        to,
        signedUrl.url,
        `📄 Invoice ${invoice.invoiceNumber}\n` +
          `Amount: R ${(invoice.totalCents / 100).toFixed(2)}\n` +
          `Due: ${invoice.dueDate.toISOString().split('T')[0]}\n\n` +
          `From ${tenantName}`,
        tenant.id,
      );

      if (sendResult.success) {
        this.logger.log(
          `Invoice PDF sent for ${invoiceNumber} to ${to} via session message`,
        );
      } else {
        // Fallback: Send text with link if media message fails
        this.logger.warn(
          `Failed to send media message, falling back to text: ${sendResult.error}`,
        );

        await this.contentService.sendSessionMessage(
          to,
          `Here's your invoice from ${tenantName}:\n\n` +
            `📄 Invoice: ${invoice.invoiceNumber}\n` +
            `💰 Amount: R ${(invoice.totalCents / 100).toFixed(2)}\n` +
            `📅 Due: ${invoice.dueDate.toISOString().split('T')[0]}\n\n` +
            `View and download your invoice here:\n${signedUrl.url}\n\n` +
            `This link expires in 15 minutes.`,
          tenant.id,
        );
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to send invoice PDF: ${errorMessage}`);

      await this.contentService.sendSessionMessage(
        to,
        `We're sorry, we couldn't generate your invoice right now. Please try again later or contact ${tenantName} at ${tenant.phone}.`,
        tenant.id,
      );
    }
  }

  /**
   * Handle unknown or unsupported button actions
   */
  private async handleUnknownAction(to: string, tenant: Tenant): Promise<void> {
    const tenantName = tenant.tradingName || tenant.name;

    await this.contentService.sendSessionMessage(
      to,
      `Sorry, I didn't understand that option. Please contact ${tenantName} at ${tenant.phone} for assistance.`,
      tenant.id,
    );
  }
}
