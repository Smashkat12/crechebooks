/**
 * Message Recipient Entity Service
 * TASK-COMM-001: Ad-hoc Communication Database Schema
 *
 * Handles CRUD operations for message recipients within a broadcast.
 * Tracks delivery status across all channels (email, WhatsApp, SMS).
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { MessageRecipient, Prisma } from '@prisma/client';
import {
  DeliveryStatus,
  DeliveryStats,
  CreateMessageRecipientData,
} from '../types/communication.types';

@Injectable()
export class MessageRecipientEntity {
  private readonly logger = new Logger(MessageRecipientEntity.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create multiple message recipients in bulk
   */
  async createMany(
    recipients: CreateMessageRecipientData[],
  ): Promise<{ count: number }> {
    this.logger.debug(`Creating ${recipients.length} message recipients`);

    const result = await this.prisma.messageRecipient.createMany({
      data: recipients.map((r) => ({
        broadcastId: r.broadcastId,
        recipientId: r.recipientId,
        recipientType: r.recipientType,
        recipientName: r.recipientName,
        recipientEmail: r.recipientEmail,
        recipientPhone: r.recipientPhone,
        emailStatus: r.recipientEmail ? DeliveryStatus.PENDING : null,
        whatsappStatus: r.recipientPhone ? DeliveryStatus.PENDING : null,
        smsStatus: r.recipientPhone ? DeliveryStatus.PENDING : null,
      })),
      skipDuplicates: true,
    });

    return { count: result.count };
  }

  /**
   * Find recipient by ID
   */
  async findById(id: string): Promise<MessageRecipient | null> {
    return this.prisma.messageRecipient.findUnique({
      where: { id },
    });
  }

  /**
   * Find recipients by broadcast ID
   */
  async findByBroadcast(broadcastId: string): Promise<MessageRecipient[]> {
    return this.prisma.messageRecipient.findMany({
      where: { broadcastId },
      orderBy: { recipientName: 'asc' },
    });
  }

  /**
   * Find recipient by broadcast and recipient ID (composite unique)
   */
  async findByBroadcastAndRecipient(
    broadcastId: string,
    recipientId: string,
  ): Promise<MessageRecipient | null> {
    return this.prisma.messageRecipient.findUnique({
      where: {
        broadcastId_recipientId: {
          broadcastId,
          recipientId,
        },
      },
    });
  }

  /**
   * Update email delivery status
   */
  async updateEmailStatus(
    broadcastId: string,
    recipientId: string,
    status: DeliveryStatus,
    messageId?: string,
    error?: string,
  ): Promise<MessageRecipient> {
    this.logger.debug(
      `Updating email status for recipient ${recipientId}: ${status}`,
    );

    const updateData: Prisma.MessageRecipientUpdateInput = {
      emailStatus: status,
    };

    if (messageId) {
      updateData.emailMessageId = messageId;
    }

    if (status === DeliveryStatus.SENT) {
      updateData.emailSentAt = new Date();
    }

    if (status === DeliveryStatus.FAILED || status === DeliveryStatus.BOUNCED) {
      updateData.lastError = error;
    }

    return this.prisma.messageRecipient.update({
      where: {
        broadcastId_recipientId: {
          broadcastId,
          recipientId,
        },
      },
      data: updateData,
    });
  }

  /**
   * Update WhatsApp delivery status
   */
  async updateWhatsAppStatus(
    broadcastId: string,
    recipientId: string,
    status: DeliveryStatus,
    wamid?: string,
    error?: string,
  ): Promise<MessageRecipient> {
    this.logger.debug(
      `Updating WhatsApp status for recipient ${recipientId}: ${status}`,
    );

    const updateData: Prisma.MessageRecipientUpdateInput = {
      whatsappStatus: status,
    };

    if (wamid) {
      updateData.whatsappWamid = wamid;
    }

    if (status === DeliveryStatus.SENT) {
      updateData.whatsappSentAt = new Date();
    }

    if (status === DeliveryStatus.FAILED) {
      updateData.lastError = error;
    }

    return this.prisma.messageRecipient.update({
      where: {
        broadcastId_recipientId: {
          broadcastId,
          recipientId,
        },
      },
      data: updateData,
    });
  }

  /**
   * Update SMS delivery status
   */
  async updateSmsStatus(
    broadcastId: string,
    recipientId: string,
    status: DeliveryStatus,
    messageId?: string,
    error?: string,
  ): Promise<MessageRecipient> {
    this.logger.debug(
      `Updating SMS status for recipient ${recipientId}: ${status}`,
    );

    const updateData: Prisma.MessageRecipientUpdateInput = {
      smsStatus: status,
    };

    if (messageId) {
      updateData.smsMessageId = messageId;
    }

    if (status === DeliveryStatus.SENT) {
      updateData.smsSentAt = new Date();
    }

    if (status === DeliveryStatus.FAILED) {
      updateData.lastError = error;
    }

    return this.prisma.messageRecipient.update({
      where: {
        broadcastId_recipientId: {
          broadcastId,
          recipientId,
        },
      },
      data: updateData,
    });
  }

  /**
   * Mark recipient as failed on all channels
   */
  async markFailed(id: string, error: string): Promise<MessageRecipient> {
    this.logger.debug(`Marking recipient ${id} as failed: ${error}`);

    const recipient = await this.findById(id);
    if (!recipient) {
      throw new Error(`Message recipient ${id} not found`);
    }

    const updateData: Prisma.MessageRecipientUpdateInput = {
      lastError: error,
      retryCount: {
        increment: 1,
      },
    };

    // Only update status for channels that were pending
    if (recipient.emailStatus === DeliveryStatus.PENDING) {
      updateData.emailStatus = DeliveryStatus.FAILED;
    }
    if (recipient.whatsappStatus === DeliveryStatus.PENDING) {
      updateData.whatsappStatus = DeliveryStatus.FAILED;
    }
    if (recipient.smsStatus === DeliveryStatus.PENDING) {
      updateData.smsStatus = DeliveryStatus.FAILED;
    }

    return this.prisma.messageRecipient.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Increment retry count
   */
  async incrementRetryCount(id: string): Promise<void> {
    await this.prisma.messageRecipient.update({
      where: { id },
      data: {
        retryCount: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Get delivery statistics for a broadcast
   */
  async getDeliveryStats(broadcastId: string): Promise<DeliveryStats> {
    const recipients = await this.prisma.messageRecipient.findMany({
      where: { broadcastId },
      select: {
        emailStatus: true,
        whatsappStatus: true,
        smsStatus: true,
      },
    });

    const stats: DeliveryStats = {
      total: recipients.length,
      emailSent: 0,
      emailDelivered: 0,
      emailOpened: 0,
      emailFailed: 0,
      whatsappSent: 0,
      whatsappDelivered: 0,
      whatsappRead: 0,
      whatsappFailed: 0,
      smsSent: 0,
      smsDelivered: 0,
      smsFailed: 0,
    };

    for (const recipient of recipients) {
      // Email stats
      if (recipient.emailStatus) {
        const emailStatus = recipient.emailStatus as DeliveryStatus;
        switch (emailStatus) {
          case DeliveryStatus.SENT:
            stats.emailSent++;
            break;
          case DeliveryStatus.DELIVERED:
            stats.emailSent++;
            stats.emailDelivered++;
            break;
          case DeliveryStatus.OPENED:
            stats.emailSent++;
            stats.emailDelivered++;
            stats.emailOpened++;
            break;
          case DeliveryStatus.FAILED:
          case DeliveryStatus.BOUNCED:
            stats.emailFailed++;
            break;
        }
      }

      // WhatsApp stats
      if (recipient.whatsappStatus) {
        const whatsappStatus = recipient.whatsappStatus as DeliveryStatus;
        switch (whatsappStatus) {
          case DeliveryStatus.SENT:
            stats.whatsappSent++;
            break;
          case DeliveryStatus.DELIVERED:
            stats.whatsappSent++;
            stats.whatsappDelivered++;
            break;
          case DeliveryStatus.READ:
            stats.whatsappSent++;
            stats.whatsappDelivered++;
            stats.whatsappRead++;
            break;
          case DeliveryStatus.FAILED:
            stats.whatsappFailed++;
            break;
        }
      }

      // SMS stats
      if (recipient.smsStatus) {
        const smsStatus = recipient.smsStatus as DeliveryStatus;
        switch (smsStatus) {
          case DeliveryStatus.SENT:
            stats.smsSent++;
            break;
          case DeliveryStatus.DELIVERED:
            stats.smsSent++;
            stats.smsDelivered++;
            break;
          case DeliveryStatus.FAILED:
            stats.smsFailed++;
            break;
        }
      }
    }

    return stats;
  }

  /**
   * Get failed recipients for retry
   */
  async getFailedRecipients(
    broadcastId: string,
    maxRetries: number = 3,
  ): Promise<MessageRecipient[]> {
    return this.prisma.messageRecipient.findMany({
      where: {
        broadcastId,
        retryCount: {
          lt: maxRetries,
        },
        OR: [
          { emailStatus: DeliveryStatus.FAILED },
          { whatsappStatus: DeliveryStatus.FAILED },
          { smsStatus: DeliveryStatus.FAILED },
        ],
      },
    });
  }

  /**
   * Get pending recipients that haven't been sent yet
   */
  async getPendingRecipients(broadcastId: string): Promise<MessageRecipient[]> {
    return this.prisma.messageRecipient.findMany({
      where: {
        broadcastId,
        OR: [
          { emailStatus: DeliveryStatus.PENDING },
          { whatsappStatus: DeliveryStatus.PENDING },
          { smsStatus: DeliveryStatus.PENDING },
        ],
      },
    });
  }

  /**
   * Count recipients by broadcast
   */
  async countByBroadcast(broadcastId: string): Promise<number> {
    return this.prisma.messageRecipient.count({
      where: { broadcastId },
    });
  }

  /**
   * Delete all recipients for a broadcast
   */
  async deleteByBroadcast(broadcastId: string): Promise<{ count: number }> {
    const result = await this.prisma.messageRecipient.deleteMany({
      where: { broadcastId },
    });
    return { count: result.count };
  }
}
