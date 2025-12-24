/**
 * SMS Channel Adapter (Stub)
 * TASK-INFRA-012: Multi-Channel Notification Service Enhancement
 *
 * Stub implementation for future SMS integration.
 * Currently throws NOT_IMPLEMENTED for all operations.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { INotificationChannel } from '../interfaces/notification-channel.interface';
import {
  NotificationChannelType,
  Notification,
  DeliveryResult,
  NotificationDeliveryStatus,
} from '../types/notification.types';
import { BusinessException } from '../../shared/exceptions';

@Injectable()
export class SmsChannelAdapter implements INotificationChannel {
  private readonly logger = new Logger(SmsChannelAdapter.name);
  readonly channelType = NotificationChannelType.SMS;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Check if SMS channel is available for parent
   */
  async isAvailable(recipientId: string): Promise<boolean> {
    // SMS not yet implemented
    return false;
  }

  /**
   * Send notification via SMS
   */
  async send(notification: Notification): Promise<DeliveryResult> {
    this.logger.error({
      error: {
        message: 'SMS channel not yet implemented',
        name: 'NotImplementedError',
      },
      file: 'sms-channel.adapter.ts',
      function: 'send',
      inputs: { recipientId: notification.recipientId },
      timestamp: new Date().toISOString(),
    });

    throw new BusinessException(
      'SMS notifications are not yet implemented. Please use Email or WhatsApp.',
      'SMS_NOT_IMPLEMENTED',
    );
  }

  /**
   * Get delivery status for SMS
   */
  async getDeliveryStatus(
    messageId: string,
  ): Promise<NotificationDeliveryStatus> {
    throw new BusinessException(
      'SMS notifications are not yet implemented.',
      'SMS_NOT_IMPLEMENTED',
    );
  }
}
