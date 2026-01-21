/**
 * Broadcast Processor
 * TASK-COMM-002: Ad-hoc Communication Service
 *
 * Background processor for sending broadcast messages.
 * Handles multi-channel delivery with rate limiting.
 */

import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { PrismaService } from '../../database/prisma/prisma.service';
import { BroadcastMessageEntity } from '../entities/broadcast-message.entity';
import { MessageRecipientEntity } from '../entities/message-recipient.entity';
import { EmailService } from '../../integrations/email/email.service';
import { WhatsAppService } from '../../integrations/whatsapp/whatsapp.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { AuditAction } from '../../database/entities/audit-log.entity';
import {
  BroadcastStatus,
  CommunicationChannel,
  DeliveryStatus,
} from '../types/communication.types';
import { QUEUE_NAMES } from '../../scheduler/types/scheduler.types';
import type { BroadcastMessage, MessageRecipient } from '@prisma/client';

/** Rate limiting: minimum delay between messages (ms) */
const RATE_LIMIT_DELAY_MS = 50;

export interface BroadcastJobData {
  tenantId: string;
  broadcastId: string;
}

@Injectable()
@Processor(QUEUE_NAMES.BROADCAST)
export class BroadcastProcessor {
  private readonly logger = new Logger(BroadcastProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly broadcastEntity: BroadcastMessageEntity,
    private readonly recipientEntity: MessageRecipientEntity,
    private readonly emailService: EmailService,
    private readonly whatsappService: WhatsAppService,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Process a broadcast send job
   */
  @Process('send')
  async handleSend(job: Job<BroadcastJobData>): Promise<void> {
    const { tenantId, broadcastId } = job.data;

    this.logger.log({
      message: 'Processing broadcast send job',
      jobId: job.id,
      broadcastId,
      tenantId,
      timestamp: new Date().toISOString(),
    });

    const broadcast = await this.broadcastEntity.findById(broadcastId);
    if (!broadcast) {
      throw new Error(`Broadcast ${broadcastId} not found`);
    }

    // Update status to SENDING
    await this.broadcastEntity.updateStatus(
      broadcastId,
      BroadcastStatus.SENDING,
    );

    // Get all recipients
    const recipients = await this.prisma.messageRecipient.findMany({
      where: { broadcastId },
    });

    this.logger.log({
      message: 'Starting broadcast delivery',
      broadcastId,
      recipientCount: recipients.length,
      channel: broadcast.channel,
      timestamp: new Date().toISOString(),
    });

    let sentCount = 0;
    let failedCount = 0;

    for (const recipient of recipients) {
      try {
        const success = await this.sendToRecipient(broadcast, recipient);
        if (success) {
          sentCount++;
        } else {
          failedCount++;
          this.logger.warn({
            message: 'All channels failed for recipient',
            broadcastId,
            recipientId: recipient.recipientId,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (error) {
        failedCount++;
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error';
        await this.recipientEntity.markFailed(recipient.id, errorMessage);

        this.logger.warn({
          message: 'Failed to send to recipient',
          broadcastId,
          recipientId: recipient.recipientId,
          error: errorMessage,
          timestamp: new Date().toISOString(),
        });
      }

      // Rate limiting: wait between messages
      await this.delay(RATE_LIMIT_DELAY_MS);
    }

    // Determine final status
    const finalStatus =
      failedCount === 0
        ? BroadcastStatus.SENT
        : sentCount === 0
          ? BroadcastStatus.FAILED
          : BroadcastStatus.PARTIALLY_SENT;

    // Update broadcast with final counts and status
    await this.broadcastEntity.updateStatus(broadcastId, finalStatus, {
      sentCount,
      failedCount,
    });

    // Audit log
    await this.auditLogService.logAction({
      tenantId,
      entityType: 'BroadcastMessage',
      entityId: broadcastId,
      action: AuditAction.UPDATE,
      afterValue: {
        status: finalStatus,
        sentCount,
        failedCount,
        completedAt: new Date().toISOString(),
      },
      changeSummary: `Broadcast completed: ${sentCount} sent, ${failedCount} failed (status: ${finalStatus})`,
    });

    this.logger.log({
      message: 'Broadcast delivery completed',
      broadcastId,
      finalStatus,
      sentCount,
      failedCount,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Send message to a single recipient via the appropriate channel(s)
   * Returns true if at least one channel succeeded, false if all failed.
   */
  private async sendToRecipient(
    broadcast: BroadcastMessage,
    recipient: MessageRecipient,
  ): Promise<boolean> {
    const channel = broadcast.channel as CommunicationChannel;
    let anySuccess = false;
    let channelAttempted = false;

    // Send via email if applicable
    if (
      (channel === CommunicationChannel.EMAIL ||
        channel === CommunicationChannel.ALL) &&
      recipient.recipientEmail
    ) {
      channelAttempted = true;
      try {
        const result = await this.emailService.sendRaw({
          to: recipient.recipientEmail,
          subject: broadcast.subject ?? 'Message from your Creche',
          text: broadcast.body,
          html: broadcast.htmlBody ?? undefined,
        });

        await this.recipientEntity.updateEmailStatus(
          broadcast.id,
          recipient.recipientId,
          DeliveryStatus.SENT,
          result?.messageId,
        );

        anySuccess = true;
        this.logger.debug({
          message: 'Email sent successfully',
          broadcastId: broadcast.id,
          recipientId: recipient.recipientId,
          messageId: result?.messageId,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Email send failed';
        await this.recipientEntity.updateEmailStatus(
          broadcast.id,
          recipient.recipientId,
          DeliveryStatus.FAILED,
          undefined,
          errorMessage,
        );
        // Don't throw - continue with other channels
        this.logger.warn({
          message: 'Email send failed',
          broadcastId: broadcast.id,
          recipientId: recipient.recipientId,
          error: errorMessage,
        });
      }
    }

    // Send via WhatsApp if applicable
    if (
      (channel === CommunicationChannel.WHATSAPP ||
        channel === CommunicationChannel.ALL) &&
      recipient.recipientPhone
    ) {
      channelAttempted = true;
      try {
        const result = await this.whatsappService.sendTextMessage(
          recipient.recipientPhone,
          broadcast.body,
        );

        await this.recipientEntity.updateWhatsAppStatus(
          broadcast.id,
          recipient.recipientId,
          DeliveryStatus.SENT,
          result?.wamid,
        );

        anySuccess = true;
        this.logger.debug({
          message: 'WhatsApp message sent successfully',
          broadcastId: broadcast.id,
          recipientId: recipient.recipientId,
          wamid: result?.wamid,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'WhatsApp send failed';
        await this.recipientEntity.updateWhatsAppStatus(
          broadcast.id,
          recipient.recipientId,
          DeliveryStatus.FAILED,
          undefined,
          errorMessage,
        );
        // Don't throw - let other recipients continue
        this.logger.warn({
          message: 'WhatsApp send failed',
          broadcastId: broadcast.id,
          recipientId: recipient.recipientId,
          error: errorMessage,
        });
      }
    }

    // Note: SMS channel not implemented yet (TASK-COMM-002 scope)
    // When implementing, add similar pattern for SMS

    // Return success only if at least one channel succeeded
    // (or if no channels were applicable/attempted)
    return anySuccess || !channelAttempted;
  }

  /**
   * Handle job failure
   */
  @OnQueueFailed()
  async handleFailed(job: Job<BroadcastJobData>, error: Error): Promise<void> {
    const { broadcastId, tenantId } = job.data;

    this.logger.error({
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      file: 'broadcast.processor.ts',
      function: 'handleFailed',
      jobId: job.id,
      broadcastId,
      attemptsMade: job.attemptsMade,
      timestamp: new Date().toISOString(),
    });

    // Update broadcast status to FAILED
    try {
      await this.broadcastEntity.updateStatus(
        broadcastId,
        BroadcastStatus.FAILED,
      );

      await this.auditLogService.logAction({
        tenantId,
        entityType: 'BroadcastMessage',
        entityId: broadcastId,
        action: AuditAction.UPDATE,
        afterValue: {
          status: BroadcastStatus.FAILED,
          error: error.message,
          failedAt: new Date().toISOString(),
        },
        changeSummary: `Broadcast processing failed: ${error.message}`,
      });
    } catch (updateError) {
      this.logger.error({
        message: 'Failed to update broadcast status after job failure',
        broadcastId,
        error:
          updateError instanceof Error
            ? updateError.message
            : String(updateError),
      });
    }
  }

  /**
   * Helper to add delay between operations
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
