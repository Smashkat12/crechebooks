/**
 * Notification Emitter Helper
 * TASK-NOTIF-010: In-App Notification Backend (Phase 1)
 *
 * Convenience helper for enqueuing in-app notification jobs to BullMQ.
 * All methods are fire-and-forget — errors are logged, never thrown.
 * Use this from any service that needs to trigger notifications.
 */

import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { PrismaService } from '../../database/prisma/prisma.service';
import {
  CreateNotificationInput,
  NotificationJobData,
  RecipientType,
} from '../types/in-app-notification.types';

interface NotifyParams {
  type: string;
  priority?: string;
  title: string;
  body: string;
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class NotificationEmitter {
  private readonly logger = new Logger(NotificationEmitter.name);

  constructor(
    @InjectQueue('notification') private readonly notificationQueue: Queue,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Send a notification to all ADMIN and OWNER users in a tenant.
   */
  async notifyAdmins(tenantId: string, params: NotifyParams): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: {
          currentTenantId: tenantId,
          role: { in: ['OWNER', 'ADMIN'] },
          isActive: true,
        },
        select: { id: true },
      });

      await Promise.all(
        admins.map((admin) =>
          this.enqueue({
            tenantId,
            recipientType: 'USER',
            recipientId: admin.id,
            ...params,
          }),
        ),
      );

      this.logger.debug(
        `Enqueued ${admins.length} admin notification(s) for tenant ${tenantId}: ${params.type}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue admin notifications: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Send a notification to a specific parent.
   */
  async notifyParent(
    tenantId: string,
    parentId: string,
    params: NotifyParams,
  ): Promise<void> {
    try {
      await this.enqueue({
        tenantId,
        recipientType: 'PARENT',
        recipientId: parentId,
        ...params,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue parent notification: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Send a notification to a specific staff member.
   */
  async notifyStaff(
    tenantId: string,
    staffId: string,
    params: NotifyParams,
  ): Promise<void> {
    try {
      await this.enqueue({
        tenantId,
        recipientType: 'STAFF',
        recipientId: staffId,
        ...params,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue staff notification: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /**
   * Send a notification to a specific user.
   */
  async notifyUser(
    tenantId: string,
    userId: string,
    params: NotifyParams,
  ): Promise<void> {
    try {
      await this.enqueue({
        tenantId,
        recipientType: 'USER',
        recipientId: userId,
        ...params,
      });
    } catch (error) {
      this.logger.error(
        `Failed to enqueue user notification: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private async enqueue(input: CreateNotificationInput): Promise<void> {
    const jobData: NotificationJobData = { notification: input };
    await this.notificationQueue.add(jobData, {
      removeOnComplete: true,
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }
}
