/**
 * Notification Service
 * TASK-INFRA-012: Multi-Channel Notification Service Enhancement
 *
 * Unified notification service with pluggable channel adapters.
 * Features:
 * - Multi-channel delivery (Email, WhatsApp, SMS)
 * - Automatic fallback on failure
 * - Preference-based channel selection
 * - Delivery tracking across channels
 *
 * CRITICAL: Fail fast with detailed error logging.
 */

import { Injectable, Logger } from '@nestjs/common';
import { AuditLogService } from '../database/services/audit-log.service';
import { AuditAction } from '../database/entities/audit-log.entity';
import { INotificationChannel } from './interfaces/notification-channel.interface';
import { EmailChannelAdapter } from './adapters/email-channel.adapter';
import { WhatsAppChannelAdapter } from './adapters/whatsapp-channel.adapter';
import { SmsChannelAdapter } from './adapters/sms-channel.adapter';
import { NotificationPreferenceService } from './notification-preference.service';
import {
  NotificationPayload,
  DeliveryResult,
  NotificationPreferences,
  NotificationChannelType,
  Notification,
  NotificationDeliveryStatus,
  DeliveryAttempt,
} from './types/notification.types';
import { BusinessException } from '../shared/exceptions';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);
  private readonly channels: Map<NotificationChannelType, INotificationChannel>;

  constructor(
    private readonly emailAdapter: EmailChannelAdapter,
    private readonly whatsAppAdapter: WhatsAppChannelAdapter,
    private readonly smsAdapter: SmsChannelAdapter,
    private readonly preferenceService: NotificationPreferenceService,
    private readonly auditLogService: AuditLogService,
  ) {
    // Register all channel adapters
    this.channels = new Map<NotificationChannelType, INotificationChannel>();
    this.channels.set(NotificationChannelType.EMAIL, this.emailAdapter);
    this.channels.set(NotificationChannelType.WHATSAPP, this.whatsAppAdapter);
    this.channels.set(NotificationChannelType.SMS, this.smsAdapter);
  }

  /**
   * Send notification via preferred channel
   *
   * @param tenantId - Tenant ID for audit logging
   * @param notification - Notification payload
   * @returns Delivery result
   */
  async send(
    tenantId: string,
    notification: NotificationPayload,
  ): Promise<DeliveryResult> {
    this.logger.log(
      `Sending notification to parent ${notification.recipientId}`,
    );

    // Get parent preferences
    const preferences = await this.preferenceService.getPreferences(
      notification.recipientId,
    );

    // Get first preferred channel that is available
    for (const channelType of preferences.preferredChannels) {
      const channel = this.channels.get(channelType);
      if (!channel) {
        continue;
      }

      const available = await channel.isAvailable(notification.recipientId);
      if (!available) {
        this.logger.warn(
          `Channel ${channelType} not available for parent ${notification.recipientId}`,
        );
        continue;
      }

      // Send via this channel
      const notificationWithChannel: Notification = {
        ...notification,
        channelType,
        tenantId,
      };

      const result = await channel.send(notificationWithChannel);

      // Log delivery attempt
      await this.logDeliveryAttempt(tenantId, notification.recipientId, result);

      if (result.success) {
        this.logger.log(
          `Notification sent successfully via ${channelType} to parent ${notification.recipientId}`,
        );
        return result;
      }
    }

    // All preferred channels failed
    this.logger.error({
      error: {
        message: 'All preferred channels failed',
        name: 'DeliveryError',
      },
      file: 'notification.service.ts',
      function: 'send',
      inputs: { recipientId: notification.recipientId },
      timestamp: new Date().toISOString(),
    });

    throw new BusinessException(
      `Failed to send notification to parent ${notification.recipientId}: All preferred channels failed`,
      'NOTIFICATION_DELIVERY_FAILED',
    );
  }

  /**
   * Send notification with automatic fallback chain
   * Tries all available channels in fallback order until one succeeds
   *
   * @param tenantId - Tenant ID for audit logging
   * @param notification - Notification payload
   * @returns Delivery result with attempted channels
   */
  async sendWithFallback(
    tenantId: string,
    notification: NotificationPayload,
  ): Promise<DeliveryResult> {
    this.logger.log(
      `Sending notification with fallback to parent ${notification.recipientId}`,
    );

    // Get parent preferences
    const preferences = await this.preferenceService.getPreferences(
      notification.recipientId,
    );

    const attempts: DeliveryAttempt[] = [];
    const attemptedChannels: NotificationChannelType[] = [];

    // Try each channel in fallback order
    for (const channelType of preferences.fallbackOrder) {
      const channel = this.channels.get(channelType);
      if (!channel) {
        continue;
      }

      // Check channel availability
      const available = await channel.isAvailable(notification.recipientId);
      if (!available) {
        this.logger.warn(
          `Channel ${channelType} not available for parent ${notification.recipientId}`,
        );
        continue;
      }

      // Attempt delivery
      attemptedChannels.push(channelType);
      const notificationWithChannel: Notification = {
        ...notification,
        channelType,
        tenantId,
      };

      const result = await channel.send(notificationWithChannel);

      // Record attempt
      attempts.push({
        channelType,
        attemptedAt: new Date(),
        success: result.success,
        messageId: result.messageId,
        error: result.error,
        errorCode: result.errorCode,
      });

      // Log delivery attempt
      await this.logDeliveryAttempt(tenantId, notification.recipientId, result);

      if (result.success) {
        this.logger.log(
          `Notification sent successfully via ${channelType} (fallback) to parent ${notification.recipientId}`,
        );
        return {
          ...result,
          attemptedChannels,
        };
      }

      this.logger.warn(
        `Channel ${channelType} failed, trying next in fallback chain`,
      );
    }

    // All channels failed
    this.logger.error({
      error: {
        message: 'All fallback channels failed',
        name: 'DeliveryError',
      },
      file: 'notification.service.ts',
      function: 'sendWithFallback',
      inputs: { recipientId: notification.recipientId },
      attempts,
      timestamp: new Date().toISOString(),
    });

    throw new BusinessException(
      `Failed to send notification to parent ${notification.recipientId}: All fallback channels exhausted`,
      'NOTIFICATION_DELIVERY_FAILED',
      { attemptedChannels, attempts },
    );
  }

  /**
   * Get notification preferences for a parent
   */
  async getPreferences(parentId: string): Promise<NotificationPreferences> {
    return this.preferenceService.getPreferences(parentId);
  }

  /**
   * Update notification preferences for a parent
   */
  async updatePreferences(
    parentId: string,
    prefs: Partial<NotificationPreferences>,
  ): Promise<void> {
    await this.preferenceService.updatePreferences(parentId, prefs);
  }

  /**
   * Log delivery attempt to audit log
   */
  private async logDeliveryAttempt(
    tenantId: string,
    recipientId: string,
    result: DeliveryResult,
  ): Promise<void> {
    try {
      await this.auditLogService.logAction({
        tenantId,
        entityType: 'Notification',
        entityId: result.messageId ?? `${recipientId}-${Date.now()}`,
        action: AuditAction.CREATE,
        afterValue: {
          recipientId,
          channel: result.channelUsed,
          status: result.status,
          success: result.success,
          messageId: result.messageId,
          sentAt: result.sentAt?.toISOString(),
          error: result.error,
          errorCode: result.errorCode,
        },
        changeSummary: result.success
          ? `Notification sent via ${result.channelUsed} to parent ${recipientId}`
          : `Notification failed via ${result.channelUsed} to parent ${recipientId}: ${result.error}`,
      });
    } catch (error) {
      // Don't fail the notification if audit logging fails
      this.logger.error(
        `Failed to log delivery attempt: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
