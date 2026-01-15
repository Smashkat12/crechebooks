/**
 * Shutdown Service
 * TASK-INFRA-007: Implement Bull Queue Graceful Shutdown
 *
 * Handles graceful shutdown of Bull queues during application termination.
 * Implements OnApplicationShutdown lifecycle hook to:
 * - Pause all queues to stop accepting new jobs
 * - Wait for active jobs to complete with configurable timeout
 * - Close queue connections properly
 *
 * Integrates with health check to return 503 during shutdown.
 */

import {
  Injectable,
  OnApplicationShutdown,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue } from 'bull';
import { StructuredLoggerService } from '../logger';
import { QUEUE_NAMES } from '../../scheduler/types/scheduler.types';
import { SIMPLEPAY_SYNC_QUEUE } from '../../integrations/simplepay/simplepay-sync.processor';
import { ConfigService } from '@nestjs/config';

/**
 * Queue metadata for tracking during shutdown
 */
interface QueueInfo {
  name: string;
  queue: Queue;
}

/**
 * Shutdown timeout configuration
 * Default: 30 seconds
 */
const DEFAULT_SHUTDOWN_TIMEOUT = 30000;

/**
 * Poll interval for checking active jobs
 */
const POLL_INTERVAL = 500;

@Injectable()
export class ShutdownService implements OnApplicationShutdown {
  private readonly logger: StructuredLoggerService;
  private _isShuttingDown = false;
  private readonly shutdownTimeout: number;
  private readonly queues: QueueInfo[] = [];

  constructor(
    loggerService: StructuredLoggerService,
    private readonly configService: ConfigService,
    @Optional()
    @InjectQueue(QUEUE_NAMES.INVOICE_GENERATION)
    invoiceQueue?: Queue,
    @Optional()
    @InjectQueue(QUEUE_NAMES.PAYMENT_REMINDER)
    paymentReminderQueue?: Queue,
    @Optional()
    @InjectQueue(QUEUE_NAMES.SARS_DEADLINE)
    sarsDeadlineQueue?: Queue,
    @Optional()
    @InjectQueue(QUEUE_NAMES.BANK_SYNC)
    bankSyncQueue?: Queue,
    @Optional()
    @InjectQueue(QUEUE_NAMES.STATEMENT_GENERATION)
    statementGenerationQueue?: Queue,
    @Optional()
    @InjectQueue(SIMPLEPAY_SYNC_QUEUE)
    simplePaySyncQueue?: Queue,
  ) {
    this.logger = loggerService;
    this.logger.setContext(ShutdownService.name);

    // Get timeout from environment or use default
    this.shutdownTimeout =
      this.configService.get<number>('SHUTDOWN_TIMEOUT') ??
      DEFAULT_SHUTDOWN_TIMEOUT;

    // Collect all available queues
    if (invoiceQueue) {
      this.queues.push({
        name: QUEUE_NAMES.INVOICE_GENERATION,
        queue: invoiceQueue,
      });
    }
    if (paymentReminderQueue) {
      this.queues.push({
        name: QUEUE_NAMES.PAYMENT_REMINDER,
        queue: paymentReminderQueue,
      });
    }
    if (sarsDeadlineQueue) {
      this.queues.push({
        name: QUEUE_NAMES.SARS_DEADLINE,
        queue: sarsDeadlineQueue,
      });
    }
    if (bankSyncQueue) {
      this.queues.push({ name: QUEUE_NAMES.BANK_SYNC, queue: bankSyncQueue });
    }
    if (statementGenerationQueue) {
      this.queues.push({
        name: QUEUE_NAMES.STATEMENT_GENERATION,
        queue: statementGenerationQueue,
      });
    }
    if (simplePaySyncQueue) {
      this.queues.push({
        name: SIMPLEPAY_SYNC_QUEUE,
        queue: simplePaySyncQueue,
      });
    }

    this.logger.debug(
      `ShutdownService initialized with ${this.queues.length} queues`,
      {
        queueNames: this.queues.map((q) => q.name),
        shutdownTimeout: this.shutdownTimeout,
      },
    );
  }

  /**
   * Returns true if the application is in shutdown mode.
   * Health check uses this to return 503 during shutdown.
   */
  get isShuttingDown(): boolean {
    return this._isShuttingDown;
  }

  /**
   * NestJS lifecycle hook called when the application receives SIGTERM/SIGINT.
   * Gracefully shuts down all Bull queues.
   *
   * @param signal - The signal that triggered shutdown (e.g., 'SIGTERM')
   */
  async onApplicationShutdown(signal?: string): Promise<void> {
    this._isShuttingDown = true;
    const startTime = Date.now();

    this.logger.log(`Graceful shutdown initiated`, {
      signal,
      queueCount: this.queues.length,
      timeout: this.shutdownTimeout,
    });

    if (this.queues.length === 0) {
      this.logger.log('No queues to shut down, skipping graceful shutdown');
      return;
    }

    try {
      // Step 1: Pause all queues to stop accepting new jobs
      await this.pauseAllQueues();

      // Step 2: Wait for active jobs with timeout
      await this.waitForActiveJobs();

      // Step 3: Close all queue connections
      await this.closeAllQueues();

      const duration = Date.now() - startTime;
      this.logger.log(`Graceful shutdown completed`, {
        durationMs: duration,
        queueCount: this.queues.length,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error(`Error during graceful shutdown`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        durationMs: duration,
      });
      // Don't re-throw - allow shutdown to continue even if queue shutdown fails
    }
  }

  /**
   * Pause all registered queues to stop accepting new jobs.
   * Logs progress and handles errors gracefully.
   */
  private async pauseAllQueues(): Promise<void> {
    this.logger.log('Pausing all queues...');

    const pauseResults = await Promise.allSettled(
      this.queues.map(async ({ name, queue }) => {
        try {
          await queue.pause(true); // true = pause locally only
          this.logger.debug(`Queue paused: ${name}`);
          return { name, success: true };
        } catch (error) {
          this.logger.warn(`Failed to pause queue: ${name}`, {
            error: error instanceof Error ? error.message : String(error),
          });
          return { name, success: false, error };
        }
      }),
    );

    const successCount = pauseResults.filter(
      (r) => r.status === 'fulfilled' && r.value.success,
    ).length;
    this.logger.log(`Queues paused: ${successCount}/${this.queues.length}`);
  }

  /**
   * Wait for all active jobs to complete or until timeout is reached.
   * Polls queue job counts at regular intervals.
   */
  private async waitForActiveJobs(): Promise<void> {
    const deadline = Date.now() + this.shutdownTimeout;

    this.logger.log('Waiting for active jobs to complete...', {
      timeout: this.shutdownTimeout,
    });

    while (Date.now() < deadline) {
      const totalActive = await this.getTotalActiveJobs();

      if (totalActive === 0) {
        this.logger.log('All active jobs completed');
        return;
      }

      this.logger.debug(`Active jobs remaining: ${totalActive}`, {
        remainingTimeMs: deadline - Date.now(),
      });

      // Wait before next poll
      await this.sleep(POLL_INTERVAL);
    }

    // Timeout reached
    const remainingJobs = await this.getTotalActiveJobs();
    if (remainingJobs > 0) {
      this.logger.warn(
        `Shutdown timeout reached with ${remainingJobs} active jobs remaining`,
        {
          timeout: this.shutdownTimeout,
        },
      );
    }
  }

  /**
   * Get the total count of active jobs across all queues.
   */
  private async getTotalActiveJobs(): Promise<number> {
    let totalActive = 0;

    for (const { name, queue } of this.queues) {
      try {
        const counts = await queue.getJobCounts();
        totalActive += counts.active || 0;
      } catch (error) {
        this.logger.warn(`Failed to get job counts for queue: ${name}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return totalActive;
  }

  /**
   * Close all queue connections.
   * Called after active jobs complete or timeout is reached.
   */
  private async closeAllQueues(): Promise<void> {
    this.logger.log('Closing queue connections...');

    const closeResults = await Promise.allSettled(
      this.queues.map(async ({ name, queue }) => {
        try {
          await queue.close();
          this.logger.debug(`Queue connection closed: ${name}`);
          return { name, success: true };
        } catch (error) {
          this.logger.warn(`Failed to close queue connection: ${name}`, {
            error: error instanceof Error ? error.message : String(error),
          });
          return { name, success: false, error };
        }
      }),
    );

    const successCount = closeResults.filter(
      (r) => r.status === 'fulfilled' && r.value.success,
    ).length;
    this.logger.log(
      `Queue connections closed: ${successCount}/${this.queues.length}`,
    );
  }

  /**
   * Helper to sleep for a given duration.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
