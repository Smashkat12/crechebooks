/**
 * SMS Channel Adapter
 * TASK-NOTIF-001: SMS Channel Adapter Implementation
 *
 * Implements INotificationChannel for SMS delivery.
 * Uses ISmsGateway for provider abstraction (Africa's Talking, Twilio, etc.)
 *
 * Features:
 * - South African phone number validation (+27, 27, 0 formats)
 * - E.164 phone formatting
 * - POPIA compliance (opt-in check)
 * - Retry logic with exponential backoff
 * - Comprehensive error logging
 */

import { Injectable, Logger, Inject } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { INotificationChannel } from '../interfaces/notification-channel.interface';
import type { ISmsGateway } from '../interfaces/sms-gateway.interface';
import { SMS_GATEWAY_TOKEN } from '../interfaces/sms-gateway.interface';
import {
  NotificationChannelType,
  Notification,
  DeliveryResult,
  NotificationDeliveryStatus,
} from '../types/notification.types';
import { BusinessException } from '../../shared/exceptions';

/** Maximum retry attempts for transient failures */
const MAX_RETRIES = 3;
/** Initial retry delay in milliseconds */
const INITIAL_RETRY_DELAY_MS = 1000;
/** Maximum SMS length for single message (GSM-7 encoding) */
const SINGLE_SMS_MAX_LENGTH = 160;

@Injectable()
export class SmsChannelAdapter implements INotificationChannel {
  private readonly logger = new Logger(SmsChannelAdapter.name);
  readonly channelType = NotificationChannelType.SMS;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SMS_GATEWAY_TOKEN)
    private readonly smsGateway: ISmsGateway,
  ) {}

  /**
   * Check if SMS channel is available for parent
   * Validates: phone number exists, opt-in status, gateway configured
   */
  async isAvailable(recipientId: string): Promise<boolean> {
    try {
      const parent = await this.prisma.parent.findUnique({
        where: { id: recipientId },
        select: {
          phone: true,
          smsOptIn: true,
        },
      });

      if (!parent) {
        return false;
      }

      // Check POPIA opt-in compliance
      if (!parent.smsOptIn) {
        return false;
      }

      // Check if phone number is available
      if (!parent.phone) {
        return false;
      }

      // Validate phone number format
      try {
        this.validateSouthAfricanPhone(parent.phone);
      } catch {
        return false;
      }

      // Check if SMS gateway is configured
      if (!this.smsGateway.isConfigured()) {
        this.logger.warn('SMS gateway not configured');
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error({
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'UnknownError',
        },
        file: 'sms-channel.adapter.ts',
        function: 'isAvailable',
        inputs: { recipientId },
        timestamp: new Date().toISOString(),
      });
      return false;
    }
  }

  /**
   * Send notification via SMS
   * Includes retry logic for transient failures
   */
  async send(notification: Notification): Promise<DeliveryResult> {
    const startTime = Date.now();

    try {
      // 1. Get parent SMS details
      const parent = await this.prisma.parent.findUnique({
        where: { id: notification.recipientId },
        select: {
          id: true,
          phone: true,
          smsOptIn: true,
          firstName: true,
          lastName: true,
        },
      });

      if (!parent) {
        this.logger.error({
          error: {
            message: 'Parent not found',
            name: 'NotFoundError',
          },
          file: 'sms-channel.adapter.ts',
          function: 'send',
          inputs: { recipientId: notification.recipientId },
          timestamp: new Date().toISOString(),
        });
        throw new BusinessException(
          `Parent ${notification.recipientId} not found`,
          'PARENT_NOT_FOUND',
        );
      }

      // 2. Check POPIA opt-in
      if (!parent.smsOptIn) {
        throw new BusinessException(
          'Parent has not opted in to SMS messages (POPIA compliance)',
          'SMS_OPT_IN_REQUIRED',
        );
      }

      // 3. Validate and format phone number
      if (!parent.phone) {
        throw new BusinessException(
          'Parent phone number not available',
          'PHONE_NUMBER_MISSING',
        );
      }

      const formattedPhone = this.formatToE164(parent.phone);

      // 4. Warn if message exceeds single SMS
      if (notification.body.length > SINGLE_SMS_MAX_LENGTH) {
        const segments = Math.ceil(notification.body.length / 153); // Concatenated SMS = 153 chars
        this.logger.warn(
          `SMS message exceeds 160 chars (${notification.body.length}), will be split into ${segments} segments`,
        );
      }

      // 5. Send with retry logic
      const result = await this.sendWithRetry(
        formattedPhone,
        notification.body,
        MAX_RETRIES,
      );

      const duration = Date.now() - startTime;
      this.logger.log({
        message: 'SMS sent successfully',
        recipientId: notification.recipientId,
        phone: this.maskPhone(formattedPhone),
        messageId: result.messageId,
        duration: `${duration}ms`,
      });

      return {
        success: true,
        channelUsed: NotificationChannelType.SMS,
        messageId: result.messageId,
        status: NotificationDeliveryStatus.SENT,
        sentAt: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode =
        error instanceof BusinessException ? error.code : 'SMS_SEND_FAILED';

      this.logger.error({
        error: {
          message: errorMessage,
          name: error instanceof Error ? error.name : 'UnknownError',
          code: errorCode,
        },
        file: 'sms-channel.adapter.ts',
        function: 'send',
        inputs: { recipientId: notification.recipientId },
        timestamp: new Date().toISOString(),
      });

      return {
        success: false,
        channelUsed: NotificationChannelType.SMS,
        status: NotificationDeliveryStatus.FAILED,
        error: errorMessage,
        errorCode,
      };
    }
  }

  /**
   * Get delivery status for SMS message
   * Note: Status is typically updated via gateway webhooks
   */
  async getDeliveryStatus(messageId: string): Promise<NotificationDeliveryStatus> {
    // For now, we return SENT status
    // In production, this would query a message tracking table
    // updated by gateway webhook callbacks
    this.logger.debug(`Getting delivery status for message: ${messageId}`);
    return NotificationDeliveryStatus.SENT;
  }

  /**
   * Send SMS with retry logic for transient failures
   */
  private async sendWithRetry(
    phone: string,
    message: string,
    maxRetries: number,
  ): Promise<{ messageId: string }> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(
          `SMS send attempt ${attempt}/${maxRetries} to ${this.maskPhone(phone)}`,
        );

        const result = await this.smsGateway.send(phone, message, {
          senderId: 'CrecheBooks',
          priority: 'normal',
        });

        // Check for success statuses
        if (
          result.status === 'sent' ||
          result.status === 'queued' ||
          result.status === 'delivered'
        ) {
          return { messageId: result.messageId };
        }

        // Non-retryable failure (rejected, invalid number, etc.)
        if (result.status === 'rejected') {
          throw new BusinessException(
            result.errorMessage || 'SMS rejected by carrier',
            result.errorCode || 'SMS_REJECTED',
          );
        }

        // Retryable failure
        lastError = new Error(result.errorMessage || 'SMS send failed');
        this.logger.warn(
          `SMS send failed (attempt ${attempt}): ${result.errorMessage}`,
        );
      } catch (error) {
        if (error instanceof BusinessException) {
          // Non-retryable business errors
          throw error;
        }
        lastError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `SMS send error (attempt ${attempt}): ${lastError.message}`,
        );
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        await this.delay(delay);
      }
    }

    // All retries exhausted
    throw new BusinessException(
      `SMS send failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`,
      'SMS_MAX_RETRIES_EXCEEDED',
    );
  }

  /**
   * Validate South African phone number
   * Accepts: +27XXXXXXXXX, 27XXXXXXXXX, 0XXXXXXXXX
   */
  private validateSouthAfricanPhone(phone: string): void {
    // Remove spaces, dashes, and parentheses
    const cleaned = phone.replace(/[\s\-()]/g, '');

    // South African number patterns
    const patterns = [
      /^\+27\d{9}$/, // +27XXXXXXXXX (E.164)
      /^27\d{9}$/, // 27XXXXXXXXX
      /^0\d{9}$/, // 0XXXXXXXXX (local)
    ];

    const isValid = patterns.some((p) => p.test(cleaned));

    if (!isValid) {
      throw new BusinessException(
        `Invalid South African phone number: ${phone}. Expected formats: +27XXXXXXXXX, 27XXXXXXXXX, or 0XXXXXXXXX`,
        'INVALID_PHONE_FORMAT',
      );
    }
  }

  /**
   * Format phone number to E.164 format (+27...)
   */
  private formatToE164(phone: string): string {
    // Remove spaces, dashes, and parentheses
    const cleaned = phone.replace(/[\s\-()]/g, '');

    // Validate first
    this.validateSouthAfricanPhone(cleaned);

    // Convert to E.164
    if (cleaned.startsWith('0')) {
      return `+27${cleaned.substring(1)}`;
    }
    if (cleaned.startsWith('27') && !cleaned.startsWith('+27')) {
      return `+${cleaned}`;
    }
    return cleaned;
  }

  /**
   * Mask phone number for logging (privacy)
   */
  private maskPhone(phone: string): string {
    if (phone.length <= 6) return '***';
    return phone.substring(0, 4) + '****' + phone.substring(phone.length - 2);
  }

  /**
   * Promise-based delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
