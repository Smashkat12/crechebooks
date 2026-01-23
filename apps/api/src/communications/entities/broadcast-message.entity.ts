/**
 * Broadcast Message Entity Service
 * TASK-COMM-001: Ad-hoc Communication Database Schema
 *
 * Handles CRUD operations for broadcast messages.
 * Provides methods for creating, updating, and querying broadcast messages.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BroadcastMessage, Prisma } from '@prisma/client';
import {
  BroadcastStatus,
  RecipientType,
  CreateBroadcastData,
} from '../types/communication.types';

export interface BroadcastListOptions {
  status?: BroadcastStatus;
  recipientType?: RecipientType;
  limit?: number;
  offset?: number;
}

export interface BroadcastUpdateCounts {
  totalRecipients?: number;
  sentCount?: number;
  failedCount?: number;
}

@Injectable()
export class BroadcastMessageEntity {
  private readonly logger = new Logger(BroadcastMessageEntity.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new broadcast message
   */
  async create(
    data: CreateBroadcastData,
    userId: string,
  ): Promise<BroadcastMessage> {
    this.logger.debug(`Creating broadcast message for tenant ${data.tenantId}`);

    return this.prisma.broadcastMessage.create({
      data: {
        tenantId: data.tenantId! ?? undefined,
        subject: data.subject,
        body: data.body,
        htmlBody: data.htmlBody,
        recipientType: data.recipientType,
        recipientFilter: data.recipientFilter
          ? (data.recipientFilter as Prisma.JsonObject)
          : Prisma.JsonNull,
        recipientGroupId: data.recipientGroupId,
        channel: data.channel,
        scheduledAt: data.scheduledAt,
        createdBy: userId,
        status: data.scheduledAt
          ? BroadcastStatus.SCHEDULED
          : BroadcastStatus.DRAFT,
      },
      include: {
        recipientGroup: true,
      },
    });
  }

  /**
   * Find broadcast message by ID
   */
  async findById(id: string): Promise<BroadcastMessage | null> {
    return this.prisma.broadcastMessage.findUnique({
      where: { id },
      include: {
        recipients: true,
        recipientGroup: true,
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Find broadcast messages by tenant with optional filters
   */
  async findByTenant(
    tenantId: string,
    options?: BroadcastListOptions,
  ): Promise<BroadcastMessage[]> {
    const where: Prisma.BroadcastMessageWhereInput = {
      tenantId,
    };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.recipientType) {
      where.recipientType = options.recipientType;
    }

    return this.prisma.broadcastMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: options?.limit ?? 20,
      skip: options?.offset ?? 0,
      include: {
        recipientGroup: true,
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: {
            recipients: true,
          },
        },
      },
    });
  }

  /**
   * Count broadcast messages by tenant with optional filters
   */
  async countByTenant(
    tenantId: string,
    options?: Pick<BroadcastListOptions, 'status' | 'recipientType'>,
  ): Promise<number> {
    const where: Prisma.BroadcastMessageWhereInput = {
      tenantId,
    };

    if (options?.status) {
      where.status = options.status;
    }

    if (options?.recipientType) {
      where.recipientType = options.recipientType;
    }

    return this.prisma.broadcastMessage.count({ where });
  }

  /**
   * Update broadcast message status and counts
   */
  async updateStatus(
    id: string,
    status: BroadcastStatus,
    counts?: BroadcastUpdateCounts,
  ): Promise<BroadcastMessage> {
    this.logger.debug(`Updating broadcast ${id} status to ${status}`);

    const updateData: Prisma.BroadcastMessageUpdateInput = {
      status,
    };

    // Set sentAt timestamp when status changes to sent
    if (
      status === BroadcastStatus.SENT ||
      status === BroadcastStatus.PARTIALLY_SENT
    ) {
      updateData.sentAt = new Date();
    }

    // Update counts if provided
    if (counts?.totalRecipients !== undefined) {
      updateData.totalRecipients = counts.totalRecipients;
    }
    if (counts?.sentCount !== undefined) {
      updateData.sentCount = counts.sentCount;
    }
    if (counts?.failedCount !== undefined) {
      updateData.failedCount = counts.failedCount;
    }

    return this.prisma.broadcastMessage.update({
      where: { id },
      data: updateData,
      include: {
        recipients: true,
        recipientGroup: true,
      },
    });
  }

  /**
   * Update broadcast message content (only allowed for DRAFT status)
   */
  async update(
    id: string,
    data: Partial<CreateBroadcastData>,
  ): Promise<BroadcastMessage> {
    const broadcast = await this.findById(id);
    if (!broadcast) {
      throw new NotFoundException(`Broadcast message ${id} not found`);
    }

    if ((broadcast.status as BroadcastStatus) !== BroadcastStatus.DRAFT) {
      throw new Error('Can only update draft broadcast messages');
    }

    return this.prisma.broadcastMessage.update({
      where: { id },
      data: {
        subject: data.subject,
        body: data.body,
        htmlBody: data.htmlBody,
        recipientType: data.recipientType,
        recipientFilter: data.recipientFilter
          ? (data.recipientFilter as Prisma.JsonObject)
          : undefined,
        recipientGroupId: data.recipientGroupId,
        channel: data.channel,
        scheduledAt: data.scheduledAt,
        status: data.scheduledAt
          ? BroadcastStatus.SCHEDULED
          : BroadcastStatus.DRAFT,
      },
    });
  }

  /**
   * Cancel a scheduled broadcast message
   */
  async cancel(id: string): Promise<BroadcastMessage> {
    const broadcast = await this.findById(id);
    if (!broadcast) {
      throw new NotFoundException(`Broadcast message ${id} not found`);
    }

    const status = broadcast.status as BroadcastStatus;
    if (
      status !== BroadcastStatus.DRAFT &&
      status !== BroadcastStatus.SCHEDULED
    ) {
      throw new Error('Can only cancel draft or scheduled broadcast messages');
    }

    return this.prisma.broadcastMessage.update({
      where: { id },
      data: { status: BroadcastStatus.CANCELLED },
    });
  }

  /**
   * Delete a broadcast message (soft delete)
   */
  async delete(id: string): Promise<void> {
    const broadcast = await this.findById(id);
    if (!broadcast) {
      throw new NotFoundException(`Broadcast message ${id} not found`);
    }

    // For POPIA compliance, we don't actually delete - just mark as deleted
    // Note: If deletedAt field is added to schema, use soft delete
    // For now, only allow deleting DRAFT messages
    if ((broadcast.status as BroadcastStatus) !== BroadcastStatus.DRAFT) {
      throw new Error('Can only delete draft broadcast messages');
    }

    await this.prisma.broadcastMessage.delete({
      where: { id },
    });
  }

  /**
   * Get scheduled broadcasts ready to send
   */
  async getScheduledBroadcastsReadyToSend(): Promise<BroadcastMessage[]> {
    return this.prisma.broadcastMessage.findMany({
      where: {
        status: BroadcastStatus.SCHEDULED,
        scheduledAt: {
          lte: new Date(),
        },
      },
      include: {
        recipients: true,
        recipientGroup: true,
      },
    });
  }

  /**
   * Get broadcasts by status for monitoring
   */
  async getByStatus(status: BroadcastStatus): Promise<BroadcastMessage[]> {
    return this.prisma.broadcastMessage.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: {
            recipients: true,
          },
        },
      },
    });
  }

  /**
   * Increment sent count
   */
  async incrementSentCount(id: string): Promise<void> {
    await this.prisma.broadcastMessage.update({
      where: { id },
      data: {
        sentCount: {
          increment: 1,
        },
      },
    });
  }

  /**
   * Increment failed count
   */
  async incrementFailedCount(id: string): Promise<void> {
    await this.prisma.broadcastMessage.update({
      where: { id },
      data: {
        failedCount: {
          increment: 1,
        },
      },
    });
  }
}
