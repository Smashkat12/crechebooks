/**
 * Webhook Service
 * TASK-BILL-035: Delivery Status Webhook Handlers
 *
 * @description Processes delivery webhooks from email and WhatsApp providers.
 * Verifies signatures, extracts events, and updates invoice delivery status.
 *
 * CRITICAL: Verify webhook signatures before processing.
 * CRITICAL: Idempotent processing - handle out-of-order events.
 * CRITICAL: All operations must filter by tenantId for multi-tenant isolation.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { PrismaService } from '../database/prisma/prisma.service';
import { AuditLogService } from '../database/services/audit-log.service';
import { AuditAction } from '../database/entities/audit-log.entity';
import { BusinessException } from '../shared/exceptions';
import {
  EmailEvent,
  WhatsAppEvent,
  WhatsAppWebhookPayload,
  WebhookProcessingResult,
  DeliveryStatus,
  mapEmailEventToStatus,
  mapWhatsAppStatusToDeliveryStatus,
  mapMailgunEventToStatus,
  shouldUpdateStatus,
  MailgunWebhookEvent,
  MailgunEventData,
} from './types/webhook.types';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly sendgridWebhookKey: string | undefined;
  private readonly whatsappAppSecret: string | undefined;
  private readonly whatsappVerifyToken: string | undefined;
  private readonly mailgunWebhookSigningKey: string | undefined;
  private readonly twilioAuthToken: string | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly auditLogService: AuditLogService,
  ) {
    this.sendgridWebhookKey = this.configService.get<string>(
      'SENDGRID_WEBHOOK_KEY',
    );
    this.whatsappAppSecret = this.configService.get<string>(
      'WHATSAPP_APP_SECRET',
    );
    this.whatsappVerifyToken = this.configService.get<string>(
      'WHATSAPP_VERIFY_TOKEN',
    );
    this.mailgunWebhookSigningKey = this.configService.get<string>(
      'MAILGUN_WEBHOOK_SIGNING_KEY',
    );
    this.twilioAuthToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
  }

  /**
   * Verify SendGrid webhook signature
   * @see https://docs.sendgrid.com/for-developers/tracking-events/getting-started-event-webhook-security-features
   *
   * CRITICAL: NEVER skip verification - FAIL FAST if secret not configured
   *
   * @param payload - Raw request body as string
   * @param signature - x-twilio-email-event-webhook-signature header
   * @param timestamp - x-twilio-email-event-webhook-timestamp header
   * @returns true if signature is valid
   * @throws Error if webhook secret not configured (FAIL FAST)
   */
  verifyEmailSignature(
    payload: string,
    signature: string,
    timestamp: string,
  ): boolean {
    // SECURITY: FAIL FAST - Never process webhooks without verification
    if (!this.sendgridWebhookKey) {
      this.logger.error(
        'SECURITY: SendGrid webhook key (SENDGRID_WEBHOOK_KEY) not configured. ' +
          'Webhook signature verification is REQUIRED in ALL environments. ' +
          'Configure the webhook secret or disable email webhooks.',
      );
      throw new Error(
        'Webhook verification failed: SENDGRID_WEBHOOK_KEY not configured',
      );
    }

    if (!signature || !timestamp) {
      this.logger.warn(
        'Missing signature or timestamp headers in email webhook request',
      );
      return false;
    }

    try {
      // SendGrid uses ECDSA signature verification
      // For HMAC fallback (older setup), use:
      const payloadToSign = timestamp + payload;
      const expectedSignature = crypto
        .createHmac('sha256', this.sendgridWebhookKey)
        .update(payloadToSign)
        .digest('base64');

      // Use constant-time comparison to prevent timing attacks
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );

      if (!isValid) {
        this.logger.warn('Email webhook signature verification failed');
      }

      return isValid;
    } catch (error) {
      this.logger.error('Error verifying email signature', error);
      return false;
    }
  }

  /**
   * Verify Mailgun webhook signature
   * @see https://documentation.mailgun.com/en/latest/user_manual.html#webhooks-1
   *
   * CRITICAL: NEVER skip verification - FAIL FAST if secret not configured
   *
   * @param event - Mailgun webhook event with signature data
   * @returns true if signature is valid
   * @throws Error if webhook secret not configured (FAIL FAST)
   */
  verifyMailgunSignature(event: MailgunWebhookEvent): boolean {
    // SECURITY: FAIL FAST - Never process webhooks without verification
    if (!this.mailgunWebhookSigningKey) {
      this.logger.error(
        'SECURITY: Mailgun webhook signing key (MAILGUN_WEBHOOK_SIGNING_KEY) not configured. ' +
          'Webhook signature verification is REQUIRED in ALL environments. ' +
          'Configure the webhook signing key or disable Mailgun webhooks.',
      );
      throw new Error(
        'Webhook verification failed: MAILGUN_WEBHOOK_SIGNING_KEY not configured',
      );
    }

    const { timestamp, token, signature } = event.signature;

    if (!timestamp || !token || !signature) {
      this.logger.warn('Missing Mailgun signature data in webhook payload');
      return false;
    }

    try {
      // Mailgun signature = HMAC-SHA256(timestamp + token)
      const encodedToken = timestamp + token;
      const expectedSignature = crypto
        .createHmac('sha256', this.mailgunWebhookSigningKey)
        .update(encodedToken)
        .digest('hex');

      // Use constant-time comparison to prevent timing attacks
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );

      if (!isValid) {
        this.logger.warn('Mailgun webhook signature verification failed');
      }

      return isValid;
    } catch (error) {
      this.logger.error('Error verifying Mailgun signature', error);
      return false;
    }
  }

  /**
   * Verify WhatsApp/Meta webhook signature
   * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
   *
   * CRITICAL: NEVER skip verification - FAIL FAST if secret not configured
   *
   * @param payload - Raw request body as string
   * @param signature - x-hub-signature-256 header
   * @returns true if signature is valid
   * @throws Error if webhook secret not configured (FAIL FAST)
   */
  verifyWhatsAppSignature(payload: string, signature: string): boolean {
    // SECURITY: FAIL FAST - Never process webhooks without verification
    if (!this.whatsappAppSecret) {
      this.logger.error(
        'SECURITY: WhatsApp app secret (WHATSAPP_APP_SECRET) not configured. ' +
          'Webhook signature verification is REQUIRED in ALL environments. ' +
          'Configure the app secret or disable WhatsApp webhooks.',
      );
      throw new Error(
        'Webhook verification failed: WHATSAPP_APP_SECRET not configured',
      );
    }

    if (!signature) {
      this.logger.warn('Missing WhatsApp signature header in webhook request');
      return false;
    }

    try {
      // Meta uses sha256 HMAC
      const expectedSignature =
        'sha256=' +
        crypto
          .createHmac('sha256', this.whatsappAppSecret)
          .update(payload)
          .digest('hex');

      // Use constant-time comparison to prevent timing attacks
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );

      if (!isValid) {
        this.logger.warn('WhatsApp webhook signature verification failed');
      }

      return isValid;
    } catch (error) {
      this.logger.error('Error verifying WhatsApp signature', error);
      return false;
    }
  }

  /**
   * Verify WhatsApp webhook subscription
   * Called by Meta during webhook setup
   *
   * @param mode - hub.mode query param (should be 'subscribe')
   * @param token - hub.verify_token query param
   * @param challenge - hub.challenge query param
   * @returns challenge string if valid, throws otherwise
   */
  verifyWhatsAppSubscription(
    mode: string,
    token: string,
    challenge: string,
  ): string {
    if (mode !== 'subscribe') {
      throw new BusinessException(
        'Invalid webhook mode',
        'INVALID_WEBHOOK_MODE',
      );
    }

    if (!this.whatsappVerifyToken) {
      this.logger.warn('WhatsApp verify token not configured');
      throw new BusinessException(
        'Webhook not configured',
        'WEBHOOK_NOT_CONFIGURED',
      );
    }

    if (token !== this.whatsappVerifyToken) {
      throw new BusinessException(
        'Invalid verify token',
        'INVALID_VERIFY_TOKEN',
      );
    }

    this.logger.log('WhatsApp webhook subscription verified');
    return challenge;
  }

  /**
   * Process email delivery events
   *
   * @param events - Array of SendGrid events
   * @returns Processing result with counts and errors
   */
  async processEmailEvent(
    events: EmailEvent[],
  ): Promise<WebhookProcessingResult> {
    const result: WebhookProcessingResult = {
      processed: 0,
      skipped: 0,
      errors: [],
    };

    for (const event of events) {
      try {
        const invoiceId = event.invoiceId;
        const tenantId = event.tenantId;

        // Skip if no invoice ID in custom args
        if (!invoiceId || !tenantId) {
          this.logger.debug(
            `Skipping email event ${event.sg_message_id}: no invoiceId or tenantId`,
          );
          result.skipped++;
          continue;
        }

        // Map event to delivery status
        const newStatus = mapEmailEventToStatus(event.event);
        if (!newStatus) {
          this.logger.debug(
            `Skipping email event ${event.event}: not a status change event`,
          );
          result.skipped++;
          continue;
        }

        // Update delivery status
        await this.updateDeliveryStatus(
          invoiceId,
          tenantId,
          'email',
          newStatus,
          {
            event: event.event,
            messageId: event.sg_message_id,
            email: event.email,
            timestamp: event.timestamp,
            bounceReason: event.reason,
            url: event.url,
          },
        );

        result.processed++;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        result.errors.push({
          eventId: event.sg_message_id || 'unknown',
          error: errorMessage,
        });
        this.logger.error(`Error processing email event: ${errorMessage}`);
      }
    }

    this.logger.log(
      `Email events processed: ${result.processed}, skipped: ${result.skipped}, errors: ${result.errors.length}`,
    );

    return result;
  }

  /**
   * Process Mailgun delivery events
   *
   * @param event - Mailgun webhook event
   * @returns Processing result with counts and errors
   */
  async processMailgunEvent(
    event: MailgunWebhookEvent,
  ): Promise<WebhookProcessingResult> {
    const result: WebhookProcessingResult = {
      processed: 0,
      skipped: 0,
      errors: [],
    };

    const eventData = event['event-data'];

    try {
      // Extract custom variables for document correlation
      const userVariables = eventData['user-variables'] || {};
      const invoiceId = userVariables.invoiceId;
      const statementId = userVariables.statementId;
      const tenantId = userVariables.tenantId;
      const documentType = userVariables.documentType;

      // Skip if no document ID or tenant ID in custom args
      if ((!invoiceId && !statementId) || !tenantId) {
        this.logger.debug(
          `Skipping Mailgun event ${eventData.id}: no document ID or tenantId in user-variables`,
        );
        result.skipped++;
        return result;
      }

      // Map event to delivery status
      const newStatus = mapMailgunEventToStatus(
        eventData.event,
        eventData.severity,
      );
      if (!newStatus) {
        this.logger.debug(
          `Skipping Mailgun event ${eventData.event}: not a status change event`,
        );
        result.skipped++;
        return result;
      }

      // Determine which document type to update
      if (invoiceId) {
        // Update invoice delivery status
        await this.updateDeliveryStatus(
          invoiceId,
          tenantId,
          'email',
          newStatus,
          {
            event: eventData.event,
            messageId: eventData.id,
            email: eventData.recipient,
            timestamp: eventData.timestamp,
            bounceReason:
              eventData.reason || eventData['delivery-status']?.message,
            url: eventData.url,
            severity: eventData.severity,
            clientInfo: eventData['client-info'],
            geolocation: eventData.geolocation,
          },
        );
      } else if (statementId) {
        // Update statement delivery status
        await this.updateStatementDeliveryStatus(
          statementId,
          tenantId,
          newStatus,
          {
            event: eventData.event,
            messageId: eventData.id,
            email: eventData.recipient,
            timestamp: eventData.timestamp,
            bounceReason:
              eventData.reason || eventData['delivery-status']?.message,
            url: eventData.url,
            severity: eventData.severity,
            clientInfo: eventData['client-info'],
            geolocation: eventData.geolocation,
          },
        );
      }

      result.processed++;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      result.errors.push({
        eventId: eventData.id || 'unknown',
        error: errorMessage,
      });
      this.logger.error(`Error processing Mailgun event: ${errorMessage}`);
    }

    this.logger.log(
      `Mailgun event processed: ${result.processed} processed, ${result.skipped} skipped, errors: ${result.errors.length}`,
    );

    return result;
  }

  /**
   * Update statement delivery status from webhook
   *
   * @param statementId - Statement to update
   * @param tenantId - Tenant ID for isolation
   * @param status - New delivery status
   * @param metadata - Additional event metadata
   */
  async updateStatementDeliveryStatus(
    statementId: string,
    tenantId: string,
    status: DeliveryStatus,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    // Get current statement status
    const statement = await this.prisma.statement.findFirst({
      where: {
        id: statementId,
        tenantId, // Tenant isolation
      },
      select: {
        id: true,
        tenantId: true,
        statementNumber: true,
        deliveryStatus: true,
      },
    });

    if (!statement) {
      throw new BusinessException(
        `Statement ${statementId} not found for tenant ${tenantId}`,
        'STATEMENT_NOT_FOUND',
      );
    }

    const currentStatus = statement.deliveryStatus as DeliveryStatus;

    // Check if status should be updated (idempotent/out-of-order handling)
    if (!shouldUpdateStatus(currentStatus, status)) {
      this.logger.debug(
        `Skipping status update for statement ${statementId}: ${currentStatus} -> ${status} (no progression)`,
      );
      return;
    }

    // Update statement delivery status
    await this.prisma.statement.update({
      where: { id: statementId },
      data: {
        deliveryStatus: status,
        ...(status === 'DELIVERED' ||
        status === 'OPENED' ||
        status === 'CLICKED'
          ? { deliveredAt: new Date() }
          : {}),
      },
    });

    // Audit log (statements don't have a separate delivery log table)
    await this.auditLogService.logAction({
      tenantId,
      entityType: 'Statement',
      entityId: statementId,
      action: AuditAction.UPDATE,
      afterValue: {
        deliveryStatus: status,
        channel: 'email',
        ...metadata,
      },
      changeSummary: `Statement ${statement.statementNumber} delivery status updated to ${status} via email`,
    });

    this.logger.log(
      `Updated statement ${statementId} delivery status: ${currentStatus} -> ${status} (email)`,
    );
  }

  /**
   * Process WhatsApp delivery events
   *
   * @param payload - WhatsApp webhook payload
   * @returns Processing result with counts and errors
   */
  async processWhatsAppEvent(
    payload: WhatsAppWebhookPayload,
  ): Promise<WebhookProcessingResult> {
    const result: WebhookProcessingResult = {
      processed: 0,
      skipped: 0,
      errors: [],
    };

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const statuses = change.value.statuses || [];

        for (const status of statuses) {
          try {
            // Look up invoice by WhatsApp message ID
            const messageRecord =
              await this.prisma.invoiceDeliveryLog.findFirst({
                where: {
                  externalMessageId: status.id,
                  channel: 'WHATSAPP',
                },
                select: {
                  invoiceId: true,
                  tenantId: true,
                },
              });

            if (!messageRecord) {
              this.logger.debug(
                `Skipping WhatsApp status ${status.id}: no matching delivery log`,
              );
              result.skipped++;
              continue;
            }

            // Map status to delivery status
            const newStatus = mapWhatsAppStatusToDeliveryStatus(status.status);
            if (!newStatus) {
              this.logger.debug(
                `Skipping WhatsApp status ${status.status}: not a tracked status`,
              );
              result.skipped++;
              continue;
            }

            // Update delivery status
            await this.updateDeliveryStatus(
              messageRecord.invoiceId,
              messageRecord.tenantId,
              'whatsapp',
              newStatus,
              {
                event: status.status,
                messageId: status.id,
                recipientId: status.recipient_id,
                timestamp: status.timestamp,
                error: status.errors?.[0],
              },
            );

            result.processed++;
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            result.errors.push({
              eventId: status.id || 'unknown',
              error: errorMessage,
            });
            this.logger.error(
              `Error processing WhatsApp event: ${errorMessage}`,
            );
          }
        }
      }
    }

    this.logger.log(
      `WhatsApp events processed: ${result.processed}, skipped: ${result.skipped}, errors: ${result.errors.length}`,
    );

    return result;
  }

  /**
   * Update invoice delivery status from webhook
   * Handles idempotent updates and out-of-order events
   *
   * @param invoiceId - Invoice to update
   * @param tenantId - Tenant ID for isolation
   * @param channel - Delivery channel
   * @param status - New delivery status
   * @param metadata - Additional event metadata
   */
  async updateDeliveryStatus(
    invoiceId: string,
    tenantId: string,
    channel: 'email' | 'whatsapp',
    status: DeliveryStatus,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    // Get current invoice status
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        tenantId, // Tenant isolation
      },
      select: {
        id: true,
        tenantId: true,
        invoiceNumber: true,
        deliveryStatus: true,
      },
    });

    if (!invoice) {
      throw new BusinessException(
        `Invoice ${invoiceId} not found for tenant ${tenantId}`,
        'INVOICE_NOT_FOUND',
      );
    }

    const currentStatus = invoice.deliveryStatus as DeliveryStatus;

    // Check if status should be updated (idempotent/out-of-order handling)
    if (!shouldUpdateStatus(currentStatus, status)) {
      this.logger.debug(
        `Skipping status update for invoice ${invoiceId}: ${currentStatus} -> ${status} (no progression)`,
      );
      return;
    }

    // Update invoice delivery status
    await this.prisma.invoice.update({
      where: { id: invoiceId },
      data: {
        deliveryStatus: status,
        ...(status === 'DELIVERED' ||
        status === 'OPENED' ||
        status === 'CLICKED'
          ? { deliveredAt: new Date() }
          : {}),
      },
    });

    // Log the delivery event
    await this.prisma.invoiceDeliveryLog.create({
      data: {
        invoiceId,
        tenantId,
        channel: channel.toUpperCase(),
        status,
        eventType: typeof metadata.event === 'string' ? metadata.event : status,
        externalMessageId:
          typeof metadata.messageId === 'string' ? metadata.messageId : '',
        metadata: JSON.parse(JSON.stringify(metadata)),
        occurredAt: metadata.timestamp
          ? new Date(Number(metadata.timestamp) * 1000)
          : new Date(),
      },
    });

    // Audit log
    await this.auditLogService.logAction({
      tenantId,
      entityType: 'Invoice',
      entityId: invoiceId,
      action: AuditAction.UPDATE,
      afterValue: {
        deliveryStatus: status,
        channel,
        ...metadata,
      },
      changeSummary: `Invoice ${invoice.invoiceNumber} delivery status updated to ${status} via ${channel}`,
    });

    this.logger.log(
      `Updated invoice ${invoiceId} delivery status: ${currentStatus} -> ${status} (${channel})`,
    );
  }

  /**
   * Get delivery analytics for a tenant
   *
   * @param tenantId - Tenant ID
   * @param startDate - Start of period
   * @param endDate - End of period
   * @returns Aggregated delivery statistics
   */
  async getDeliveryAnalytics(
    tenantId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<{
    totalSent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    complained: number;
    failed: number;
    deliveryRate: number;
    openRate: number;
    clickRate: number;
  }> {
    const stats = await this.prisma.invoice.groupBy({
      by: ['deliveryStatus'],
      where: {
        tenantId,
        deliveredAt: {
          gte: startDate,
          lte: endDate,
        },
        deliveryStatus: {
          not: 'PENDING',
        },
      },
      _count: {
        id: true,
      },
    });

    const counts: Record<string, number> = {};
    let totalSent = 0;

    for (const stat of stats) {
      if (stat.deliveryStatus) {
        counts[stat.deliveryStatus] = stat._count.id;
        totalSent += stat._count.id;
      }
    }

    const delivered = counts['DELIVERED'] || 0;
    const opened = counts['OPENED'] || 0;
    const clicked = counts['CLICKED'] || 0;
    const bounced = counts['BOUNCED'] || 0;
    const complained = counts['COMPLAINED'] || 0;
    const failed = counts['FAILED'] || 0;

    return {
      totalSent,
      delivered,
      opened,
      clicked,
      bounced,
      complained,
      failed,
      deliveryRate:
        totalSent > 0 ? ((delivered + opened + clicked) / totalSent) * 100 : 0,
      openRate: delivered > 0 ? ((opened + clicked) / delivered) * 100 : 0,
      clickRate: opened > 0 ? (clicked / opened) * 100 : 0,
    };
  }

  /**
   * Verify Twilio webhook signature
   * @see https://www.twilio.com/docs/usage/webhooks/webhooks-security
   *
   * @param url - Full webhook URL
   * @param params - Request body parameters
   * @param signature - X-Twilio-Signature header
   * @returns true if signature is valid
   */
  verifyTwilioSignature(
    url: string,
    params: Record<string, string>,
    signature: string,
  ): boolean {
    if (!this.twilioAuthToken) {
      this.logger.warn(
        'Twilio auth token (TWILIO_AUTH_TOKEN) not configured. Skipping signature verification.',
      );
      // In development, allow without signature
      return process.env.NODE_ENV !== 'production';
    }

    if (!signature) {
      this.logger.warn('Missing Twilio signature header in webhook request');
      return false;
    }

    try {
      // Build the data string: URL + sorted POST params
      let data = url;
      const sortedKeys = Object.keys(params).sort();
      for (const key of sortedKeys) {
        data += key + params[key];
      }

      // Calculate HMAC-SHA1
      const expectedSignature = crypto
        .createHmac('sha1', this.twilioAuthToken)
        .update(data, 'utf-8')
        .digest('base64');

      const isValid = signature === expectedSignature;

      if (!isValid) {
        this.logger.warn('Twilio webhook signature verification failed');
      }

      return isValid;
    } catch (error) {
      this.logger.error('Error verifying Twilio signature', error);
      return false;
    }
  }

  /**
   * Process Twilio WhatsApp/SMS status callback
   *
   * @param params - Twilio status callback parameters
   * @returns Processing result
   */
  async processTwilioStatusCallback(
    params: Record<string, string>,
  ): Promise<WebhookProcessingResult> {
    const result: WebhookProcessingResult = {
      processed: 0,
      skipped: 0,
      errors: [],
    };

    try {
      const messageSid = params.MessageSid;
      const messageStatus = params.MessageStatus;
      const to = params.To;
      const from = params.From;
      const errorCode = params.ErrorCode;
      const errorMessage = params.ErrorMessage;

      this.logger.log({
        message: 'Twilio status callback received',
        messageSid,
        messageStatus,
        to,
        from,
        errorCode,
        errorMessage,
        timestamp: new Date().toISOString(),
      });

      // Map Twilio status to WhatsApp message status (for WhatsAppMessage table)
      const whatsappStatusMap: Record<
        string,
        'PENDING' | 'SENT' | 'DELIVERED' | 'READ' | 'FAILED'
      > = {
        queued: 'PENDING',
        sent: 'SENT',
        delivered: 'DELIVERED',
        read: 'READ',
        failed: 'FAILED',
        undelivered: 'FAILED',
      };

      // Map Twilio status to delivery status (for Invoice delivery tracking)
      const deliveryStatusMap: Record<string, DeliveryStatus> = {
        queued: 'PENDING',
        sent: 'SENT',
        delivered: 'DELIVERED',
        read: 'OPENED',
        failed: 'FAILED',
        undelivered: 'BOUNCED',
      };

      const waStatus = whatsappStatusMap[messageStatus];
      const deliveryStatus = deliveryStatusMap[messageStatus];
      if (!waStatus) {
        this.logger.debug(
          `Skipping Twilio status ${messageStatus}: not a tracked status`,
        );
        result.skipped++;
        return result;
      }

      // Look up the message by Twilio SID in WhatsApp message history
      const messageRecord = await this.prisma.whatsAppMessage.findFirst({
        where: {
          wamid: messageSid,
        },
        select: {
          id: true,
          tenantId: true,
          parentId: true,
          contextType: true,
          contextId: true,
        },
      });

      if (messageRecord) {
        // Update WhatsApp message status
        await this.prisma.whatsAppMessage.update({
          where: { id: messageRecord.id },
          data: {
            status: waStatus,
            ...(waStatus === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
            ...(waStatus === 'READ' ? { readAt: new Date() } : {}),
            ...(waStatus === 'FAILED'
              ? {
                  errorCode: errorCode || null,
                  errorMessage: errorMessage || null,
                  failedAt: new Date(),
                }
              : {}),
          },
        });

        // If it's an invoice context, update the invoice delivery status too
        if (
          String(messageRecord.contextType) === 'INVOICE' &&
          messageRecord.contextId &&
          deliveryStatus
        ) {
          await this.updateDeliveryStatus(
            messageRecord.contextId,
            messageRecord.tenantId,
            'whatsapp',
            deliveryStatus,
            {
              event: messageStatus,
              messageId: messageSid,
              timestamp: Math.floor(Date.now() / 1000),
              errorCode,
              errorMessage,
            },
          );
        }

        result.processed++;
      } else {
        // No record found - just log for now
        this.logger.debug(
          `No WhatsApp message record found for Twilio SID: ${messageSid}`,
        );

        // Log to audit for tracking
        await this.auditLogService.logAction({
          tenantId: 'system',
          entityType: 'TwilioCallback',
          entityId: messageSid,
          action: AuditAction.CREATE,
          afterValue: {
            messageStatus,
            to,
            from,
            errorCode,
            errorMessage,
            timestamp: new Date().toISOString(),
          },
          changeSummary: `Twilio WhatsApp message ${messageSid} status: ${messageStatus}`,
        });

        result.processed++;
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      result.errors.push({
        eventId: params.MessageSid || 'unknown',
        error: errorMessage,
      });
      this.logger.error(
        `Error processing Twilio status callback: ${errorMessage}`,
      );
    }

    return result;
  }
}
