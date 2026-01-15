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
  shouldUpdateStatus,
} from './types/webhook.types';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);
  private readonly sendgridWebhookKey: string | undefined;
  private readonly whatsappAppSecret: string | undefined;
  private readonly whatsappVerifyToken: string | undefined;

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
        eventType: String(metadata.event || status),
        externalMessageId: String(metadata.messageId || ''),
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
}
