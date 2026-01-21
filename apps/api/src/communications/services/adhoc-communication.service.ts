/**
 * Adhoc Communication Service
 * TASK-COMM-002: Ad-hoc Communication Service
 *
 * Orchestrates the creation and sending of broadcast messages.
 * Handles recipient resolution, queuing for background processing, and audit logging.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bull';
import { BroadcastMessageEntity } from '../entities/broadcast-message.entity';
import { MessageRecipientEntity } from '../entities/message-recipient.entity';
import { RecipientResolverService } from './recipient-resolver.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import { CreateBroadcastDto } from '../dto/create-broadcast.dto';
import { BroadcastStatus, RecipientType } from '../types/communication.types';
import { BroadcastMessage } from '@prisma/client';

export interface BroadcastWithRecipientCount extends BroadcastMessage {
  totalRecipients: number;
}

@Injectable()
export class AdhocCommunicationService {
  private readonly logger = new Logger(AdhocCommunicationService.name);
  private broadcastQueue: Queue | null = null;

  constructor(
    private readonly broadcastEntity: BroadcastMessageEntity,
    private readonly recipientEntity: MessageRecipientEntity,
    private readonly recipientResolver: RecipientResolverService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Set the broadcast queue (injected after construction to handle optional Redis)
   */
  setBroadcastQueue(queue: Queue | null): void {
    this.broadcastQueue = queue;
  }

  /**
   * Create a new broadcast message
   *
   * 1. Creates the broadcast record
   * 2. Resolves recipients based on filter criteria
   * 3. Creates recipient records for tracking
   * 4. Updates total recipient count
   * 5. Logs to audit trail
   *
   * @param tenantId - Tenant ID
   * @param userId - User ID creating the broadcast
   * @param dto - Broadcast creation data
   * @returns Created broadcast with recipient count
   */
  async createBroadcast(
    tenantId: string,
    userId: string,
    dto: CreateBroadcastDto,
  ): Promise<BroadcastWithRecipientCount> {
    this.logger.log(
      `Creating broadcast: subject="${dto.subject}", type=${dto.recipientType}, channel=${dto.channel}`,
    );

    // 1. Create broadcast record
    const broadcast = await this.broadcastEntity.create(
      {
        tenantId,
        subject: dto.subject,
        body: dto.body,
        htmlBody: dto.htmlBody,
        recipientType: dto.recipientType,
        recipientFilter: dto.recipientFilter,
        recipientGroupId: dto.recipientGroupId,
        channel: dto.channel,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : undefined,
      },
      userId,
    );

    // 2. Resolve recipients based on filter
    const recipients = await this.recipientResolver.resolve(
      tenantId,
      dto.recipientType,
      dto.recipientFilter,
      dto.channel,
    );

    this.logger.debug(`Resolved ${recipients.length} recipients for broadcast`);

    // 3. Create recipient records for tracking
    if (recipients.length > 0) {
      const recipientRecords = recipients.map((r) => ({
        broadcastId: broadcast.id,
        recipientId: r.id,
        recipientType: dto.recipientType,
        recipientName: r.name,
        recipientEmail: r.email,
        recipientPhone: r.phone,
      }));

      await this.recipientEntity.createMany(recipientRecords);
    }

    // 4. Update total recipient count
    await this.broadcastEntity.updateStatus(
      broadcast.id,
      BroadcastStatus.DRAFT,
      {
        totalRecipients: recipients.length,
      },
    );

    // 5. Audit log
    await this.auditLogService.logAction({
      tenantId,
      userId,
      entityType: 'BroadcastMessage',
      entityId: broadcast.id,
      action: AuditAction.CREATE,
      afterValue: {
        recipientCount: recipients.length,
        channel: dto.channel,
        recipientType: dto.recipientType,
        subject: dto.subject,
      },
      changeSummary: `Created broadcast "${dto.subject || 'Untitled'}" for ${recipients.length} recipients via ${dto.channel}`,
    });

    this.logger.log(
      `Created broadcast ${broadcast.id} with ${recipients.length} recipients`,
    );

    return { ...broadcast, totalRecipients: recipients.length };
  }

  /**
   * Queue a broadcast for sending
   *
   * @param tenantId - Tenant ID
   * @param broadcastId - Broadcast ID to send
   * @param userId - User initiating the send
   */
  async sendBroadcast(
    tenantId: string,
    broadcastId: string,
    userId?: string,
  ): Promise<void> {
    const broadcast = await this.broadcastEntity.findById(broadcastId);

    if (!broadcast || broadcast.tenantId !== tenantId) {
      throw new NotFoundException(`Broadcast ${broadcastId} not found`);
    }

    if ((broadcast.status as BroadcastStatus) !== BroadcastStatus.DRAFT) {
      throw new Error(
        `Cannot send broadcast with status: ${broadcast.status}. Only DRAFT broadcasts can be sent.`,
      );
    }

    // Check if queue is available
    if (!this.broadcastQueue) {
      this.logger.warn(
        'Broadcast queue not available (Redis not configured). Processing synchronously is not supported.',
      );
      throw new Error(
        'Broadcast queue not configured. Please configure Redis to enable background message processing.',
      );
    }

    // Queue for background processing
    await this.broadcastQueue.add(
      'send',
      {
        tenantId,
        broadcastId,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: false,
      },
    );

    // Update status to SCHEDULED (will change to SENDING when processor picks it up)
    await this.broadcastEntity.updateStatus(
      broadcastId,
      BroadcastStatus.SCHEDULED,
    );

    // Audit log
    await this.auditLogService.logAction({
      tenantId,
      userId,
      entityType: 'BroadcastMessage',
      entityId: broadcastId,
      action: AuditAction.UPDATE,
      afterValue: {
        status: BroadcastStatus.SCHEDULED,
        queuedAt: new Date().toISOString(),
      },
      changeSummary: `Queued broadcast ${broadcastId} for sending`,
    });

    this.logger.log(`Queued broadcast ${broadcastId} for sending`);
  }

  /**
   * Cancel a pending broadcast
   *
   * @param tenantId - Tenant ID
   * @param broadcastId - Broadcast ID to cancel
   * @param userId - User initiating the cancel
   */
  async cancelBroadcast(
    tenantId: string,
    broadcastId: string,
    userId?: string,
  ): Promise<void> {
    const broadcast = await this.broadcastEntity.findById(broadcastId);

    if (!broadcast || broadcast.tenantId !== tenantId) {
      throw new NotFoundException(`Broadcast ${broadcastId} not found`);
    }

    const status = broadcast.status as BroadcastStatus;
    if (
      status === BroadcastStatus.SENT ||
      status === BroadcastStatus.SENDING ||
      status === BroadcastStatus.PARTIALLY_SENT
    ) {
      throw new Error(
        `Cannot cancel broadcast that is already ${status}. Only DRAFT or SCHEDULED broadcasts can be cancelled.`,
      );
    }

    await this.broadcastEntity.updateStatus(
      broadcastId,
      BroadcastStatus.CANCELLED,
    );

    // Audit log
    await this.auditLogService.logAction({
      tenantId,
      userId,
      entityType: 'BroadcastMessage',
      entityId: broadcastId,
      action: AuditAction.UPDATE,
      afterValue: {
        status: BroadcastStatus.CANCELLED,
        cancelledAt: new Date().toISOString(),
      },
      changeSummary: `Cancelled broadcast ${broadcastId}`,
    });

    this.logger.log(`Cancelled broadcast ${broadcastId}`);
  }

  /**
   * Get broadcast by ID
   *
   * @param tenantId - Tenant ID
   * @param broadcastId - Broadcast ID
   */
  async getBroadcast(
    tenantId: string,
    broadcastId: string,
  ): Promise<BroadcastMessage | null> {
    const broadcast = await this.broadcastEntity.findById(broadcastId);

    if (!broadcast || broadcast.tenantId !== tenantId) {
      return null;
    }

    return broadcast;
  }

  /**
   * List broadcasts for a tenant
   *
   * @param tenantId - Tenant ID
   * @param options - Filter options
   */
  async listBroadcasts(
    tenantId: string,
    options?: {
      status?: BroadcastStatus;
      recipientType?: RecipientType;
      limit?: number;
      offset?: number;
    },
  ): Promise<BroadcastMessage[]> {
    return this.broadcastEntity.findByTenant(tenantId, options);
  }

  /**
   * Preview recipient count before creating broadcast
   *
   * @param tenantId - Tenant ID
   * @param dto - Broadcast data (for filter criteria)
   */
  async previewRecipientCount(
    tenantId: string,
    dto: Pick<
      CreateBroadcastDto,
      'recipientType' | 'recipientFilter' | 'channel'
    >,
  ): Promise<number> {
    return this.recipientResolver.previewCount(
      tenantId,
      dto.recipientType,
      dto.recipientFilter,
      dto.channel,
    );
  }

  /**
   * Get delivery statistics for a broadcast
   *
   * @param tenantId - Tenant ID
   * @param broadcastId - Broadcast ID
   */
  async getDeliveryStats(tenantId: string, broadcastId: string) {
    const broadcast = await this.broadcastEntity.findById(broadcastId);

    if (!broadcast || broadcast.tenantId !== tenantId) {
      throw new NotFoundException(`Broadcast ${broadcastId} not found`);
    }

    return this.recipientEntity.getDeliveryStats(broadcastId);
  }
}
