/**
 * Twilio WhatsApp Service
 * TASK-WA-007: Twilio WhatsApp Integration (Alternative to Meta Cloud API)
 * TASK-WA-008: Rich WhatsApp Template Definitions
 *
 * Provides WhatsApp messaging via Twilio API.
 * Benefits over Meta:
 * - Simpler setup (no Meta Business verification)
 * - No template pre-approval required for sandbox
 * - Easier to test and develop
 *
 * For production, requires upgraded Twilio account and WhatsApp Business number.
 *
 * Rich messaging features (TASK-WA-008):
 * - Card templates with PDF attachments and action buttons
 * - Quick reply templates with interactive buttons
 * - Call-to-action templates with URL/phone buttons
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AuditLogService } from '../../../database/services/audit-log.service';
import { AuditAction } from '../../../database/entities/audit-log.entity';
import { BusinessException } from '../../../shared/exceptions';
import { WhatsAppMessageEntity } from '../entities/whatsapp-message.entity';
import {
  WhatsAppMessageStatus,
  WhatsAppContextType,
} from '../types/message-history.types';
import { WhatsAppTemplateName } from '../types/whatsapp.types';
import { TwilioContentService } from './twilio-content.service';
import { TEMPLATE_NAMES } from '../templates/content-templates';
import { ContentVariable } from '../types/content.types';

/**
 * Twilio configuration
 */
interface TwilioConfig {
  accountSid: string;
  authToken: string;
  whatsappNumber: string; // Format: +14155238886
  statusCallbackUrl?: string;
}

/**
 * Twilio message result
 */
interface TwilioMessageResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
}

/**
 * Twilio API response
 */
interface TwilioApiResponse {
  sid: string;
  status: string;
  error_code?: number;
  error_message?: string;
}

@Injectable()
export class TwilioWhatsAppService {
  private readonly logger = new Logger(TwilioWhatsAppService.name);
  private readonly config: TwilioConfig | null;
  private readonly apiUrl = 'https://api.twilio.com/2010-04-01';

  // Rate limiting: 1 message per second for sandbox, higher for production
  private rateLimitWindow: number[] = [];
  private readonly RATE_LIMIT = 50; // Conservative limit
  private readonly RATE_WINDOW_MS = 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogService: AuditLogService,
    @Optional() private readonly messageEntity?: WhatsAppMessageEntity,
    @Optional() private readonly contentService?: TwilioContentService,
  ) {
    this.config = this.loadConfig();

    if (!this.config) {
      this.logger.warn(
        'Twilio WhatsApp not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, ' +
          'and TWILIO_WHATSAPP_NUMBER environment variables.',
      );
    } else {
      this.logger.log(
        `Twilio WhatsApp service initialized with number ${this.config.whatsappNumber}`,
      );
    }
  }

  /**
   * Load Twilio configuration from environment
   */
  private loadConfig(): TwilioConfig | null {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER;
    const statusCallbackUrl = process.env.TWILIO_STATUS_CALLBACK_URL;

    if (!accountSid || !authToken || !whatsappNumber) {
      return null;
    }

    return {
      accountSid,
      authToken,
      whatsappNumber: whatsappNumber.startsWith('+')
        ? whatsappNumber
        : `+${whatsappNumber}`,
      statusCallbackUrl: statusCallbackUrl || undefined,
    };
  }

  /**
   * Check if Twilio is configured
   */
  isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Ensure Twilio is configured, throw if not
   */
  private ensureConfigured(): TwilioConfig {
    if (!this.config) {
      throw new BusinessException(
        'Twilio WhatsApp not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER.',
        'TWILIO_NOT_CONFIGURED',
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
      throw new BusinessException(
        `Twilio rate limit exceeded. Maximum ${this.RATE_LIMIT} messages per second.`,
        'TWILIO_RATE_LIMIT',
      );
    }

    this.rateLimitWindow.push(now);
  }

  /**
   * Format phone number for Twilio WhatsApp
   * Twilio requires: whatsapp:+1234567890
   */
  private formatWhatsAppNumber(phone: string): string {
    // Remove all non-digit characters except +
    let cleaned = phone.replace(/[^\d+]/g, '');

    // Ensure it starts with +
    if (!cleaned.startsWith('+')) {
      // Assume South African number if starts with 0
      if (cleaned.startsWith('0')) {
        cleaned = '+27' + cleaned.slice(1);
      } else if (cleaned.startsWith('27')) {
        cleaned = '+' + cleaned;
      } else {
        cleaned = '+' + cleaned;
      }
    }

    return `whatsapp:${cleaned}`;
  }

  /**
   * Send a WhatsApp message via Twilio
   */
  async sendMessage(
    to: string,
    body: string,
    options?: {
      mediaUrl?: string;
      statusCallback?: string;
      tenantId?: string;
      contextType?: WhatsAppContextType;
      contextId?: string;
    },
  ): Promise<TwilioMessageResult> {
    const config = this.ensureConfigured();
    this.checkRateLimit();

    const toNumber = this.formatWhatsAppNumber(to);
    const fromNumber = `whatsapp:${config.whatsappNumber}`;

    this.logger.log(`Sending WhatsApp message to ${toNumber}`);

    try {
      // Build form data for Twilio API
      const formData = new URLSearchParams();
      formData.append('To', toNumber);
      formData.append('From', fromNumber);
      formData.append('Body', body);

      if (options?.mediaUrl) {
        formData.append('MediaUrl', options.mediaUrl);
      }

      const callbackUrl = options?.statusCallback || config.statusCallbackUrl;
      if (callbackUrl) {
        formData.append('StatusCallback', callbackUrl);
      }

      // Make API request
      const url = `${this.apiUrl}/Accounts/${config.accountSid}/Messages.json`;
      const auth = Buffer.from(
        `${config.accountSid}:${config.authToken}`,
      ).toString('base64');

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const data = (await response.json()) as TwilioApiResponse;

      if (!response.ok) {
        this.logger.error({
          message: 'Twilio API error',
          status: response.status,
          error: data,
        });

        // Store failed message in history
        if (this.messageEntity && options?.tenantId && options.contextType) {
          const message = await this.messageEntity.create({
            tenantId: options.tenantId,
            recipientPhone: to,
            templateName: 'twilio_custom_message',
            contextType: options.contextType,
            contextId: options.contextId,
          });
          // Mark as failed
          await this.messageEntity.markAsFailed(
            message.id,
            data.error_code?.toString() || 'UNKNOWN',
            data.error_message || 'Unknown error',
          );
        }

        return {
          success: false,
          error: data.error_message || 'Failed to send message',
          errorCode: data.error_code?.toString(),
        };
      }

      this.logger.log(`Message sent successfully, SID: ${data.sid}`);

      // Store successful message in history
      if (this.messageEntity && options?.tenantId && options.contextType) {
        const message = await this.messageEntity.create({
          tenantId: options.tenantId,
          recipientPhone: to,
          templateName: 'twilio_custom_message',
          contextType: options.contextType,
          contextId: options.contextId,
        });
        // Mark as sent with Twilio SID
        await this.messageEntity.markAsSent(message.id, data.sid);
      }

      // Audit log
      if (options?.tenantId) {
        await this.auditLogService.logAction({
          tenantId: options.tenantId,
          entityType: 'WhatsAppMessage',
          entityId: data.sid,
          action: AuditAction.CREATE,
          afterValue: {
            provider: 'twilio',
            to: to,
            messageSid: data.sid,
            contextType: options.contextType,
            contextId: options.contextId,
          },
          changeSummary: `WhatsApp message sent via Twilio to ${to}`,
        });
      }

      return {
        success: true,
        messageId: data.sid,
      };
    } catch (error) {
      this.logger.error({
        message: 'Failed to send WhatsApp message via Twilio',
        error: error instanceof Error ? error.message : String(error),
        to,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Send invoice notification
   * Maps to Twilio's pre-approved templates or custom message in sandbox
   */
  async sendInvoiceNotification(
    tenantId: string,
    parentPhone: string,
    parentName: string,
    invoiceNumber: string,
    amount: number,
    dueDate: Date,
    organizationName: string,
    pdfUrl?: string,
  ): Promise<TwilioMessageResult> {
    const formattedAmount = `R${amount.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
    })}`;
    const formattedDate = dueDate.toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    // For sandbox, use free-form message (works after user opts in)
    // For production, would use content templates
    const body = `Hello ${parentName},

Your invoice ${invoiceNumber} for ${formattedAmount} is now available.

Due Date: ${formattedDate}

${pdfUrl ? `View Invoice: ${pdfUrl}` : ''}

Thank you for choosing our services.

- ${organizationName}`;

    return this.sendMessage(parentPhone, body, {
      tenantId,
      contextType: WhatsAppContextType.INVOICE,
      contextId: invoiceNumber,
      mediaUrl: pdfUrl,
    });
  }

  /**
   * Send payment reminder
   */
  async sendPaymentReminder(
    tenantId: string,
    parentPhone: string,
    parentName: string,
    invoiceNumber: string,
    amount: number,
    daysOverdue: number,
    organizationName: string,
  ): Promise<TwilioMessageResult> {
    const formattedAmount = `R${amount.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
    })}`;

    const urgency =
      daysOverdue > 30 ? 'URGENT: ' : daysOverdue > 14 ? 'Reminder: ' : '';

    const body = `${urgency}Hello ${parentName},

This is a friendly reminder that invoice ${invoiceNumber} for ${formattedAmount} is ${daysOverdue} days overdue.

Please arrange payment at your earliest convenience.

If you have already paid, please ignore this message.

- ${organizationName}`;

    return this.sendMessage(parentPhone, body, {
      tenantId,
      contextType: WhatsAppContextType.REMINDER,
      contextId: invoiceNumber,
    });
  }

  /**
   * Send payment confirmation
   */
  async sendPaymentConfirmation(
    tenantId: string,
    parentPhone: string,
    parentName: string,
    invoiceNumber: string,
    amount: number,
    paymentReference: string,
    organizationName: string,
  ): Promise<TwilioMessageResult> {
    const formattedAmount = `R${amount.toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
    })}`;

    const body = `Hello ${parentName},

Thank you! We have received your payment of ${formattedAmount} for invoice ${invoiceNumber}.

Payment Reference: ${paymentReference}
Date: ${new Date().toLocaleDateString('en-ZA')}

- ${organizationName}`;

    return this.sendMessage(parentPhone, body, {
      tenantId,
      contextType: WhatsAppContextType.INVOICE, // Payment confirmations relate to invoices
      contextId: paymentReference,
    });
  }

  /**
   * Send monthly statement
   */
  async sendStatementNotification(
    tenantId: string,
    parentPhone: string,
    parentName: string,
    statementPeriod: string,
    openingBalance: number,
    closingBalance: number,
    organizationName: string,
    pdfUrl?: string,
  ): Promise<TwilioMessageResult> {
    const formatCurrency = (n: number) =>
      `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;

    const body = `Hello ${parentName},

Your account statement for ${statementPeriod} is now available.

Opening Balance: ${formatCurrency(openingBalance)}
Closing Balance: ${formatCurrency(closingBalance)}

${pdfUrl ? `View Statement: ${pdfUrl}` : ''}

- ${organizationName}`;

    return this.sendMessage(parentPhone, body, {
      tenantId,
      contextType: WhatsAppContextType.STATEMENT,
      contextId: statementPeriod,
      mediaUrl: pdfUrl,
    });
  }

  /**
   * Send welcome message after enrollment
   */
  async sendWelcomeMessage(
    tenantId: string,
    parentPhone: string,
    parentName: string,
    childName: string,
    crecheName: string,
  ): Promise<TwilioMessageResult> {
    const body = `Welcome to ${crecheName}, ${parentName}!

Thank you for enrolling ${childName} with us.

You will receive invoices and important updates via WhatsApp.

To stop receiving messages, reply STOP at any time.

- ${crecheName}`;

    return this.sendMessage(parentPhone, body, {
      tenantId,
      contextType: WhatsAppContextType.WELCOME, // Welcome message for enrollments
      contextId: childName,
    });
  }

  /**
   * Handle Twilio webhook status callback
   */
  async handleStatusCallback(payload: {
    MessageSid: string;
    MessageStatus: string;
    ErrorCode?: string;
    ErrorMessage?: string;
  }): Promise<void> {
    this.logger.log({
      message: 'Twilio status callback received',
      messageSid: payload.MessageSid,
      status: payload.MessageStatus,
    });

    // Map Twilio status to our status
    const statusMap: Record<string, WhatsAppMessageStatus> = {
      queued: WhatsAppMessageStatus.SENT,
      sending: WhatsAppMessageStatus.SENT,
      sent: WhatsAppMessageStatus.SENT,
      delivered: WhatsAppMessageStatus.DELIVERED,
      read: WhatsAppMessageStatus.READ,
      failed: WhatsAppMessageStatus.FAILED,
      undelivered: WhatsAppMessageStatus.FAILED,
    };

    const status =
      statusMap[payload.MessageStatus] || WhatsAppMessageStatus.SENT;

    // Update message history if entity is available
    if (this.messageEntity) {
      await this.messageEntity.updateStatus({
        wamid: payload.MessageSid,
        status,
        timestamp: new Date(),
        errorCode: payload.ErrorCode,
        errorMessage: payload.ErrorMessage,
      });
    }
  }

  /**
   * Verify Twilio webhook signature
   * @see https://www.twilio.com/docs/usage/webhooks/webhooks-security
   */
  verifyWebhookSignature(
    signature: string,
    url: string,
    params: Record<string, string>,
  ): boolean {
    const config = this.ensureConfigured();

    // Sort params alphabetically and concatenate
    const sortedParams = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], '');

    const data = url + sortedParams;

    // Create HMAC-SHA1 signature
    const expectedSignature = crypto
      .createHmac('sha1', config.authToken)
      .update(data, 'utf-8')
      .digest('base64');

    return signature === expectedSignature;
  }

  // ============================================================================
  // RICH TEMPLATE METHODS (TASK-WA-008)
  // ============================================================================

  /**
   * Format amount in cents to display format
   * @example formatAmount(245000) => "2,450.00"
   */
  private formatAmount(cents: number): string {
    return (cents / 100).toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  /**
   * Format date for display
   * @example formatDate(new Date('2026-02-28')) => "28 February 2026"
   */
  private formatDate(date: Date): string {
    return date.toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  /**
   * Get billing period from date (month and year)
   * @example getBillingPeriod(new Date('2026-02-28')) => "February 2026"
   */
  private getBillingPeriod(date: Date): string {
    return date.toLocaleDateString('en-ZA', {
      month: 'long',
      year: 'numeric',
    });
  }

  /**
   * Send rich invoice notification with PDF card and action buttons
   * Uses INVOICE_WITH_DOCUMENT template with tenant branding
   *
   * Falls back to legacy text if content service unavailable
   */
  async sendRichInvoiceNotification(
    tenantId: string,
    recipientPhone: string,
    data: {
      parentName: string;
      invoiceNumber: string;
      childName: string;
      amount: number; // In cents
      dueDate: Date;
      pdfUrl: string;
    },
  ): Promise<TwilioMessageResult> {
    // Get tenant for branding
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return {
        success: false,
        error: 'Tenant not found',
        errorCode: 'TENANT_NOT_FOUND',
      };
    }

    // Check if content service and template are available
    const template = this.contentService?.getTemplate(
      TEMPLATE_NAMES.INVOICE_WITH_DOCUMENT,
    );

    if (!this.contentService || !template) {
      // Fallback to legacy text message
      this.logger.debug(
        'Rich template not available, using legacy text message',
      );
      return this.sendInvoiceNotification(
        tenantId,
        recipientPhone,
        data.parentName,
        data.invoiceNumber,
        data.amount / 100,
        data.dueDate,
        tenant.tradingName || tenant.name,
        data.pdfUrl,
      );
    }

    const variables: ContentVariable[] = [
      { key: '1', value: data.invoiceNumber },
      { key: '2', value: this.formatDate(data.dueDate) },
      { key: '3', value: data.parentName },
      { key: '4', value: this.getBillingPeriod(data.dueDate) },
      { key: '5', value: this.formatAmount(data.amount) },
      { key: '6', value: data.childName },
      { key: '7', value: tenant.tradingName || tenant.name },
    ];

    const result = await this.contentService.sendContentMessage(
      recipientPhone,
      template.sid,
      variables,
      tenantId,
      WhatsAppContextType.INVOICE,
      data.invoiceNumber,
    );

    return {
      success: result.success,
      messageId: result.messageSid,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  /**
   * Send rich payment reminder with quick reply buttons
   * Uses PAYMENT_REMINDER_INTERACTIVE or escalated templates based on days overdue
   */
  async sendRichPaymentReminder(
    tenantId: string,
    recipientPhone: string,
    data: {
      parentName: string;
      childName: string;
      invoiceNumber: string;
      amount: number; // In cents
      daysOverdue: number;
      originalDueDate: Date;
    },
  ): Promise<TwilioMessageResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return {
        success: false,
        error: 'Tenant not found',
        errorCode: 'TENANT_NOT_FOUND',
      };
    }

    // Select template based on days overdue
    let templateName: string;
    if (data.daysOverdue <= 7) {
      templateName = TEMPLATE_NAMES.REMINDER_FRIENDLY;
    } else if (data.daysOverdue <= 14) {
      templateName = TEMPLATE_NAMES.REMINDER_FIRM;
    } else {
      templateName = TEMPLATE_NAMES.REMINDER_FINAL;
    }

    const template = this.contentService?.getTemplate(templateName);

    if (!this.contentService || !template) {
      // Fallback to legacy text message
      return this.sendPaymentReminder(
        tenantId,
        recipientPhone,
        data.parentName,
        data.invoiceNumber,
        data.amount / 100,
        data.daysOverdue,
        tenant.tradingName || tenant.name,
      );
    }

    let variables: ContentVariable[];

    if (templateName === TEMPLATE_NAMES.REMINDER_FRIENDLY) {
      // REMINDER_FRIENDLY: parentName, amount, childName, dueDate, invoiceNumber, tenantName
      variables = [
        { key: '1', value: data.parentName },
        { key: '2', value: this.formatAmount(data.amount) },
        { key: '3', value: data.childName },
        { key: '4', value: this.formatDate(data.originalDueDate) },
        { key: '5', value: data.invoiceNumber },
        { key: '6', value: tenant.tradingName || tenant.name },
      ];
    } else if (templateName === TEMPLATE_NAMES.REMINDER_FIRM) {
      // REMINDER_FIRM: parentName, daysOverdue, amount, invoiceNumber, tenantName
      variables = [
        { key: '1', value: data.parentName },
        { key: '2', value: data.daysOverdue.toString() },
        { key: '3', value: this.formatAmount(data.amount) },
        { key: '4', value: data.invoiceNumber },
        { key: '5', value: tenant.tradingName || tenant.name },
      ];
    } else {
      // REMINDER_FINAL: parentFullName, daysOverdue, amount, invoiceNumber, tenantName
      const parentFullName = data.parentName; // Assume full name provided
      variables = [
        { key: '1', value: parentFullName },
        { key: '2', value: data.daysOverdue.toString() },
        { key: '3', value: this.formatAmount(data.amount) },
        { key: '4', value: data.invoiceNumber },
        { key: '5', value: tenant.tradingName || tenant.name },
      ];
    }

    const result = await this.contentService.sendContentMessage(
      recipientPhone,
      template.sid,
      variables,
      tenantId,
      WhatsAppContextType.REMINDER,
      data.invoiceNumber,
    );

    return {
      success: result.success,
      messageId: result.messageSid,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  /**
   * Send rich payment confirmation with receipt card
   * Uses PAYMENT_CONFIRMATION template with tenant branding
   */
  async sendRichPaymentConfirmation(
    tenantId: string,
    recipientPhone: string,
    data: {
      parentName: string;
      receiptNumber: string;
      amount: number; // In cents
      paymentReference: string;
      paymentDate: Date;
      invoiceNumber: string;
      remainingBalance: number; // In cents
      receiptPdfUrl?: string;
    },
  ): Promise<TwilioMessageResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return {
        success: false,
        error: 'Tenant not found',
        errorCode: 'TENANT_NOT_FOUND',
      };
    }

    const template = this.contentService?.getTemplate(
      TEMPLATE_NAMES.PAYMENT_CONFIRMATION,
    );

    if (!this.contentService || !template) {
      // Fallback to legacy text message
      return this.sendPaymentConfirmation(
        tenantId,
        recipientPhone,
        data.parentName,
        data.invoiceNumber,
        data.amount / 100,
        data.paymentReference,
        tenant.tradingName || tenant.name,
      );
    }

    const variables: ContentVariable[] = [
      { key: '1', value: data.parentName },
      { key: '2', value: this.formatAmount(data.amount) },
      { key: '3', value: this.formatDate(data.paymentDate) },
      { key: '4', value: data.invoiceNumber },
      { key: '5', value: tenant.tradingName || tenant.name },
    ];

    const result = await this.contentService.sendContentMessage(
      recipientPhone,
      template.sid,
      variables,
      tenantId,
      WhatsAppContextType.INVOICE,
      data.receiptNumber,
    );

    return {
      success: result.success,
      messageId: result.messageSid,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  /**
   * Send rich arrears notice with call-to-action buttons
   * Uses ARREARS_NOTICE template with tenant branding
   */
  async sendRichArrearsNotice(
    tenantId: string,
    recipientPhone: string,
    data: {
      parentFullName: string;
      parentId: string;
      daysOverdue: number;
      totalAmount: number; // In cents
      oldestInvoiceNumber: string;
      unpaidInvoiceCount: number;
    },
  ): Promise<TwilioMessageResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return {
        success: false,
        error: 'Tenant not found',
        errorCode: 'TENANT_NOT_FOUND',
      };
    }

    const template = this.contentService?.getTemplate(
      TEMPLATE_NAMES.ARREARS_NOTICE,
    );

    if (!this.contentService || !template) {
      // Fallback to legacy text message using sendPaymentReminder with URGENT
      return this.sendPaymentReminder(
        tenantId,
        recipientPhone,
        data.parentFullName,
        data.oldestInvoiceNumber,
        data.totalAmount / 100,
        data.daysOverdue,
        tenant.tradingName || tenant.name,
      );
    }

    const variables: ContentVariable[] = [
      { key: '1', value: data.parentFullName },
      { key: '2', value: data.daysOverdue.toString() },
      { key: '3', value: this.formatAmount(data.totalAmount) },
      { key: '4', value: data.oldestInvoiceNumber },
      { key: '5', value: data.unpaidInvoiceCount.toString() },
      { key: '6', value: tenant.tradingName || tenant.name },
      { key: '7', value: data.parentId },
    ];

    const result = await this.contentService.sendContentMessage(
      recipientPhone,
      template.sid,
      variables,
      tenantId,
      WhatsAppContextType.ARREARS,
      data.oldestInvoiceNumber,
    );

    return {
      success: result.success,
      messageId: result.messageSid,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  /**
   * Send rich welcome message for new enrollments
   * Uses WELCOME_ENROLLMENT template with tenant branding
   */
  async sendRichWelcomeMessage(
    tenantId: string,
    recipientPhone: string,
    data: {
      parentName: string;
      childName: string;
      startDate: Date;
      monthlyFee: number; // In cents
      feeStructure: string;
      onboardToken?: string;
      bannerImageUrl?: string;
    },
  ): Promise<TwilioMessageResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return {
        success: false,
        error: 'Tenant not found',
        errorCode: 'TENANT_NOT_FOUND',
      };
    }

    const template = this.contentService?.getTemplate(
      TEMPLATE_NAMES.WELCOME_ENROLLMENT,
    );

    if (!this.contentService || !template) {
      // Fallback to legacy text message
      return this.sendWelcomeMessage(
        tenantId,
        recipientPhone,
        data.parentName,
        data.childName,
        tenant.tradingName || tenant.name,
      );
    }

    const variables: ContentVariable[] = [
      { key: '1', value: tenant.tradingName || tenant.name },
      { key: '2', value: data.parentName },
      { key: '3', value: data.childName },
      { key: '4', value: this.formatDate(data.startDate) },
      { key: '5', value: this.formatAmount(data.monthlyFee) },
      { key: '6', value: data.feeStructure },
      { key: '7', value: data.onboardToken || '' },
    ];

    const result = await this.contentService.sendContentMessage(
      recipientPhone,
      template.sid,
      variables,
      tenantId,
      WhatsAppContextType.WELCOME,
      data.childName,
    );

    return {
      success: result.success,
      messageId: result.messageSid,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  /**
   * Send rich statement notification with PDF card
   * Uses STATEMENT_NOTIFICATION template with tenant branding
   */
  async sendRichStatementNotification(
    tenantId: string,
    recipientPhone: string,
    data: {
      parentName: string;
      period: string; // e.g., "February 2026"
      periodStart: Date;
      periodEnd: Date;
      openingBalance: number; // In cents
      charges: number; // In cents
      payments: number; // In cents
      closingBalance: number; // In cents
      statementPdfUrl: string;
      statementId: string;
    },
  ): Promise<TwilioMessageResult> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (!tenant) {
      return {
        success: false,
        error: 'Tenant not found',
        errorCode: 'TENANT_NOT_FOUND',
      };
    }

    const template = this.contentService?.getTemplate(
      TEMPLATE_NAMES.STATEMENT_NOTIFICATION,
    );

    if (!this.contentService || !template) {
      // Fallback to legacy text message
      return this.sendStatementNotification(
        tenantId,
        recipientPhone,
        data.parentName,
        data.period,
        data.openingBalance / 100,
        data.closingBalance / 100,
        tenant.tradingName || tenant.name,
        data.statementPdfUrl,
      );
    }

    const variables: ContentVariable[] = [
      { key: '1', value: data.period },
      { key: '2', value: this.formatDate(data.periodStart) },
      { key: '3', value: this.formatDate(data.periodEnd) },
      { key: '4', value: data.parentName },
      { key: '5', value: this.formatAmount(data.openingBalance) },
      { key: '6', value: this.formatAmount(data.charges) },
      { key: '7', value: this.formatAmount(data.payments) },
      { key: '8', value: this.formatAmount(data.closingBalance) },
      { key: '9', value: data.statementId },
      { key: '10', value: tenant.tradingName || tenant.name },
    ];

    const result = await this.contentService.sendContentMessage(
      recipientPhone,
      template.sid,
      variables,
      tenantId,
      WhatsAppContextType.STATEMENT,
      data.statementId,
    );

    return {
      success: result.success,
      messageId: result.messageSid,
      error: result.error,
      errorCode: result.errorCode,
    };
  }
}
