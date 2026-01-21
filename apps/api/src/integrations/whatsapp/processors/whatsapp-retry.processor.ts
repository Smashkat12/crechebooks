/**
 * WhatsApp Retry Processor
 * TASK-WA-006: WhatsApp Message Retry Service with BullMQ
 *
 * Processes failed WhatsApp messages with exponential backoff.
 * Implements retry logic with configurable max retries and delay.
 */

import { Processor, Process, OnQueueFailed } from '@nestjs/bull';
import { Logger, Injectable } from '@nestjs/common';
import type { Job } from 'bull';
import {
  QUEUE_NAMES,
  WhatsAppRetryJobData,
} from '../../../scheduler/types/scheduler.types';
import { WhatsAppService } from '../whatsapp.service';
import { WhatsAppMessageEntity } from '../entities/whatsapp-message.entity';
import { WhatsAppMessageStatus } from '../types/message-history.types';
import { TemplateComponent } from '../types/whatsapp.types';

/**
 * Retry delay configuration (in milliseconds)
 */
const RETRY_DELAYS = {
  /** Initial delay: 30 seconds */
  INITIAL: 30 * 1000,
  /** Max delay: 1 hour */
  MAX: 60 * 60 * 1000,
  /** Backoff multiplier */
  MULTIPLIER: 2,
};

/**
 * Default max retries
 */
const DEFAULT_MAX_RETRIES = 5;

@Injectable()
@Processor(QUEUE_NAMES.WHATSAPP_RETRY)
export class WhatsAppRetryProcessor {
  private readonly logger = new Logger(WhatsAppRetryProcessor.name);

  constructor(
    private readonly whatsAppService: WhatsAppService,
    private readonly messageEntity: WhatsAppMessageEntity,
  ) {}

  /**
   * Process a retry job
   */
  @Process()
  async handleRetry(job: Job<WhatsAppRetryJobData>): Promise<void> {
    const { data } = job;
    const {
      messageId,
      recipientPhone,
      templateName,
      components,
      retryCount,
      maxRetries,
      contextType,
      contextId,
    } = data;

    this.logger.log({
      message: 'Processing WhatsApp retry job',
      jobId: job.id,
      messageId,
      recipientPhone,
      templateName,
      retryCount,
      maxRetries,
      timestamp: new Date().toISOString(),
    });

    // Check if we've exceeded max retries
    if (retryCount >= maxRetries) {
      this.logger.warn({
        message: 'Max retries exceeded, marking message as permanently failed',
        jobId: job.id,
        messageId,
        retryCount,
        maxRetries,
        timestamp: new Date().toISOString(),
      });

      await this.messageEntity.markAsFailed(
        messageId,
        'MAX_RETRIES_EXCEEDED',
        `Failed after ${retryCount} retry attempts`,
      );

      return;
    }

    try {
      // Attempt to send the message
      const result = await this.whatsAppService.sendTemplate(
        recipientPhone,
        templateName as any, // templateName is already validated
        components as TemplateComponent[],
      );

      // Update the message record with success
      await this.messageEntity.markAsSent(messageId, result.messageId);

      this.logger.log({
        message: 'WhatsApp retry successful',
        jobId: job.id,
        messageId,
        wamid: result.messageId,
        retryCount,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorCode = this.extractErrorCode(error);

      this.logger.error({
        error: {
          message: errorMessage,
          name: error instanceof Error ? error.name : 'UnknownError',
          code: errorCode,
        },
        file: 'whatsapp-retry.processor.ts',
        function: 'handleRetry',
        inputs: { messageId, recipientPhone, templateName, retryCount },
        timestamp: new Date().toISOString(),
      });

      // Check if error is permanent (shouldn't retry)
      if (this.isPermanentError(errorCode)) {
        this.logger.warn({
          message: 'Permanent error, not retrying',
          errorCode,
          messageId,
          timestamp: new Date().toISOString(),
        });

        await this.messageEntity.markAsFailed(
          messageId,
          errorCode,
          errorMessage,
        );

        return;
      }

      // Update message status to reflect retry attempt
      await this.messageEntity.updateStatus({
        wamid: messageId, // Use messageId as fallback if no wamid
        status: WhatsAppMessageStatus.PENDING,
        timestamp: new Date(),
        errorCode,
        errorMessage: `Retry ${retryCount + 1}/${maxRetries}: ${errorMessage}`,
      });

      // Re-throw to trigger Bull's retry mechanism
      throw error;
    }
  }

  /**
   * Handle job failure
   */
  @OnQueueFailed()
  async handleFailed(
    job: Job<WhatsAppRetryJobData>,
    error: Error,
  ): Promise<void> {
    const { data } = job;

    this.logger.error({
      error: {
        message: error.message,
        name: error.name,
        stack: error.stack,
      },
      file: 'whatsapp-retry.processor.ts',
      function: 'handleFailed',
      jobId: job.id,
      messageId: data.messageId,
      attemptsMade: job.attemptsMade,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Extract error code from WhatsApp API error
   */
  private extractErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
      return String((error as { code: unknown }).code);
    }

    if (error instanceof Error) {
      // Parse error code from message if possible
      const match = error.message.match(/code[:\s]+(\d+)/i);
      if (match) {
        return match[1];
      }
    }

    return 'UNKNOWN';
  }

  /**
   * Check if an error is permanent and shouldn't be retried
   *
   * WhatsApp API Error Codes:
   * - 100: Invalid parameter (permanent)
   * - 131000: Invalid recipient (permanent)
   * - 131005: User not opted in (permanent)
   * - 131026: Message failed to send (temporary, can retry)
   * - 131047: Re-engagement message (permanent)
   * - 131048: Spam rate limit (temporary, can retry)
   * - 131051: Unsupported message type (permanent)
   * - 131052: Media download failed (temporary, can retry)
   * - 131053: Media upload failed (temporary, can retry)
   * - 368: Temporarily blocked (temporary, can retry)
   * - 500: Internal error (temporary, can retry)
   */
  private isPermanentError(errorCode: string): boolean {
    const permanentErrors = [
      '100', // Invalid parameter
      '131000', // Invalid recipient
      '131005', // User not opted in
      '131047', // Re-engagement message
      '131051', // Unsupported message type
    ];

    return permanentErrors.includes(errorCode);
  }

  /**
   * Calculate exponential backoff delay
   */
  static calculateDelay(retryCount: number): number {
    const delay =
      RETRY_DELAYS.INITIAL * Math.pow(RETRY_DELAYS.MULTIPLIER, retryCount);
    return Math.min(delay, RETRY_DELAYS.MAX);
  }

  /**
   * Get default max retries
   */
  static getDefaultMaxRetries(): number {
    return DEFAULT_MAX_RETRIES;
  }
}
