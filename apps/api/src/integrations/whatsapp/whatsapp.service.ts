/**
 * WhatsApp Business API Service
 * TASK-BILL-015: WhatsApp Business API Integration
 *
 * Handles WhatsApp messaging via Meta Cloud API.
 * Features:
 * - Template-based messaging (POPIA compliant)
 * - Invoice PDF attachments
 * - Delivery status tracking via webhooks
 * - Opt-in/opt-out consent management
 *
 * CRITICAL: Fail fast with detailed error logging.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { BusinessException } from '../../shared/exceptions';
import {
  WhatsAppMessageResult,
  WhatsAppWebhookPayload,
  WhatsAppSendRequest,
  WhatsAppApiResponse,
  WhatsAppApiError,
  WhatsAppConfig,
  WhatsAppTemplateName,
  TemplateParams,
  TemplateComponent,
} from './types/whatsapp.types';
import * as crypto from 'crypto';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly config: WhatsAppConfig | null;

  // Rate limiting: 80 messages per second
  private rateLimitWindow: number[] = [];
  private readonly RATE_LIMIT = 80;
  private readonly RATE_WINDOW_MS = 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
  ) {
    this.config = this.loadConfig();

    if (!this.config) {
      this.logger.warn(
        'WhatsApp API not configured. Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, ' +
          'WHATSAPP_BUSINESS_ACCOUNT_ID, and WHATSAPP_WEBHOOK_VERIFY_TOKEN environment variables.',
      );
    } else {
      this.logger.log('WhatsApp Business API service initialized');
    }
  }

  /**
   * Load WhatsApp configuration from environment
   */
  private loadConfig(): WhatsAppConfig | null {
    const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const businessAccountId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    const webhookVerifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    if (
      !accessToken ||
      !phoneNumberId ||
      !businessAccountId ||
      !webhookVerifyToken
    ) {
      return null;
    }

    return {
      apiUrl: `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`,
      accessToken,
      phoneNumberId,
      businessAccountId,
      webhookVerifyToken,
    };
  }

  /**
   * Ensure WhatsApp is configured, throw if not
   */
  private ensureConfigured(): WhatsAppConfig {
    if (!this.config) {
      this.logger.error({
        error: {
          message: 'WhatsApp API not configured',
          name: 'ConfigurationError',
        },
        file: 'whatsapp.service.ts',
        function: 'ensureConfigured',
        timestamp: new Date().toISOString(),
      });
      throw new BusinessException(
        'WhatsApp integration not configured. Set WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, ' +
          'WHATSAPP_BUSINESS_ACCOUNT_ID, and WHATSAPP_WEBHOOK_VERIFY_TOKEN environment variables.',
        'WHATSAPP_NOT_CONFIGURED',
      );
    }
    return this.config;
  }

  /**
   * Check rate limit
   */
  private checkRateLimit(): void {
    const now = Date.now();
    this.rateLimitWindow = this.rateLimitWindow.filter(
      (t) => now - t < this.RATE_WINDOW_MS,
    );

    if (this.rateLimitWindow.length >= this.RATE_LIMIT) {
      this.logger.error({
        error: {
          message: 'WhatsApp rate limit exceeded',
          name: 'RateLimitError',
        },
        file: 'whatsapp.service.ts',
        function: 'checkRateLimit',
        currentCount: this.rateLimitWindow.length,
        limit: this.RATE_LIMIT,
        timestamp: new Date().toISOString(),
      });
      throw new BusinessException(
        'WhatsApp rate limit exceeded. Maximum 80 messages per second.',
        'WHATSAPP_RATE_LIMIT',
      );
    }

    this.rateLimitWindow.push(now);
  }

  /**
   * Send invoice notification to parent
   *
   * @param parentId - Parent ID
   * @param invoiceId - Invoice ID
   * @returns Message result
   */
  async sendInvoice(
    parentId: string,
    invoiceId: string,
  ): Promise<WhatsAppMessageResult> {
    const config = this.ensureConfigured();

    // Get parent with phone number
    const parent = await this.prisma.parent.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        phone: true,
        whatsapp: true,
        firstName: true,
        lastName: true,
        whatsappOptIn: true,
        tenantId: true,
      },
    });

    if (!parent) {
      this.logger.error({
        error: { message: 'Parent not found', name: 'NotFoundError' },
        file: 'whatsapp.service.ts',
        function: 'sendInvoice',
        inputs: { parentId },
        timestamp: new Date().toISOString(),
      });
      throw new BusinessException(
        `Parent ${parentId} not found`,
        'PARENT_NOT_FOUND',
      );
    }

    // Check opt-in status (POPIA compliance)
    if (!parent.whatsappOptIn) {
      this.logger.warn({
        message: 'Parent has not opted in to WhatsApp messages',
        parentId,
        timestamp: new Date().toISOString(),
      });
      throw new BusinessException(
        'Parent has not opted in to WhatsApp messages',
        'WHATSAPP_OPT_IN_REQUIRED',
      );
    }

    // Use whatsapp number if available, fallback to phone
    const phoneNumber = parent.whatsapp || parent.phone;
    if (!phoneNumber) {
      this.logger.error({
        error: {
          message: 'Parent phone number not available',
          name: 'ValidationError',
        },
        file: 'whatsapp.service.ts',
        function: 'sendInvoice',
        inputs: { parentId },
        timestamp: new Date().toISOString(),
      });
      throw new BusinessException(
        'Parent phone number not available',
        'PHONE_NUMBER_MISSING',
      );
    }

    // Get invoice details
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: {
        id: true,
        invoiceNumber: true,
        totalCents: true,
        dueDate: true,
        pdfUrl: true,
      },
    });

    if (!invoice) {
      this.logger.error({
        error: { message: 'Invoice not found', name: 'NotFoundError' },
        file: 'whatsapp.service.ts',
        function: 'sendInvoice',
        inputs: { invoiceId },
        timestamp: new Date().toISOString(),
      });
      throw new BusinessException(
        `Invoice ${invoiceId} not found`,
        'INVOICE_NOT_FOUND',
      );
    }

    // Format phone number to E.164
    const phone = this.formatPhoneE164(phoneNumber);

    // Prepare template parameters
    const params: TemplateParams = {
      parent_name: `${parent.firstName} ${parent.lastName}`,
      invoice_number: invoice.invoiceNumber,
      amount: this.formatCurrency(invoice.totalCents),
      due_date: this.formatDate(invoice.dueDate),
    };

    // Build template components
    const components: TemplateComponent[] = [
      {
        type: 'body',
        parameters: [
          { type: 'text', text: params.parent_name },
          { type: 'text', text: params.invoice_number },
          { type: 'text', text: params.amount },
          { type: 'text', text: params.due_date },
        ],
      },
    ];

    // Add PDF attachment if available
    if (invoice.pdfUrl) {
      components.unshift({
        type: 'header',
        parameters: [
          {
            type: 'document',
            document: {
              link: invoice.pdfUrl,
              filename: `Invoice_${invoice.invoiceNumber}.pdf`,
            },
          },
        ],
      });
    }

    // Send the message
    const result = await this.sendTemplateMessage(
      phone,
      'invoice_notification',
      components,
      config,
    );

    // Log audit trail
    await this.auditLogService.logAction({
      tenantId: parent.tenantId,
      entityType: 'WhatsAppMessage',
      entityId: result.messageId,
      action: AuditAction.CREATE,
      afterValue: {
        parentId,
        invoiceId,
        template: 'invoice_notification',
        recipientPhone: phone,
        status: result.status,
      },
      changeSummary: `Sent invoice notification ${invoice.invoiceNumber} via WhatsApp to ${phone}`,
    });

    return result;
  }

  /**
   * Send a reminder message using a template
   *
   * @param parentId - Parent ID
   * @param templateName - Template name
   * @param params - Template parameters
   * @returns Message result
   */
  async sendReminder(
    parentId: string,
    templateName: WhatsAppTemplateName,
    params: TemplateParams,
  ): Promise<WhatsAppMessageResult> {
    const config = this.ensureConfigured();

    // Get parent with phone number
    const parent = await this.prisma.parent.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        phone: true,
        whatsapp: true,
        whatsappOptIn: true,
        tenantId: true,
      },
    });

    if (!parent) {
      throw new BusinessException(
        `Parent ${parentId} not found`,
        'PARENT_NOT_FOUND',
      );
    }

    if (!parent.whatsappOptIn) {
      throw new BusinessException(
        'Parent has not opted in to WhatsApp messages',
        'WHATSAPP_OPT_IN_REQUIRED',
      );
    }

    // Use whatsapp number if available, fallback to phone
    const phoneNumber = parent.whatsapp || parent.phone;
    if (!phoneNumber) {
      throw new BusinessException(
        'Parent phone number not available',
        'PHONE_NUMBER_MISSING',
      );
    }

    const phone = this.formatPhoneE164(phoneNumber);

    // Build template components from params
    const components: TemplateComponent[] = [
      {
        type: 'body',
        parameters: Object.values(params).map((value) => ({
          type: 'text' as const,
          text: value,
        })),
      },
    ];

    const result = await this.sendTemplateMessage(
      phone,
      templateName,
      components,
      config,
    );

    // Log audit trail
    await this.auditLogService.logAction({
      tenantId: parent.tenantId,
      entityType: 'WhatsAppMessage',
      entityId: result.messageId,
      action: AuditAction.CREATE,
      afterValue: {
        parentId,
        template: templateName,
        recipientPhone: phone,
        status: result.status,
      },
      changeSummary: `Sent ${templateName} reminder via WhatsApp to ${phone}`,
    });

    return result;
  }

  /**
   * Handle incoming webhook from WhatsApp
   *
   * @param payload - Webhook payload
   * @param signature - X-Hub-Signature-256 header
   */
  async handleWebhook(
    payload: WhatsAppWebhookPayload,
    signature?: string,
  ): Promise<void> {
    const config = this.ensureConfigured();

    // Verify webhook signature if provided
    if (signature) {
      const isValid = this.verifyWebhookSignature(
        JSON.stringify(payload),
        signature,
        config,
      );
      if (!isValid) {
        this.logger.error({
          error: {
            message: 'Invalid webhook signature',
            name: 'SecurityError',
          },
          file: 'whatsapp.service.ts',
          function: 'handleWebhook',
          timestamp: new Date().toISOString(),
        });
        throw new BusinessException(
          'Invalid webhook signature',
          'WEBHOOK_SIGNATURE_INVALID',
        );
      }
    }

    // Process each entry
    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const { value } = change;

        // Process status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            await this.updateMessageStatus(
              status.id,
              status.status,
              status.errors?.[0]?.code,
              status.errors?.[0]?.message,
            );
          }
        }

        // Process incoming messages (for opt-out detection)
        if (value.messages) {
          for (const message of value.messages) {
            if (message.type === 'text' && message.text?.body) {
              const body = message.text.body.toLowerCase().trim();
              if (
                body === 'stop' ||
                body === 'unsubscribe' ||
                body === 'optout'
              ) {
                await this.optOut(message.from);
              }
            }
          }
        }
      }
    }
  }

  /**
   * Check if a phone number has opted in to WhatsApp messages
   *
   * @param phoneNumber - Phone number to check
   * @returns Whether opted in
   */
  async checkOptIn(phoneNumber: string): Promise<boolean> {
    const phone = this.formatPhoneE164(phoneNumber);

    const parent = await this.prisma.parent.findFirst({
      where: {
        OR: [{ phone }, { whatsapp: phone }],
        whatsappOptIn: true,
      },
      select: { id: true },
    });

    return !!parent;
  }

  /**
   * Opt out a phone number from WhatsApp messages
   *
   * @param phoneNumber - Phone number to opt out
   */
  async optOut(phoneNumber: string): Promise<void> {
    const phone = this.formatPhoneE164(phoneNumber);

    // Find all parents with this phone number (phone or whatsapp) and opt them out
    const result = await this.prisma.parent.updateMany({
      where: {
        OR: [{ phone }, { whatsapp: phone }],
      },
      data: {
        whatsappOptIn: false,
        updatedAt: new Date(),
      },
    });

    if (result.count > 0) {
      this.logger.log({
        message: 'Phone number opted out of WhatsApp',
        phoneNumber: phone,
        affectedRecords: result.count,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Opt in a phone number to WhatsApp messages
   *
   * @param parentId - Parent ID
   */
  async optIn(parentId: string): Promise<void> {
    await this.prisma.parent.update({
      where: { id: parentId },
      data: {
        whatsappOptIn: true,
        updatedAt: new Date(),
      },
    });

    this.logger.log({
      message: 'Parent opted in to WhatsApp',
      parentId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send a template message via WhatsApp Business API
   */
  private async sendTemplateMessage(
    to: string,
    templateName: WhatsAppTemplateName,
    components: TemplateComponent[],
    config: WhatsAppConfig,
  ): Promise<WhatsAppMessageResult> {
    this.checkRateLimit();

    const requestBody: WhatsAppSendRequest = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: 'en' },
        components,
      },
    };

    try {
      const response = await fetch(config.apiUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorBody = (await response.json()) as WhatsAppApiError;
        this.logger.error({
          error: {
            message: errorBody.error.message,
            name: 'WhatsAppApiError',
            code: errorBody.error.code,
            type: errorBody.error.type,
          },
          file: 'whatsapp.service.ts',
          function: 'sendTemplateMessage',
          inputs: { to, templateName },
          timestamp: new Date().toISOString(),
        });
        throw new BusinessException(
          `WhatsApp API error: ${errorBody.error.message}`,
          'WHATSAPP_API_ERROR',
        );
      }

      const data = (await response.json()) as WhatsAppApiResponse;

      this.logger.log({
        message: 'WhatsApp message sent successfully',
        messageId: data.messages[0].id,
        recipientPhone: to,
        templateName,
        timestamp: new Date().toISOString(),
      });

      return {
        messageId: data.messages[0].id,
        status: 'sent',
        sentAt: new Date(),
        recipientPhone: to,
      };
    } catch (error) {
      if (error instanceof BusinessException) {
        throw error;
      }

      this.logger.error({
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'UnknownError',
          stack: error instanceof Error ? error.stack : undefined,
        },
        file: 'whatsapp.service.ts',
        function: 'sendTemplateMessage',
        inputs: { to, templateName },
        timestamp: new Date().toISOString(),
      });

      throw new BusinessException(
        `Failed to send WhatsApp message: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'WHATSAPP_SEND_FAILED',
      );
    }
  }

  /**
   * Update message delivery status from webhook
   */
  private async updateMessageStatus(
    messageId: string,
    status: 'sent' | 'delivered' | 'read' | 'failed',
    errorCode?: number,
    errorMessage?: string,
  ): Promise<void> {
    this.logger.log({
      message: 'WhatsApp message status updated',
      messageId,
      status,
      errorCode,
      errorMessage,
      timestamp: new Date().toISOString(),
    });

    // Store status update in audit log for tracking
    await this.auditLogService.logAction({
      tenantId: 'system',
      entityType: 'WhatsAppMessageStatus',
      entityId: messageId,
      action: AuditAction.UPDATE,
      afterValue: {
        status,
        errorCode,
        errorMessage,
        updatedAt: new Date().toISOString(),
      },
      changeSummary: `WhatsApp message ${messageId} status: ${status}`,
    });
  }

  /**
   * Verify webhook signature from Meta
   */
  private verifyWebhookSignature(
    payload: string,
    signature: string,
    config: WhatsAppConfig,
  ): boolean {
    const expectedSignature =
      'sha256=' +
      crypto
        .createHmac('sha256', config.webhookVerifyToken)
        .update(payload)
        .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature),
    );
  }

  /**
   * Send a simple text message (backwards compatibility)
   * Note: WhatsApp Business API requires template messages for business-initiated conversations.
   * This method is provided for backwards compatibility but will use a generic template.
   *
   * @param to - Phone number
   * @param message - Message content (used as template parameter)
   * @returns Message result
   */
  async sendMessage(
    to: string,
    message: string,
  ): Promise<WhatsAppMessageResult> {
    const config = this.ensureConfigured();

    const phone = this.formatPhoneE164(to);
    if (!this.isValidPhoneNumber(phone)) {
      this.logger.error({
        error: { message: 'Invalid phone number', name: 'ValidationError' },
        file: 'whatsapp.service.ts',
        function: 'sendMessage',
        inputs: { to },
        timestamp: new Date().toISOString(),
      });
      throw new BusinessException(
        `Invalid phone number: ${to}`,
        'INVALID_PHONE',
      );
    }

    // Use a generic notification template
    const components: TemplateComponent[] = [
      {
        type: 'body',
        parameters: [{ type: 'text', text: message.substring(0, 1000) }],
      },
    ];

    return this.sendTemplateMessage(
      phone,
      'invoice_notification',
      components,
      config,
    );
  }

  /**
   * Format phone number to E.164 format (+27...)
   */
  formatPhoneE164(phone: string): string {
    if (!phone || typeof phone !== 'string') {
      return '';
    }

    // Remove non-digit characters except leading +
    const digits = phone.replace(/[^\d+]/g, '');

    // If starts with +, keep as is (already E.164)
    if (digits.startsWith('+')) {
      return digits;
    }

    // Convert SA format: 0XX... to +27XX...
    if (digits.length === 10 && digits.startsWith('0')) {
      return '+27' + digits.substring(1);
    }

    // If 9 digits without leading 0, add +27
    if (digits.length === 9 && !digits.startsWith('27')) {
      return '+27' + digits;
    }

    // If already has 27 prefix, add +
    if (digits.startsWith('27') && digits.length === 11) {
      return '+' + digits;
    }

    return '+' + digits;
  }

  /**
   * Validate phone number is valid South African format
   */
  isValidPhoneNumber(phone: string): boolean {
    if (!phone || typeof phone !== 'string') {
      return false;
    }
    const formatted = this.formatPhoneE164(phone);
    return /^\+27\d{9}$/.test(formatted);
  }

  /**
   * Format cents to Rands currency string
   */
  private formatCurrency(cents: number): string {
    return `R ${(cents / 100).toFixed(2)}`;
  }

  /**
   * Format date for display
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-ZA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
