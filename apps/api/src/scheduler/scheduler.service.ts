import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, Job, JobCounts } from 'bull';
import {
  QUEUE_NAMES,
  QueueName,
  ScheduledJobData,
  InvoiceGenerationJobData,
  PaymentReminderJobData,
  SarsDeadlineJobData,
  BankSyncJobData,
  StatementGenerationJobData,
  JobOptions,
  DEFAULT_JOB_OPTIONS,
  QueueMetrics,
  JobStatus,
} from './types/scheduler.types';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.INVOICE_GENERATION)
    private readonly invoiceQueue: Queue<InvoiceGenerationJobData>,
    @InjectQueue(QUEUE_NAMES.PAYMENT_REMINDER)
    private readonly paymentQueue: Queue<PaymentReminderJobData>,
    @InjectQueue(QUEUE_NAMES.SARS_DEADLINE)
    private readonly sarsQueue: Queue<SarsDeadlineJobData>,
    @InjectQueue(QUEUE_NAMES.BANK_SYNC)
    private readonly bankQueue: Queue<BankSyncJobData>,
    @InjectQueue(QUEUE_NAMES.STATEMENT_GENERATION)
    private readonly statementQueue: Queue<StatementGenerationJobData>,
  ) {}

  private getQueue(queueName: QueueName): Queue<ScheduledJobData> {
    switch (queueName) {
      case QUEUE_NAMES.INVOICE_GENERATION:
        return this.invoiceQueue as Queue<ScheduledJobData>;
      case QUEUE_NAMES.PAYMENT_REMINDER:
        return this.paymentQueue as Queue<ScheduledJobData>;
      case QUEUE_NAMES.SARS_DEADLINE:
        return this.sarsQueue as Queue<ScheduledJobData>;
      case QUEUE_NAMES.BANK_SYNC:
        return this.bankQueue as Queue<ScheduledJobData>;
      case QUEUE_NAMES.STATEMENT_GENERATION:
        return this.statementQueue as Queue<ScheduledJobData>;
      default:
        throw new Error(`Unknown queue name: ${queueName}`);
    }
  }

  async scheduleJob<T extends ScheduledJobData>(
    queueName: QueueName,
    jobData: T,
    options?: JobOptions,
  ): Promise<Job<T>> {
    try {
      const queue = this.getQueue(queueName);
      const mergedOptions = { ...DEFAULT_JOB_OPTIONS, ...options };

      const job = await queue.add(jobData, mergedOptions);

      this.logger.log({
        message: 'Job scheduled',
        queueName,
        jobId: job.id,
        tenantId: jobData.tenantId,
        triggeredBy: jobData.triggeredBy,
        options: mergedOptions,
        timestamp: new Date().toISOString(),
      });

      return job as Job<T>;
    } catch (error) {
      this.logger.error({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        file: 'scheduler.service.ts',
        function: 'scheduleJob',
        inputs: { queueName, jobData, options },
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async scheduleCronJob<T extends ScheduledJobData>(
    queueName: QueueName,
    jobData: T,
    cronExpression: string,
    options?: JobOptions,
  ): Promise<Job<T>> {
    try {
      const queue = this.getQueue(queueName);
      const mergedOptions = {
        ...DEFAULT_JOB_OPTIONS,
        ...options,
        repeat: { cron: cronExpression },
      };

      const job = await queue.add(jobData, mergedOptions);

      this.logger.log({
        message: 'Cron job scheduled',
        queueName,
        jobId: job.id,
        tenantId: jobData.tenantId,
        cronExpression,
        options: mergedOptions,
        timestamp: new Date().toISOString(),
      });

      return job as Job<T>;
    } catch (error) {
      this.logger.error({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        file: 'scheduler.service.ts',
        function: 'scheduleCronJob',
        inputs: { queueName, jobData, cronExpression, options },
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async getJobStatus(
    queueName: QueueName,
    jobId: string,
  ): Promise<JobStatus | null> {
    try {
      const queue = this.getQueue(queueName);
      const job = await queue.getJob(jobId);

      if (!job) {
        return null;
      }

      const state = await job.getState();

      return {
        id: job.id as string,
        state: state as JobStatus['state'],
        progress: job.progress() as number,
        attemptsMade: job.attemptsMade,
        failedReason: job.failedReason,
        finishedOn: job.finishedOn ? new Date(job.finishedOn) : undefined,
      };
    } catch (error) {
      this.logger.error({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        file: 'scheduler.service.ts',
        function: 'getJobStatus',
        inputs: { queueName, jobId },
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async getQueueMetrics(queueName: QueueName): Promise<QueueMetrics> {
    try {
      const queue = this.getQueue(queueName);
      const counts: JobCounts = await queue.getJobCounts();

      return {
        waiting: counts.waiting || 0,
        active: counts.active || 0,
        completed: counts.completed || 0,
        failed: counts.failed || 0,
        delayed: counts.delayed || 0,
      };
    } catch (error) {
      this.logger.error({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        file: 'scheduler.service.ts',
        function: 'getQueueMetrics',
        inputs: { queueName },
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async retryFailedJobs(queueName: QueueName): Promise<number> {
    try {
      const queue = this.getQueue(queueName);
      const failedJobs = await queue.getFailed();

      let retriedCount = 0;
      for (const job of failedJobs) {
        await job.retry();
        retriedCount++;
      }

      this.logger.log({
        message: 'Failed jobs retried',
        queueName,
        retriedCount,
        timestamp: new Date().toISOString(),
      });

      return retriedCount;
    } catch (error) {
      this.logger.error({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        file: 'scheduler.service.ts',
        function: 'retryFailedJobs',
        inputs: { queueName },
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async removeCompletedJobs(
    queueName: QueueName,
    olderThanMs: number = 86400000,
  ): Promise<number> {
    try {
      const queue = this.getQueue(queueName);
      const completedJobs = await queue.getCompleted();

      const cutoffTime = Date.now() - olderThanMs;
      let removedCount = 0;

      for (const job of completedJobs) {
        if (job.finishedOn && job.finishedOn < cutoffTime) {
          await job.remove();
          removedCount++;
        }
      }

      this.logger.log({
        message: 'Completed jobs removed',
        queueName,
        removedCount,
        olderThanMs,
        timestamp: new Date().toISOString(),
      });

      return removedCount;
    } catch (error) {
      this.logger.error({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        file: 'scheduler.service.ts',
        function: 'removeCompletedJobs',
        inputs: { queueName, olderThanMs },
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async pauseQueue(queueName: QueueName): Promise<void> {
    try {
      const queue = this.getQueue(queueName);
      await queue.pause();

      this.logger.log({
        message: 'Queue paused',
        queueName,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        file: 'scheduler.service.ts',
        function: 'pauseQueue',
        inputs: { queueName },
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }

  async resumeQueue(queueName: QueueName): Promise<void> {
    try {
      const queue = this.getQueue(queueName);
      await queue.resume();

      this.logger.log({
        message: 'Queue resumed',
        queueName,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      this.logger.error({
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
        file: 'scheduler.service.ts',
        function: 'resumeQueue',
        inputs: { queueName },
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
}
