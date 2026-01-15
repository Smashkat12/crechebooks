/**
 * WhatsApp Channel Adapter
 * TASK-INFRA-012: Multi-Channel Notification Service Enhancement
 *
 * Wraps WhatsAppService to implement INotificationChannel interface.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { WhatsAppService } from '../../integrations/whatsapp/whatsapp.service';
import { INotificationChannel } from '../interfaces/notification-channel.interface';
import {
  NotificationChannelType,
  Notification,
  DeliveryResult,
  NotificationDeliveryStatus,
} from '../types/notification.types';
import { BusinessException } from '../../shared/exceptions';

@Injectable()
export class WhatsAppChannelAdapter implements INotificationChannel {
  private readonly logger = new Logger(WhatsAppChannelAdapter.name);
  readonly channelType = NotificationChannelType.WHATSAPP;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsAppService: WhatsAppService,
  ) {}

  /**
   * Check if WhatsApp channel is available for parent
   */
  async isAvailable(recipientId: string): Promise<boolean> {
    try {
      const parent = await this.prisma.parent.findUnique({
        where: { id: recipientId },
        select: {
          whatsapp: true,
          phone: true,
          whatsappOptIn: true,
        },
      });

      if (!parent) {
        return false;
      }

      // Check opt-in status (POPIA compliance)
      if (!parent.whatsappOptIn) {
        return false;
      }

      // Check if WhatsApp number or phone is available
      const phoneNumber = parent.whatsapp || parent.phone;
      if (!phoneNumber) {
        return false;
      }

      // Validate phone number format
      if (!this.whatsAppService.isValidPhoneNumber(phoneNumber)) {
        return false;
      }

      // Check if WhatsApp API is configured
      const configured = await this.checkWhatsAppConfigured();
      if (!configured) {
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error({
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'UnknownError',
        },
        file: 'whatsapp-channel.adapter.ts',
        function: 'isAvailable',
        inputs: { recipientId },
        timestamp: new Date().toISOString(),
      });
      return false;
    }
  }

  /**
   * Send notification via WhatsApp
   */
  async send(notification: Notification): Promise<DeliveryResult> {
    try {
      // Get parent WhatsApp details
      const parent = await this.prisma.parent.findUnique({
        where: { id: notification.recipientId },
        select: {
          id: true,
          whatsapp: true,
          phone: true,
          whatsappOptIn: true,
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
          file: 'whatsapp-channel.adapter.ts',
          function: 'send',
          inputs: { recipientId: notification.recipientId },
          timestamp: new Date().toISOString(),
        });
        throw new BusinessException(
          `Parent ${notification.recipientId} not found`,
          'PARENT_NOT_FOUND',
        );
      }

      // Check opt-in
      if (!parent.whatsappOptIn) {
        throw new BusinessException(
          'Parent has not opted in to WhatsApp messages',
          'WHATSAPP_OPT_IN_REQUIRED',
        );
      }

      // Get phone number
      const phoneNumber = parent.whatsapp || parent.phone;
      if (!phoneNumber) {
        throw new BusinessException(
          'Parent WhatsApp number not available',
          'WHATSAPP_NUMBER_MISSING',
        );
      }

      // Send message using WhatsAppService
      const result = await this.whatsAppService.sendMessage(
        phoneNumber,
        notification.body,
      );

      this.logger.log(
        `WhatsApp sent successfully to ${phoneNumber}: ${result.messageId}`,
      );

      return {
        success: true,
        channelUsed: NotificationChannelType.WHATSAPP,
        messageId: result.messageId,
        status: NotificationDeliveryStatus.SENT,
        sentAt: result.sentAt,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode =
        error instanceof BusinessException
          ? error.code
          : 'WHATSAPP_SEND_FAILED';

      this.logger.error({
        error: {
          message: errorMessage,
          name: error instanceof Error ? error.name : 'UnknownError',
        },
        file: 'whatsapp-channel.adapter.ts',
        function: 'send',
        inputs: { recipientId: notification.recipientId },
        timestamp: new Date().toISOString(),
      });

      return {
        success: false,
        channelUsed: NotificationChannelType.WHATSAPP,
        status: NotificationDeliveryStatus.FAILED,
        error: errorMessage,
        errorCode,
      };
    }
  }

  /**
   * Get delivery status for WhatsApp message
   */
  async getDeliveryStatus(_messageId: string): Promise<NotificationDeliveryStatus> {
    // WhatsApp status is updated via webhooks
    // For now, we return SENT status
    // In a production system, this would query the audit log or a message tracking table
    return NotificationDeliveryStatus.SENT;
  }

  /**
   * Check if WhatsApp API is configured
   */
  private checkWhatsAppConfigured(): boolean {
    try {
      // Try to check opt-in for a dummy number (won't fail if API is configured)
      // This is a lightweight check to see if WhatsApp service is initialized
      const hasConfig =
        process.env.WHATSAPP_ACCESS_TOKEN &&
        process.env.WHATSAPP_PHONE_NUMBER_ID &&
        process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
      return !!hasConfig;
    } catch {
      return false;
    }
  }
}
