/**
 * In-App Notification Service
 * TASK-NOTIF-010: In-App Notification Backend (Phase 1)
 *
 * Handles CRUD operations for in-app notifications stored in PostgreSQL.
 * Provides cursor-based pagination and bulk read operations.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Notification, NotificationPriority, Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma/prisma.service';
import {
  CreateNotificationInput,
  NotificationListQuery,
  NotificationListResponse,
  NotificationItem,
  RecipientType,
} from './types/in-app-notification.types';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;

@Injectable()
export class InAppNotificationService {
  private readonly logger = new Logger(InAppNotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(input: CreateNotificationInput): Promise<Notification> {
    this.logger.debug(
      `Creating notification for ${input.recipientType}:${input.recipientId} type=${input.type}`,
    );

    return this.prisma.notification.create({
      data: {
        tenantId: input.tenantId,
        recipientType: input.recipientType,
        recipientId: input.recipientId,
        type: input.type as any,
        priority:
          (input.priority as NotificationPriority) ??
          NotificationPriority.NORMAL,
        title: input.title,
        body: input.body,
        actionUrl: input.actionUrl ?? null,
        metadata: input.metadata
          ? (input.metadata as Prisma.InputJsonValue)
          : Prisma.DbNull,
        expiresAt: input.expiresAt ?? null,
      },
    });
  }

  async listForRecipient(
    query: NotificationListQuery,
  ): Promise<NotificationListResponse> {
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where: Prisma.NotificationWhereInput = {
      tenantId: query.tenantId,
      recipientType: query.recipientType,
      recipientId: query.recipientId,
      ...(query.isRead !== undefined && { isRead: query.isRead }),
      ...(query.type && { type: query.type as any }),
    };

    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit + 1, // fetch one extra to determine hasMore
        ...(query.cursor && {
          cursor: { id: query.cursor },
          skip: 1,
        }),
      }),
      this.prisma.notification.count({
        where: {
          tenantId: query.tenantId,
          recipientType: query.recipientType,
          recipientId: query.recipientId,
          isRead: false,
        },
      }),
    ]);

    const hasMore = items.length > limit;
    const data = hasMore ? items.slice(0, limit) : items;
    const nextCursor =
      hasMore && data.length > 0 ? data[data.length - 1].id : null;

    return {
      data: data.map(this.toNotificationItem),
      meta: {
        unreadCount,
        nextCursor,
        hasMore,
      },
    };
  }

  async getUnreadCount(
    tenantId: string,
    recipientType: RecipientType,
    recipientId: string,
  ): Promise<number> {
    return this.prisma.notification.count({
      where: {
        tenantId,
        recipientType,
        recipientId,
        isRead: false,
      },
    });
  }

  async markAsRead(id: string, tenantId: string): Promise<void> {
    await this.prisma.notification.update({
      where: { id, tenantId },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
    this.logger.debug(`Marked notification ${id} as read`);
  }

  async markAllAsRead(
    tenantId: string,
    recipientType: RecipientType,
    recipientId: string,
  ): Promise<number> {
    const result = await this.prisma.notification.updateMany({
      where: {
        tenantId,
        recipientType,
        recipientId,
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
    this.logger.debug(
      `Marked ${result.count} notifications as read for ${recipientType}:${recipientId}`,
    );
    return result.count;
  }

  async deleteNotification(id: string, tenantId: string): Promise<void> {
    await this.prisma.notification.delete({
      where: { id, tenantId },
    });
    this.logger.debug(`Deleted notification ${id}`);
  }

  private toNotificationItem(n: Notification): NotificationItem {
    return {
      id: n.id,
      type: n.type,
      priority: n.priority,
      title: n.title,
      body: n.body,
      actionUrl: n.actionUrl,
      metadata: n.metadata as Record<string, unknown> | null,
      isRead: n.isRead,
      createdAt: n.createdAt,
    };
  }
}
