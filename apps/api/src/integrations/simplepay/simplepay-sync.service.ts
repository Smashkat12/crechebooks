/**
 * SimplePay Sync Service
 * TASK-STAFF-003 / TASK-STAFF-010: SimplePay Sync Retry Queue
 *
 * Provides methods to queue SimplePay sync operations with retry capabilities.
 * Uses Bull queue with exponential backoff for reliable synchronization.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import type { Queue, Job, JobStatus } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { SIMPLEPAY_SYNC_QUEUE } from './simplepay-sync.processor';
import {
  SyncJobType,
  SyncJobPriority,
  QueueSyncJobOptions,
  SyncQueueStats,
  SyncJobStatus,
} from './dto/sync-job.dto';
import type {
  SyncJobData,
  CreateEmployeeSyncJobData,
  UpdateEmployeeSyncJobData,
  SyncLeaveSyncJobData,
  SyncPayrollSyncJobData,
  BulkEmployeeSyncJobData,
  SyncLeaveBalancesSyncJobData,
} from './dto/sync-job.dto';

/** Default job options */
const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: 'exponential' as const,
    delay: 2000, // 2s -> 4s -> 8s -> 16s -> 32s
  },
  removeOnComplete: 100,
  removeOnFail: false,
};

@Injectable()
export class SimplePaySyncService implements OnModuleInit {
  private readonly logger = new Logger(SimplePaySyncService.name);
  private queueAvailable = false;

  constructor(
    @InjectQueue(SIMPLEPAY_SYNC_QUEUE)
    private readonly syncQueue: Queue<SyncJobData>,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      // Check if queue is available
      await this.syncQueue.isReady();
      this.queueAvailable = true;
      this.logger.log('SimplePay sync queue initialized successfully');
    } catch (error) {
      this.queueAvailable = false;
      this.logger.warn(
        `SimplePay sync queue not available: ${error instanceof Error ? error.message : String(error)}. ` +
          'Sync operations will fail until Redis is configured.',
      );
    }
  }

  /**
   * Check if the queue is available
   */
  isQueueAvailable(): boolean {
    return this.queueAvailable;
  }

  /**
   * Queue an employee creation sync job
   */
  async queueEmployeeCreate(
    tenantId: string,
    staffId: string,
    options?: QueueSyncJobOptions,
  ): Promise<Job<CreateEmployeeSyncJobData>> {
    this.ensureQueueAvailable();

    const jobData: CreateEmployeeSyncJobData = {
      tenantId,
      type: SyncJobType.CREATE_EMPLOYEE,
      staffId,
      queuedAt: new Date(),
      triggeredBy: 'event',
      correlationId: uuidv4(),
    };

    return this.addJob(jobData, options);
  }

  /**
   * Queue an employee update sync job
   */
  async queueEmployeeUpdate(
    tenantId: string,
    staffId: string,
    simplePayEmployeeId: string,
    changedFields?: string[],
    options?: QueueSyncJobOptions,
  ): Promise<Job<UpdateEmployeeSyncJobData>> {
    this.ensureQueueAvailable();

    const jobData: UpdateEmployeeSyncJobData = {
      tenantId,
      type: SyncJobType.UPDATE_EMPLOYEE,
      staffId,
      simplePayEmployeeId,
      changedFields,
      queuedAt: new Date(),
      triggeredBy: 'event',
      correlationId: uuidv4(),
    };

    return this.addJob(jobData, options);
  }

  /**
   * Queue a leave sync job
   */
  async queueLeaveSync(
    tenantId: string,
    leaveRequestId: string,
    staffId: string,
    options?: QueueSyncJobOptions,
  ): Promise<Job<SyncLeaveSyncJobData>> {
    this.ensureQueueAvailable();

    const jobData: SyncLeaveSyncJobData = {
      tenantId,
      type: SyncJobType.SYNC_LEAVE,
      leaveRequestId,
      staffId,
      queuedAt: new Date(),
      triggeredBy: 'event',
      correlationId: uuidv4(),
    };

    return this.addJob(jobData, options);
  }

  /**
   * Queue a payroll sync job
   */
  async queuePayrollSync(
    tenantId: string,
    simplePayPayRunId?: string,
    waveId?: number,
    options?: QueueSyncJobOptions,
  ): Promise<Job<SyncPayrollSyncJobData>> {
    this.ensureQueueAvailable();

    const jobData: SyncPayrollSyncJobData = {
      tenantId,
      type: SyncJobType.SYNC_PAYROLL,
      simplePayPayRunId,
      waveId,
      queuedAt: new Date(),
      triggeredBy: simplePayPayRunId ? 'event' : 'scheduled',
      correlationId: uuidv4(),
    };

    return this.addJob(jobData, options);
  }

  /**
   * Queue a bulk employee sync job
   */
  async queueBulkEmployeeSync(
    tenantId: string,
    staffIds?: string[],
    options?: QueueSyncJobOptions,
  ): Promise<Job<BulkEmployeeSyncJobData>> {
    this.ensureQueueAvailable();

    const jobData: BulkEmployeeSyncJobData = {
      tenantId,
      type: SyncJobType.BULK_EMPLOYEE_SYNC,
      staffIds,
      queuedAt: new Date(),
      triggeredBy: 'manual',
      correlationId: uuidv4(),
    };

    return this.addJob(jobData, options);
  }

  /**
   * Queue a leave balances sync job
   */
  async queueLeaveBalancesSync(
    tenantId: string,
    staffId: string,
    simplePayEmployeeId: string,
    options?: QueueSyncJobOptions,
  ): Promise<Job<SyncLeaveBalancesSyncJobData>> {
    this.ensureQueueAvailable();

    const jobData: SyncLeaveBalancesSyncJobData = {
      tenantId,
      type: SyncJobType.SYNC_LEAVE_BALANCES,
      staffId,
      simplePayEmployeeId,
      queuedAt: new Date(),
      triggeredBy: 'event',
      correlationId: uuidv4(),
    };

    return this.addJob(jobData, options);
  }

  /**
   * Get status of a specific job
   */
  async getJobStatus(jobId: string): Promise<SyncJobStatus | null> {
    this.ensureQueueAvailable();

    const job = await this.syncQueue.getJob(jobId);
    if (!job) {
      return null;
    }

    const state = await job.getState();
    const data = job.data;

    return {
      id: String(job.id),
      type: data.type,
      state: state as SyncJobStatus['state'],
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason || undefined,
      createdAt: new Date(job.timestamp),
      processedAt: job.processedOn ? new Date(job.processedOn) : undefined,
      finishedAt: job.finishedOn ? new Date(job.finishedOn) : undefined,
      nextAttemptAt: job.opts?.delay
        ? new Date(Date.now() + job.opts.delay)
        : undefined,
    };
  }

  /**
   * Retry a failed job
   */
  async retryFailedJob(jobId: string): Promise<Job<SyncJobData>> {
    this.ensureQueueAvailable();

    const job = await this.syncQueue.getJob(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    const state = await job.getState();
    if (state !== 'failed') {
      throw new Error(
        `Job ${jobId} is not in failed state (current: ${state})`,
      );
    }

    // Create a new job with the same data
    const newJobData = {
      ...job.data,
      triggeredBy: 'retry' as const,
      queuedAt: new Date(),
      correlationId: uuidv4(),
    };

    this.logger.log({
      message: 'Retrying failed SimplePay sync job',
      originalJobId: jobId,
      type: newJobData.type,
      tenantId: newJobData.tenantId,
      timestamp: new Date().toISOString(),
    });

    return this.addJob(newJobData, { priority: SyncJobPriority.HIGH });
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<SyncQueueStats> {
    this.ensureQueueAvailable();

    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.syncQueue.getWaitingCount(),
      this.syncQueue.getActiveCount(),
      this.syncQueue.getCompletedCount(),
      this.syncQueue.getFailedCount(),
      this.syncQueue.getDelayedCount(),
    ]);

    // Get breakdown by job type
    const failedJobs = await this.syncQueue.getFailed(0, 100);
    const waitingJobs = await this.syncQueue.getWaiting(0, 100);

    const byType: SyncQueueStats['byType'] = {
      [SyncJobType.CREATE_EMPLOYEE]: { waiting: 0, failed: 0 },
      [SyncJobType.UPDATE_EMPLOYEE]: { waiting: 0, failed: 0 },
      [SyncJobType.SYNC_LEAVE]: { waiting: 0, failed: 0 },
      [SyncJobType.SYNC_PAYROLL]: { waiting: 0, failed: 0 },
      [SyncJobType.BULK_EMPLOYEE_SYNC]: { waiting: 0, failed: 0 },
      [SyncJobType.SYNC_LEAVE_BALANCES]: { waiting: 0, failed: 0 },
    };

    for (const job of failedJobs) {
      if (byType[job.data.type]) {
        byType[job.data.type].failed++;
      }
    }

    for (const job of waitingJobs) {
      if (byType[job.data.type]) {
        byType[job.data.type].waiting++;
      }
    }

    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      byType,
    };
  }

  /**
   * Get failed jobs
   */
  async getFailedJobs(
    start = 0,
    end = 20,
  ): Promise<Array<{ job: Job<SyncJobData>; error: string }>> {
    this.ensureQueueAvailable();

    const jobs = await this.syncQueue.getFailed(start, end);
    return jobs.map((job) => ({
      job,
      error: job.failedReason || 'Unknown error',
    }));
  }

  /**
   * Get jobs by tenant
   */
  async getJobsByTenant(
    tenantId: string,
    states: JobStatus[] = ['waiting', 'active', 'delayed', 'failed'],
  ): Promise<Job<SyncJobData>[]> {
    this.ensureQueueAvailable();

    const jobs: Job<SyncJobData>[] = [];

    for (const state of states) {
      let stateJobs: Job<SyncJobData>[] = [];

      switch (state) {
        case 'waiting':
          stateJobs = await this.syncQueue.getWaiting(0, 100);
          break;
        case 'active':
          stateJobs = await this.syncQueue.getActive(0, 100);
          break;
        case 'delayed':
          stateJobs = await this.syncQueue.getDelayed(0, 100);
          break;
        case 'failed':
          stateJobs = await this.syncQueue.getFailed(0, 100);
          break;
        case 'completed':
          stateJobs = await this.syncQueue.getCompleted(0, 100);
          break;
      }

      jobs.push(...stateJobs.filter((j) => j.data.tenantId === tenantId));
    }

    return jobs;
  }

  /**
   * Clean up old completed jobs
   */
  async cleanOldJobs(
    gracePeriodMs: number = 24 * 60 * 60 * 1000,
  ): Promise<number> {
    this.ensureQueueAvailable();

    const cleaned = await this.syncQueue.clean(gracePeriodMs, 'completed');
    this.logger.log(`Cleaned ${cleaned.length} old completed jobs`);
    return cleaned.length;
  }

  /**
   * Pause the queue
   */
  async pauseQueue(): Promise<void> {
    this.ensureQueueAvailable();
    await this.syncQueue.pause();
    this.logger.warn('SimplePay sync queue paused');
  }

  /**
   * Resume the queue
   */
  async resumeQueue(): Promise<void> {
    this.ensureQueueAvailable();
    await this.syncQueue.resume();
    this.logger.log('SimplePay sync queue resumed');
  }

  /**
   * Check if queue is paused
   */
  async isQueuePaused(): Promise<boolean> {
    this.ensureQueueAvailable();
    return this.syncQueue.isPaused();
  }

  /**
   * Add a job to the queue
   */
  private async addJob<T extends SyncJobData>(
    data: T,
    options?: QueueSyncJobOptions,
  ): Promise<Job<T>> {
    const jobOptions = {
      ...DEFAULT_JOB_OPTIONS,
      priority: options?.priority ?? SyncJobPriority.NORMAL,
      delay: options?.delay,
      attempts: options?.attempts ?? DEFAULT_JOB_OPTIONS.attempts,
      jobId: options?.jobId,
    };

    const job = await this.syncQueue.add(data, jobOptions);

    this.logger.log({
      message: 'Queued SimplePay sync job',
      jobId: job.id,
      type: data.type,
      tenantId: data.tenantId ?? undefined,
      correlationId: data.correlationId,
      priority: jobOptions.priority,
      delay: jobOptions.delay,
      timestamp: new Date().toISOString(),
    });

    return job as Job<T>;
  }

  /**
   * Ensure the queue is available
   */
  private ensureQueueAvailable(): void {
    if (!this.queueAvailable) {
      throw new Error(
        'SimplePay sync queue is not available. Ensure Redis is configured with REDIS_HOST and REDIS_PORT.',
      );
    }
  }
}
