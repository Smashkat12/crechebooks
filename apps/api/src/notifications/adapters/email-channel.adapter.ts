/**
 * Email Channel Adapter
 * TASK-INFRA-012: Multi-Channel Notification Service Enhancement
 *
 * Wraps EmailService to implement INotificationChannel interface.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EmailService } from '../../integrations/email/email.service';
import { INotificationChannel } from '../interfaces/notification-channel.interface';
import {
  NotificationChannelType,
  Notification,
  DeliveryResult,
  NotificationDeliveryStatus,
} from '../types/notification.types';
import { BusinessException } from '../../shared/exceptions';

@Injectable()
export class EmailChannelAdapter implements INotificationChannel {
  private readonly logger = new Logger(EmailChannelAdapter.name);
  readonly channelType = NotificationChannelType.EMAIL;

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Check if email channel is available for parent
   */
  async isAvailable(recipientId: string): Promise<boolean> {
    try {
      const parent = await this.prisma.parent.findUnique({
        where: { id: recipientId },
        select: {
          email: true,
          preferredContact: true,
        },
      });

      if (!parent || !parent.email) {
        return false;
      }

      // Validate email format
      if (!this.emailService.isValidEmail(parent.email)) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error({
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'UnknownError',
        },
        file: 'email-channel.adapter.ts',
        function: 'isAvailable',
        inputs: { recipientId },
        timestamp: new Date().toISOString(),
      });
      return false;
    }
  }

  /**
   * Send notification via email
   */
  async send(notification: Notification): Promise<DeliveryResult> {
    try {
      // Get parent email
      const parent = await this.prisma.parent.findUnique({
        where: { id: notification.recipientId },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      if (!parent || !parent.email) {
        this.logger.error({
          error: {
            message: 'Parent email not available',
            name: 'ValidationError',
          },
          file: 'email-channel.adapter.ts',
          function: 'send',
          inputs: { recipientId: notification.recipientId },
          timestamp: new Date().toISOString(),
        });
        throw new BusinessException(
          `Parent ${notification.recipientId} has no email address`,
          'EMAIL_NOT_AVAILABLE',
        );
      }

      // Send email - use generic fallback for white-labeling
      const subject = notification.subject ?? 'Notification';
      const result = await this.emailService.sendEmail(
        parent.email,
        subject,
        notification.body,
      );

      this.logger.log(
        `Email sent successfully to ${parent.email}: ${result.messageId}`,
      );

      return {
        success: true,
        channelUsed: NotificationChannelType.EMAIL,
        messageId: result.messageId,
        status: NotificationDeliveryStatus.SENT,
        sentAt: new Date(),
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode =
        error instanceof BusinessException ? error.code : 'EMAIL_SEND_FAILED';

      this.logger.error({
        error: {
          message: errorMessage,
          name: error instanceof Error ? error.name : 'UnknownError',
        },
        file: 'email-channel.adapter.ts',
        function: 'send',
        inputs: { recipientId: notification.recipientId },
        timestamp: new Date().toISOString(),
      });

      return {
        success: false,
        channelUsed: NotificationChannelType.EMAIL,
        status: NotificationDeliveryStatus.FAILED,
        error: errorMessage,
        errorCode,
      };
    }
  }

  /**
   * Get delivery status for email
   * Note: Email doesn't provide real-time status tracking unless using advanced services
   */
  async getDeliveryStatus(
    _messageId: string,
  ): Promise<NotificationDeliveryStatus> {
    // Email status tracking would require webhook integration with email provider
    // For now, we assume sent = delivered
    return NotificationDeliveryStatus.SENT;
  }
}
