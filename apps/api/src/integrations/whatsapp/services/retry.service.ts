/**
 * WhatsApp Retry Service
 * TASK-WA-006: WhatsApp Message Retry Service with BullMQ
 *
 * Manages failed message retries with:
 * - Exponential backoff
 * - Configurable max retries
 * - Dead letter queue handling
 * - Retry statistics
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, Job } from 'bull';
import {
  QUEUE_NAMES,
  WhatsAppRetryJobData,
} from '../../../scheduler/types/scheduler.types';
import { WhatsAppMessageEntity } from '../entities/whatsapp-message.entity';
import {
  WhatsAppMessageStatus,
  WhatsAppContextType,
} from '../types/message-history.types';
import { TemplateComponent } from '../types/whatsapp.types';
import { WhatsAppRetryProcessor } from '../processors/whatsapp-retry.processor';

/**
 * Retry configuration
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxRetries?: number;
  /** Initial delay in milliseconds */
  initialDelay?: number;
  /** Priority (1-10, lower is higher priority) */
  priority?: number;
}

/**
 * Retry statistics
 */
export interface RetryStats {
  /** Total messages in retry queue */
  pending: number;
  /** Messages currently being processed */
  active: number;
  /** Successfully retried messages */
  completed: number;
  /** Permanently failed messages */
  failed: number;
  /** Messages waiting for retry (delayed) */
  delayed: number;
}

const DEFAULT_CONFIG: Required<RetryConfig> = {
  maxRetries: 5,
  initialDelay: 30000, // 30 seconds
  priority: 5,
};

@Injectable()
export class WhatsAppRetryService {
  private readonly logger = new Logger(WhatsAppRetryService.name);
  private readonly isQueueAvailable: boolean;

  constructor(
    @Optional()
    @InjectQueue(QUEUE_NAMES.WHATSAPP_RETRY)
    private readonly retryQueue?: Queue<WhatsAppRetryJobData>,
    @Optional() private readonly messageEntity?: WhatsAppMessageEntity,
  ) {
    this.isQueueAvailable = !!retryQueue;

    if (!this.isQueueAvailable) {
      this.logger.warn(
        'WhatsApp retry queue not available. Redis may not be configured. ' +
          'Failed messages will not be retried automatically.',
      );
    } else {
      this.logger.log('WhatsApp retry service initialized');
    }
  }

  /**
   * Schedule a message for retry
   *
   * @param messageId - Internal message ID
   * @param recipientPhone - Recipient phone number (E.164)
   * @param templateName - Template name to use
   * @param components - Template components
   * @param contextType - Context type (INVOICE, STATEMENT, etc.)
   * @param contextId - Context ID
   * @param config - Retry configuration
   * @returns Job ID or null if queue unavailable
   */
  async scheduleRetry(
    messageId: string,
    recipientPhone: string,
    templateName: string,
    components: TemplateComponent[],
    contextType: WhatsAppContextType,
    contextId?: string,
    config?: RetryConfig,
  ): Promise<string | null> {
    if (!this.retryQueue) {
      this.logger.warn({
        message: 'Retry queue not available, cannot schedule retry',
        messageId,
        timestamp: new Date().toISOString(),
      });
      return null;
    }

    const retryConfig = { ...DEFAULT_CONFIG, ...config };
    const delay = WhatsAppRetryProcessor.calculateDelay(0);

    const jobData: WhatsAppRetryJobData = {
      tenantId: 'system', // Will be extracted from message if needed
      triggeredBy: 'event',
      scheduledAt: new Date(),
      messageId,
      recipientPhone,
      templateName,
      components,
      contextType,
      contextId,
      retryCount: 0,
      maxRetries: retryConfig.maxRetries,
    };

    const job = await this.retryQueue.add(jobData, {
      delay,
      priority: retryConfig.priority,
      attempts: retryConfig.maxRetries,
      backoff: {
        type: 'exponential',
        delay: retryConfig.initialDelay,
      },
      removeOnComplete: 100, // Keep last 100 completed jobs
      removeOnFail: false, // Keep failed jobs for analysis
    });

    this.logger.log({
      message: 'Scheduled WhatsApp message for retry',
      jobId: job.id,
      messageId,
      recipientPhone,
      templateName,
      delay,
      maxRetries: retryConfig.maxRetries,
      timestamp: new Date().toISOString(),
    });

    return String(job.id);
  }

  /**
   * Schedule retry from a failed message record
   */
  async scheduleRetryFromMessage(
    messageId: string,
    errorCode?: string,
    errorMessage?: string,
    config?: RetryConfig,
  ): Promise<string | null> {
    if (!this.messageEntity) {
      this.logger.warn(
        'MessageEntity not available, cannot fetch message details',
      );
      return null;
    }

    // Get the message details
    // Note: This requires reading from database, which we'll do via the entity
    const message = await this.messageEntity.findById(messageId);

    if (!message) {
      this.logger.error({
        error: { message: 'Message not found', name: 'NotFoundError' },
        file: 'retry.service.ts',
        function: 'scheduleRetryFromMessage',
        inputs: { messageId },
        timestamp: new Date().toISOString(),
      });
      return null;
    }

    return this.scheduleRetry(
      messageId,
      message.recipientPhone,
      message.templateName,
      (message.templateParams as unknown as TemplateComponent[]) || [],
      message.contextType as WhatsAppContextType,
      message.contextId ?? undefined,
      {
        ...config,
        maxRetries: config?.maxRetries ?? DEFAULT_CONFIG.maxRetries,
      },
    );
  }

  /**
   * Cancel a pending retry
   */
  async cancelRetry(jobId: string): Promise<boolean> {
    if (!this.retryQueue) {
      return false;
    }

    try {
      const job = await this.retryQueue.getJob(jobId);
      if (job) {
        await job.remove();
        this.logger.log({
          message: 'Cancelled retry job',
          jobId,
          timestamp: new Date().toISOString(),
        });
        return true;
      }
    } catch (error) {
      this.logger.error({
        error: {
          message: error instanceof Error ? error.message : String(error),
          name: error instanceof Error ? error.name : 'UnknownError',
        },
        file: 'retry.service.ts',
        function: 'cancelRetry',
        inputs: { jobId },
        timestamp: new Date().toISOString(),
      });
    }

    return false;
  }

  /**
   * Get retry queue statistics
   */
  async getStats(): Promise<RetryStats | null> {
    if (!this.retryQueue) {
      return null;
    }

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.retryQueue.getWaitingCount(),
      this.retryQueue.getActiveCount(),
      this.retryQueue.getCompletedCount(),
      this.retryQueue.getFailedCount(),
      this.retryQueue.getDelayedCount(),
    ]);

    return {
      pending: waiting,
      active,
      completed,
      failed,
      delayed,
    };
  }

  /**
   * Get pending retry jobs for a specific message
   */
  async getPendingRetries(
    messageId: string,
  ): Promise<Job<WhatsAppRetryJobData>[]> {
    if (!this.retryQueue) {
      return [];
    }

    const jobs = await this.retryQueue.getJobs([
      'waiting',
      'delayed',
      'active',
    ]);
    return jobs.filter((job) => job.data.messageId === messageId);
  }

  /**
   * Get failed retry jobs
   */
  async getFailedRetries(
    limit: number = 100,
  ): Promise<Job<WhatsAppRetryJobData>[]> {
    if (!this.retryQueue) {
      return [];
    }

    return this.retryQueue.getFailed(0, limit - 1);
  }

  /**
   * Retry all failed jobs
   */
  async retryAllFailed(): Promise<number> {
    if (!this.retryQueue) {
      return 0;
    }

    const failedJobs = await this.retryQueue.getFailed();
    let retriedCount = 0;

    for (const job of failedJobs) {
      try {
        await job.retry();
        retriedCount++;
      } catch (error) {
        this.logger.error({
          error: {
            message: error instanceof Error ? error.message : String(error),
            name: error instanceof Error ? error.name : 'UnknownError',
          },
          file: 'retry.service.ts',
          function: 'retryAllFailed',
          jobId: job.id,
          timestamp: new Date().toISOString(),
        });
      }
    }

    this.logger.log({
      message: 'Retried all failed jobs',
      totalFailed: failedJobs.length,
      retriedCount,
      timestamp: new Date().toISOString(),
    });

    return retriedCount;
  }

  /**
   * Clean completed jobs older than specified time
   */
  async cleanCompletedJobs(
    olderThanMs: number = 24 * 60 * 60 * 1000,
  ): Promise<number> {
    if (!this.retryQueue) {
      return 0;
    }

    const cleaned = await this.retryQueue.clean(olderThanMs, 'completed');

    this.logger.log({
      message: 'Cleaned completed retry jobs',
      cleanedCount: cleaned.length,
      olderThanMs,
      timestamp: new Date().toISOString(),
    });

    return cleaned.length;
  }

  /**
   * Check if queue is available
   */
  isAvailable(): boolean {
    return this.isQueueAvailable;
  }

  /**
   * Get queue health status
   */
  async getHealth(): Promise<{
    available: boolean;
    connected: boolean;
    stats: RetryStats | null;
  }> {
    const stats = await this.getStats();

    return {
      available: this.isQueueAvailable,
      connected: this.isQueueAvailable && stats !== null,
      stats,
    };
  }
}
