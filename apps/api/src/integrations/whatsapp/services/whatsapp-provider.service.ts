/**
 * WhatsApp Provider Service
 * TASK-WA-007: Unified WhatsApp provider that switches between Meta and Twilio
 *
 * This service acts as a facade that delegates to the appropriate provider
 * based on the WHATSAPP_PROVIDER environment variable.
 *
 * Benefits:
 * - Single entry point for all WhatsApp messaging
 * - Easy switching between providers
 * - Consistent API regardless of underlying provider
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WhatsAppService } from '../whatsapp.service';
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

  constructor(
    private readonly metaService: WhatsAppService,
    private readonly twilioService: TwilioWhatsAppService,
  ) {
    // Determine provider from environment
    const providerEnv = process.env.WHATSAPP_PROVIDER?.toLowerCase();
    this.provider =
      providerEnv === 'twilio'
        ? WhatsAppProvider.TWILIO
        : WhatsAppProvider.META;
  }

  onModuleInit() {
    this.logger.log(`WhatsApp Provider initialized: ${this.provider}`);

    // Check if the selected provider is configured
    if (this.provider === WhatsAppProvider.TWILIO) {
      if (!this.twilioService.isConfigured()) {
        this.logger.warn(
          'Twilio provider selected but not configured. Check TWILIO_* environment variables.',
        );
      }
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
    if (this.provider === WhatsAppProvider.TWILIO) {
      return this.twilioService.isConfigured();
    }
    // Meta service will throw on use if not configured
    return true;
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

    if (this.provider === WhatsAppProvider.TWILIO) {
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

    // Meta provider - use the existing WhatsAppService
    // Note: Meta requires template-based messages, so we would need to
    // implement sendInvoiceNotification on MetaService or use sendInvoice
    throw new BusinessException(
      'Invoice notification via Meta requires template setup. Use Twilio for sandbox testing.',
      'META_TEMPLATE_REQUIRED',
    );
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

    if (this.provider === WhatsAppProvider.TWILIO) {
      const result = await this.twilioService.sendPaymentReminder(
        tenantId,
        parentPhone,
        parentName,
        invoiceNumber,
        amount,
        daysOverdue,
        organizationName,
      );
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

    throw new BusinessException(
      'Payment reminder via Meta requires template setup. Use Twilio for sandbox testing.',
      'META_TEMPLATE_REQUIRED',
    );
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

    if (this.provider === WhatsAppProvider.TWILIO) {
      const result = await this.twilioService.sendPaymentConfirmation(
        tenantId,
        parentPhone,
        parentName,
        invoiceNumber,
        amount,
        paymentReference,
        organizationName,
      );
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

    throw new BusinessException(
      'Payment confirmation via Meta requires template setup. Use Twilio for sandbox testing.',
      'META_TEMPLATE_REQUIRED',
    );
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

    if (this.provider === WhatsAppProvider.TWILIO) {
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

    throw new BusinessException(
      'Statement notification via Meta requires template setup. Use Twilio for sandbox testing.',
      'META_TEMPLATE_REQUIRED',
    );
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
  ): Promise<WhatsAppProviderResult> {
    this.logger.log({
      message: `Sending welcome message via ${this.provider}`,
      childName,
      to: parentPhone,
    });

    if (this.provider === WhatsAppProvider.TWILIO) {
      const result = await this.twilioService.sendWelcomeMessage(
        tenantId,
        parentPhone,
        parentName,
        childName,
        crecheName,
      );
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

    throw new BusinessException(
      'Welcome message via Meta requires template setup. Use Twilio for sandbox testing.',
      'META_TEMPLATE_REQUIRED',
    );
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

    if (this.provider === WhatsAppProvider.TWILIO) {
      const result = await this.twilioService.sendMessage(to, body, options);
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

    // Meta requires templates for business-initiated conversations
    throw new BusinessException(
      'Free-form messages via Meta are not supported. WhatsApp Business API requires template messages. Use Twilio for sandbox testing.',
      'META_TEMPLATE_REQUIRED',
    );
  }

  /**
   * Get underlying Meta service (for backwards compatibility)
   */
  getMetaService(): WhatsAppService {
    return this.metaService;
  }

  /**
   * Get underlying Twilio service
   */
  getTwilioService(): TwilioWhatsAppService {
    return this.twilioService;
  }
}
