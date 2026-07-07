/**
 * WhatsApp Provider Service
 * TASK-WA-007: Unified WhatsApp provider facade.
 *
 * Twilio is the only supported provider. The former Meta Cloud API path
 * was dead code (every Meta branch threw META_TEMPLATE_REQUIRED) and has
 * been removed; if WHATSAPP_PROVIDER is set to anything other than
 * 'twilio', all send methods throw a clear configuration error.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { TwilioWhatsAppService } from './twilio-whatsapp.service';
import { BusinessException } from '../../../shared/exceptions';
import {
  WhatsAppContextType,
  WhatsAppMessageStatus,
} from '../types/message-history.types';

/**
 * Provider type enum
 */
export enum WhatsAppProvider {
  META = 'meta',
  TWILIO = 'twilio',
}

/**
 * Common message result interface
 */
export interface WhatsAppProviderResult {
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
  status?: WhatsAppMessageStatus;
}

@Injectable()
export class WhatsAppProviderService implements OnModuleInit {
  private readonly logger = new Logger(WhatsAppProviderService.name);
  private readonly provider: WhatsAppProvider;

  constructor(private readonly twilioService: TwilioWhatsAppService) {
    // Determine provider from environment
    const providerEnv = process.env.WHATSAPP_PROVIDER?.toLowerCase();
    this.provider =
      providerEnv === 'twilio'
        ? WhatsAppProvider.TWILIO
        : WhatsAppProvider.META;
  }

  onModuleInit() {
    this.logger.log(`WhatsApp Provider initialized: ${this.provider}`);

    if (this.provider === WhatsAppProvider.TWILIO) {
      if (!this.twilioService.isConfigured()) {
        this.logger.warn(
          'Twilio provider selected but not configured. Check TWILIO_* environment variables.',
        );
      }
    } else {
      this.logger.warn(
        `WHATSAPP_PROVIDER is '${this.provider}' but only 'twilio' is supported. ` +
          'All WhatsApp sends will fail until WHATSAPP_PROVIDER=twilio is set.',
      );
    }
  }

  /**
   * Get the current provider type
   */
  getProvider(): WhatsAppProvider {
    return this.provider;
  }

  /**
   * Check if the current provider is configured
   */
  isConfigured(): boolean {
    return (
      this.provider === WhatsAppProvider.TWILIO &&
      this.twilioService.isConfigured()
    );
  }

  /**
   * Ensure Twilio is the active provider; throw a configuration error otherwise.
   */
  private ensureTwilio(): void {
    if (this.provider !== WhatsAppProvider.TWILIO) {
      throw new BusinessException(
        `WhatsApp provider '${this.provider}' is not supported. ` +
          'Set WHATSAPP_PROVIDER=twilio and configure TWILIO_* environment variables.',
        'WHATSAPP_PROVIDER_NOT_SUPPORTED',
      );
    }
  }

  /**
   * Send invoice notification
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
  ): Promise<WhatsAppProviderResult> {
    this.logger.log({
      message: `Sending invoice notification via ${this.provider}`,
      invoiceNumber,
      to: parentPhone,
    });
    this.ensureTwilio();

    const result = await this.twilioService.sendInvoiceNotification(
      tenantId,
      parentPhone,
      parentName,
      invoiceNumber,
      amount,
      dueDate,
      organizationName,
      pdfUrl,
    );
    return this.toProviderResult(result);
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
  ): Promise<WhatsAppProviderResult> {
    this.logger.log({
      message: `Sending payment reminder via ${this.provider}`,
      invoiceNumber,
      daysOverdue,
      to: parentPhone,
    });
    this.ensureTwilio();

    const result = await this.twilioService.sendPaymentReminder(
      tenantId,
      parentPhone,
      parentName,
      invoiceNumber,
      amount,
      daysOverdue,
      organizationName,
    );
    return this.toProviderResult(result);
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
  ): Promise<WhatsAppProviderResult> {
    this.logger.log({
      message: `Sending payment confirmation via ${this.provider}`,
      invoiceNumber,
      paymentReference,
      to: parentPhone,
    });
    this.ensureTwilio();

    const result = await this.twilioService.sendPaymentConfirmation(
      tenantId,
      parentPhone,
      parentName,
      invoiceNumber,
      amount,
      paymentReference,
      organizationName,
    );
    return this.toProviderResult(result);
  }

  /**
   * Send statement notification
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
  ): Promise<WhatsAppProviderResult> {
    this.logger.log({
      message: `Sending statement notification via ${this.provider}`,
      statementPeriod,
      to: parentPhone,
    });
    this.ensureTwilio();

    const result = await this.twilioService.sendStatementNotification(
      tenantId,
      parentPhone,
      parentName,
      statementPeriod,
      openingBalance,
      closingBalance,
      organizationName,
      pdfUrl,
    );
    return this.toProviderResult(result);
  }

  /**
   * Send registration welcome message.
   * portalUrl defaults to https://app.crechebooks.co.za/portal when not supplied.
   */
  async sendWelcomeMessage(
    tenantId: string,
    parentPhone: string,
    parentName: string,
    childName: string,
    crecheName: string,
    portalUrl: string = 'https://app.crechebooks.co.za/portal',
  ): Promise<WhatsAppProviderResult> {
    this.logger.log({
      message: `Sending welcome message via ${this.provider}`,
      childName,
      to: parentPhone,
    });
    this.ensureTwilio();

    const result = await this.twilioService.sendWelcomeMessage(
      tenantId,
      parentPhone,
      parentName,
      childName,
      crecheName,
      portalUrl,
    );
    return this.toProviderResult(result);
  }

  /**
   * Send a generic message (free-form text)
   * Note: This only works with Twilio in sandbox mode after user opts in
   */
  async sendMessage(
    to: string,
    body: string,
    options?: {
      tenantId?: string;
      contextType?: WhatsAppContextType;
      contextId?: string;
      mediaUrl?: string;
    },
  ): Promise<WhatsAppProviderResult> {
    this.logger.log({
      message: `Sending generic message via ${this.provider}`,
      to,
      hasMedia: !!options?.mediaUrl,
    });
    this.ensureTwilio();

    const result = await this.twilioService.sendMessage(to, body, options);
    return this.toProviderResult(result);
  }

  /**
   * Get underlying Twilio service
   */
  getTwilioService(): TwilioWhatsAppService {
    return this.twilioService;
  }

  /**
   * Map a Twilio send result to the provider-agnostic result shape.
   */
  private toProviderResult(result: {
    success: boolean;
    messageId?: string;
    error?: string;
    errorCode?: string;
  }): WhatsAppProviderResult {
    return {
      success: result.success,
      messageId: result.messageId,
      error: result.error,
      errorCode: result.errorCode,
      status: result.success
        ? WhatsAppMessageStatus.SENT
        : WhatsAppMessageStatus.FAILED,
    };
  }
}
