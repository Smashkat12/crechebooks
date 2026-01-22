/**
 * WhatsApp Message Entity Service
 * TASK-WA-001: WhatsApp Message History Entity
 *
 * Handles CRUD operations for WhatsApp message history.
 * Provides audit trail and POPIA compliance tracking.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { WhatsAppMessage, Prisma } from '@prisma/client';
import {
  WhatsAppMessageStatus,
  WhatsAppContextType,
  CreateWhatsAppMessageDto,
  UpdateMessageStatusDto,
  MessageHistoryQueryOptions,
  MessageHistorySummary,
} from '../types/message-history.types';

@Injectable()
export class WhatsAppMessageEntity {
  private readonly logger = new Logger(WhatsAppMessageEntity.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new WhatsApp message record
   */
  async create(data: CreateWhatsAppMessageDto): Promise<WhatsAppMessage> {
    this.logger.debug(
      `Creating WhatsApp message record for ${data.recipientPhone}`,
    );

    return this.prisma.whatsAppMessage.create({
      data: {
        tenantId: data.tenantId,
        parentId: data.parentId,
        recipientPhone: data.recipientPhone,
        templateName: data.templateName,
        templateParams: data.templateParams ?? Prisma.JsonNull,
        contextType: data.contextType,
        contextId: data.contextId,
        wamid: data.wamid,
        status: data.status || WhatsAppMessageStatus.PENDING,
      },
    });
  }

  /**
   * Update message status from webhook callback
   */
  async updateStatus(
    dto: UpdateMessageStatusDto,
  ): Promise<WhatsAppMessage | null> {
    const { wamid, status, timestamp, errorCode, errorMessage } = dto;

    this.logger.debug(`Updating message status: ${wamid} -> ${status}`);

    // Build update data based on status
    const updateData: Prisma.WhatsAppMessageUpdateInput = {
      status,
      statusUpdatedAt: timestamp,
    };

    // Set specific timestamp based on status
    switch (status) {
      case WhatsAppMessageStatus.SENT:
        updateData.sentAt = timestamp;
        break;
      case WhatsAppMessageStatus.DELIVERED:
        updateData.deliveredAt = timestamp;
        break;
      case WhatsAppMessageStatus.READ:
        updateData.readAt = timestamp;
        break;
      case WhatsAppMessageStatus.FAILED:
        updateData.errorCode = errorCode;
        updateData.errorMessage = errorMessage;
        break;
    }

    try {
      return await this.prisma.whatsAppMessage.update({
        where: { wamid },
        data: updateData,
      });
    } catch (error) {
      // Message may not exist if webhook arrives before create completes
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        this.logger.warn(`Message not found for WAMID: ${wamid}`);
        return null;
      }
      throw error;
    }
  }

  /**
   * Find message by internal ID
   * TASK-WA-006: Used by retry service to get message details
   */
  async findById(id: string): Promise<WhatsAppMessage | null> {
    return this.prisma.whatsAppMessage.findUnique({
      where: { id },
    });
  }

  /**
   * Find message by WAMID (WhatsApp Message ID)
   */
  async findByWamid(wamid: string): Promise<WhatsAppMessage | null> {
    return this.prisma.whatsAppMessage.findUnique({
      where: { wamid },
    });
  }

  /**
   * Find messages by tenant and parent
   */
  async findByTenantAndParent(
    tenantId: string,
    parentId: string,
    options?: MessageHistoryQueryOptions,
  ): Promise<WhatsAppMessage[]> {
    const where: Prisma.WhatsAppMessageWhereInput = {
      tenantId,
      parentId,
    };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.contextType) {
      where.contextType = options.contextType;
    }

    if (options?.startDate || options?.endDate) {
      where.createdAt = {};
      if (options.startDate) {
        where.createdAt.gte = options.startDate;
      }
      if (options.endDate) {
        where.createdAt.lte = options.endDate;
      }
    }

    return this.prisma.whatsAppMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
  }

  /**
   * Find messages by context (e.g., all messages for an invoice)
   */
  async findByContext(
    tenantId: string,
    contextType: WhatsAppContextType,
    contextId: string,
  ): Promise<WhatsAppMessage[]> {
    return this.prisma.whatsAppMessage.findMany({
      where: {
        tenantId,
        contextType,
        contextId,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get message history summary for reporting
   */
  async getHistorySummary(
    tenantId: string,
    startDate?: Date,
    endDate?: Date,
  ): Promise<MessageHistorySummary> {
    const where: Prisma.WhatsAppMessageWhereInput = { tenantId };

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    const counts = await this.prisma.whatsAppMessage.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });

    const summary: MessageHistorySummary = {
      total: 0,
      pending: 0,
      sent: 0,
      delivered: 0,
      read: 0,
      failed: 0,
      deliveryRate: 0,
      readRate: 0,
    };

    for (const count of counts) {
      const statusCount = count._count.status;
      summary.total += statusCount;

      switch (count.status as WhatsAppMessageStatus) {
        case WhatsAppMessageStatus.PENDING:
          summary.pending = statusCount;
          break;
        case WhatsAppMessageStatus.SENT:
          summary.sent = statusCount;
          break;
        case WhatsAppMessageStatus.DELIVERED:
          summary.delivered = statusCount;
          break;
        case WhatsAppMessageStatus.READ:
          summary.read = statusCount;
          break;
        case WhatsAppMessageStatus.FAILED:
          summary.failed = statusCount;
          break;
      }
    }

    // Calculate rates
    const totalSent = summary.sent + summary.delivered + summary.read;
    const totalDelivered = summary.delivered + summary.read;

    if (totalSent > 0) {
      summary.deliveryRate = Math.round((totalDelivered / totalSent) * 100);
    }

    if (totalDelivered > 0) {
      summary.readRate = Math.round((summary.read / totalDelivered) * 100);
    }

    return summary;
  }

  /**
   * Get recent failed messages for monitoring
   */
  async getRecentFailedMessages(
    tenantId: string,
    limit: number = 20,
  ): Promise<WhatsAppMessage[]> {
    return this.prisma.whatsAppMessage.findMany({
      where: {
        tenantId,
        status: WhatsAppMessageStatus.FAILED,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        parent: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
          },
        },
      },
    });
  }

  /**
   * Count messages by status for a tenant
   */
  async countByStatus(tenantId: string): Promise<Record<string, number>> {
    const counts = await this.prisma.whatsAppMessage.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: { status: true },
    });

    const result: Record<string, number> = {};
    for (const count of counts) {
      result[count.status] = count._count.status;
    }

    return result;
  }

  /**
   * Mark message as sent with WAMID
   */
  async markAsSent(messageId: string, wamid: string): Promise<WhatsAppMessage> {
    return this.prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: {
        wamid,
        status: WhatsAppMessageStatus.SENT,
        sentAt: new Date(),
        statusUpdatedAt: new Date(),
      },
    });
  }

  /**
   * Mark message as failed with error details
   */
  async markAsFailed(
    messageId: string,
    errorCode: string,
    errorMessage: string,
  ): Promise<WhatsAppMessage> {
    return this.prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: {
        status: WhatsAppMessageStatus.FAILED,
        errorCode,
        errorMessage,
        statusUpdatedAt: new Date(),
      },
    });
  }
}
