<task_spec id="TASK-INFRA-011" version="1.0">

<metadata>
  <title>Centralized Scheduling Service with BullMQ</title>
  <status>COMPLETE</status>
  <layer>logic</layer>
  <sequence>95</sequence>
  <priority>P0-BLOCKER</priority>
  <implements>
    <requirement_ref>REQ-BILL-002</requirement_ref>
    <requirement_ref>REQ-PAY-009</requirement_ref>
    <requirement_ref>REQ-SARS-011</requirement_ref>
    <critical_issue_ref>CRIT-005</critical_issue_ref>
    <critical_issue_ref>CRIT-009</critical_issue_ref>
    <critical_issue_ref>CRIT-011</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-CORE-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>3 days</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use systems thinking + architectural reasoning.
This is cross-cutting infrastructure affecting 4 domains:
1. TRANS - Bank feed sync scheduling
2. BILL - Invoice generation scheduling
3. PAY - Payment reminder scheduling
4. SARS - Deadline alert scheduling

Must design for:
- Multi-tenant isolation in job queues
- Retry with exponential backoff
- Dead-letter queue handling
- Job monitoring and metrics
- Graceful shutdown
</reasoning_mode>

<context>
ROOT CAUSE: 4 domains require automated scheduling but no scheduling infrastructure exists.

Current state: Only manual API triggers work. No @nestjs/schedule or cron implementation.

This task creates the foundational SchedulerModule that other tasks depend on:
- TASK-BILL-016 (Invoice scheduling) depends on this
- TASK-PAY-015 (Payment reminders) depends on this
- TASK-SARS-017 (Deadline reminders) depends on this

Uses BullMQ (already installed as bull) with Redis for reliable job processing.
</context>

<current_state>
## Codebase State
- bull package: INSTALLED (^4.16.5)
- @nestjs/bull: NOT INSTALLED (needs installation)
- @nestjs/schedule: NOT INSTALLED (needs installation)
- Redis: Required, assumed available
- No existing scheduler module

## What Needs to Be Created
- SchedulerModule with BullMQ integration
- Job types: invoice-generation, payment-reminder, sars-deadline, bank-sync
- Job processors for each type
- Monitoring dashboard endpoint
- Retry and dead-letter queue handling
</current_state>

<input_context_files>
  <file purpose="project_config">apps/api/package.json</file>
  <file purpose="app_module">apps/api/src/app.module.ts</file>
  <file purpose="existing_service_pattern">apps/api/src/database/services/invoice-generation.service.ts</file>
  <file purpose="constitution">specs/constitution.md</file>
</input_context_files>

<prerequisites>
  <check>Redis server running (docker-compose or local)</check>
  <check>Install: npm install @nestjs/bull @nestjs/schedule bull-board</check>
  <check>Environment variables: REDIS_HOST, REDIS_PORT, REDIS_PASSWORD</check>
</prerequisites>

<scope>
  <in_scope>
    - Install @nestjs/bull and @nestjs/schedule
    - Create SchedulerModule with BullMQ configuration
    - Define job queue types and interfaces
    - Create base job processor abstract class
    - Implement retry logic with exponential backoff
    - Create dead-letter queue handling
    - Add job monitoring endpoint
    - Multi-tenant job isolation
    - Comprehensive tests with real Redis
  </in_scope>
  <out_of_scope>
    - Specific job implementations (invoice, reminder, etc.) - separate tasks
    - UI for job monitoring (use bull-board)
    - Distributed locking (future enhancement)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/scheduler/scheduler.module.ts">
      @Module({
        imports: [
          BullModule.forRootAsync({
            useFactory: (config: ConfigService) => ({
              redis: { host, port, password },
            }),
            inject: [ConfigService],
          }),
          BullModule.registerQueue(
            { name: QUEUE_NAMES.INVOICE_GENERATION },
            { name: QUEUE_NAMES.PAYMENT_REMINDER },
            { name: QUEUE_NAMES.SARS_DEADLINE },
            { name: QUEUE_NAMES.BANK_SYNC },
          ),
        ],
        providers: [SchedulerService, ...processors],
        exports: [SchedulerService, BullModule],
      })
      export class SchedulerModule {}
    </signature>
    <signature file="apps/api/src/scheduler/scheduler.service.ts">
      @Injectable()
      export class SchedulerService {
        async scheduleJob<T>(queueName: string, jobName: string, data: T, options?: JobOptions): Promise<Job<T>>;
        async scheduleCronJob<T>(queueName: string, jobName: string, data: T, cron: string): Promise<void>;
        async getJobStatus(queueName: string, jobId: string): Promise<JobStatus>;
        async getQueueMetrics(queueName: string): Promise<QueueMetrics>;
        async retryFailedJobs(queueName: string): Promise<number>;
      }
    </signature>
    <signature file="apps/api/src/scheduler/types/scheduler.types.ts">
      export const QUEUE_NAMES = {
        INVOICE_GENERATION: 'invoice-generation',
        PAYMENT_REMINDER: 'payment-reminder',
        SARS_DEADLINE: 'sars-deadline',
        BANK_SYNC: 'bank-sync',
      } as const;

      export interface ScheduledJobData {
        tenantId: string;
        triggeredBy: 'cron' | 'manual' | 'event';
        scheduledAt: Date;
        metadata?: Record<string, unknown>;
      }

      export interface JobOptions {
        delay?: number;
        priority?: number;
        attempts?: number;
        backoff?: { type: 'exponential' | 'fixed'; delay: number };
        removeOnComplete?: boolean | number;
        removeOnFail?: boolean | number;
      }
    </signature>
    <signature file="apps/api/src/scheduler/processors/base.processor.ts">
      export abstract class BaseProcessor<T extends ScheduledJobData> {
        protected abstract readonly logger: Logger;
        protected abstract processJob(job: Job<T>): Promise<void>;

        @Process()
        async handle(job: Job<T>): Promise<void>;

        @OnQueueFailed()
        handleFailed(job: Job<T>, error: Error): void;

        @OnQueueCompleted()
        handleCompleted(job: Job<T>): void;
      }
    </signature>
  </signatures>

  <constraints>
    - All jobs must include tenantId for multi-tenant isolation
    - Default retry: 3 attempts with exponential backoff (1s, 2s, 4s)
    - Failed jobs after max retries go to dead-letter queue
    - Job data must be serializable (no class instances)
    - Queue names must use constants, not magic strings
    - All processors must extend BaseProcessor
  </constraints>

  <verification>
    - npm install completes without errors
    - npm run build succeeds
    - npm run test -- --testPathPattern="scheduler" passes
    - Redis connection established
    - Job can be scheduled and processed
    - Retry logic works on simulated failure
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/scheduler/scheduler.module.ts">Main scheduler module with BullMQ</file>
  <file path="apps/api/src/scheduler/scheduler.service.ts">Service for scheduling jobs</file>
  <file path="apps/api/src/scheduler/types/scheduler.types.ts">Queue names, job interfaces</file>
  <file path="apps/api/src/scheduler/processors/base.processor.ts">Abstract base processor</file>
  <file path="apps/api/src/scheduler/processors/index.ts">Processor exports</file>
  <file path="apps/api/src/scheduler/index.ts">Module exports</file>
  <file path="apps/api/src/scheduler/__tests__/scheduler.service.spec.ts">Integration tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/package.json" action="update">Add @nestjs/bull, @nestjs/schedule, bull-board</file>
  <file path="apps/api/src/app.module.ts" action="update">Import SchedulerModule</file>
</files_to_modify>

<implementation_reference>
## scheduler.types.ts
```typescript
export const QUEUE_NAMES = {
  INVOICE_GENERATION: 'invoice-generation',
  PAYMENT_REMINDER: 'payment-reminder',
  SARS_DEADLINE: 'sars-deadline',
  BANK_SYNC: 'bank-sync',
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];

export interface ScheduledJobData {
  tenantId: string;
  triggeredBy: 'cron' | 'manual' | 'event';
  scheduledAt: Date;
  metadata?: Record<string, unknown>;
}

export interface InvoiceGenerationJobData extends ScheduledJobData {
  billingMonth: string; // YYYY-MM format
  dryRun?: boolean;
}

export interface PaymentReminderJobData extends ScheduledJobData {
  reminderType: 'gentle' | 'second' | 'final' | 'escalation';
  invoiceIds?: string[];
}

export interface SarsDeadlineJobData extends ScheduledJobData {
  submissionType: 'VAT201' | 'EMP201' | 'IRP5';
  daysUntilDeadline: number;
}

export interface JobOptions {
  delay?: number;
  priority?: number;
  attempts?: number;
  backoff?: { type: 'exponential' | 'fixed'; delay: number };
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
}

export const DEFAULT_JOB_OPTIONS: JobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 1000 },
  removeOnComplete: 100, // Keep last 100 completed jobs
  removeOnFail: false,   // Keep all failed for inspection
};

export interface QueueMetrics {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface JobStatus {
  id: string;
  state: 'waiting' | 'active' | 'completed' | 'failed' | 'delayed';
  progress: number;
  attemptsMade: number;
  failedReason?: string;
  finishedOn?: Date;
}
```

## scheduler.service.ts
```typescript
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { Queue, Job, JobOptions as BullJobOptions } from 'bull';
import {
  QUEUE_NAMES,
  QueueName,
  ScheduledJobData,
  JobOptions,
  DEFAULT_JOB_OPTIONS,
  QueueMetrics,
  JobStatus,
} from './types/scheduler.types';

@Injectable()
export class SchedulerService implements OnModuleInit {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly queues: Map<string, Queue> = new Map();

  constructor(
    @InjectQueue(QUEUE_NAMES.INVOICE_GENERATION) private invoiceQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PAYMENT_REMINDER) private reminderQueue: Queue,
    @InjectQueue(QUEUE_NAMES.SARS_DEADLINE) private sarsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.BANK_SYNC) private bankSyncQueue: Queue,
  ) {
    this.queues.set(QUEUE_NAMES.INVOICE_GENERATION, invoiceQueue);
    this.queues.set(QUEUE_NAMES.PAYMENT_REMINDER, reminderQueue);
    this.queues.set(QUEUE_NAMES.SARS_DEADLINE, sarsQueue);
    this.queues.set(QUEUE_NAMES.BANK_SYNC, bankSyncQueue);
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('SchedulerService initialized with queues: ' +
      Array.from(this.queues.keys()).join(', '));
  }

  async scheduleJob<T extends ScheduledJobData>(
    queueName: QueueName,
    jobName: string,
    data: T,
    options: JobOptions = {},
  ): Promise<Job<T>> {
    const queue = this.getQueue(queueName);
    const mergedOptions: BullJobOptions = {
      ...DEFAULT_JOB_OPTIONS,
      ...options,
    };

    const job = await queue.add(jobName, data, mergedOptions);
    this.logger.log(`Scheduled job ${jobName} (${job.id}) on queue ${queueName}`);
    return job as Job<T>;
  }

  async scheduleCronJob<T extends ScheduledJobData>(
    queueName: QueueName,
    jobName: string,
    data: T,
    cron: string,
  ): Promise<void> {
    const queue = this.getQueue(queueName);

    await queue.add(jobName, data, {
      repeat: { cron },
      ...DEFAULT_JOB_OPTIONS,
    });

    this.logger.log(`Scheduled cron job ${jobName} on queue ${queueName}: ${cron}`);
  }

  async getJobStatus(queueName: QueueName, jobId: string): Promise<JobStatus | null> {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);

    if (!job) return null;

    const state = await job.getState();
    return {
      id: job.id.toString(),
      state,
      progress: job.progress() as number,
      attemptsMade: job.attemptsMade,
      failedReason: job.failedReason,
      finishedOn: job.finishedOn ? new Date(job.finishedOn) : undefined,
    };
  }

  async getQueueMetrics(queueName: QueueName): Promise<QueueMetrics> {
    const queue = this.getQueue(queueName);
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return { waiting, active, completed, failed, delayed };
  }

  async retryFailedJobs(queueName: QueueName): Promise<number> {
    const queue = this.getQueue(queueName);
    const failedJobs = await queue.getFailed();

    let retried = 0;
    for (const job of failedJobs) {
      await job.retry();
      retried++;
    }

    this.logger.log(`Retried ${retried} failed jobs on queue ${queueName}`);
    return retried;
  }

  private getQueue(queueName: QueueName): Queue {
    const queue = this.queues.get(queueName);
    if (!queue) {
      throw new Error(`Queue ${queueName} not found`);
    }
    return queue;
  }
}
```

## base.processor.ts
```typescript
import { Logger } from '@nestjs/common';
import { Process, OnQueueFailed, OnQueueCompleted } from '@nestjs/bull';
import { Job } from 'bull';
import { ScheduledJobData } from '../types/scheduler.types';

export abstract class BaseProcessor<T extends ScheduledJobData> {
  protected abstract readonly logger: Logger;

  protected abstract processJob(job: Job<T>): Promise<void>;

  @Process()
  async handle(job: Job<T>): Promise<void> {
    const { tenantId, triggeredBy } = job.data;
    this.logger.log(
      `Processing job ${job.id} for tenant ${tenantId} (triggered: ${triggeredBy})`
    );

    try {
      await this.processJob(job);
    } catch (error) {
      this.logger.error(
        `Job ${job.id} failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined
      );
      throw error; // Re-throw to trigger Bull's retry mechanism
    }
  }

  @OnQueueFailed()
  handleFailed(job: Job<T>, error: Error): void {
    this.logger.error(
      `Job ${job.id} failed after ${job.attemptsMade} attempts: ${error.message}`,
      { tenantId: job.data.tenantId, jobName: job.name }
    );

    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      this.logger.error(`Job ${job.id} moved to dead-letter queue`);
      // TODO: Notify admin via NotificationService
    }
  }

  @OnQueueCompleted()
  handleCompleted(job: Job<T>): void {
    this.logger.log(
      `Job ${job.id} completed for tenant ${job.data.tenantId}`
    );
  }
}
```

## scheduler.module.ts
```typescript
import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { SchedulerService } from './scheduler.service';
import { QUEUE_NAMES } from './types/scheduler.types';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD', undefined),
        },
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: false,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.INVOICE_GENERATION },
      { name: QUEUE_NAMES.PAYMENT_REMINDER },
      { name: QUEUE_NAMES.SARS_DEADLINE },
      { name: QUEUE_NAMES.BANK_SYNC },
    ),
  ],
  providers: [SchedulerService],
  exports: [SchedulerService, BullModule],
})
export class SchedulerModule {}
```
</implementation_reference>

<validation_criteria>
  <criterion>@nestjs/bull and @nestjs/schedule installed</criterion>
  <criterion>SchedulerModule imported in AppModule</criterion>
  <criterion>4 queues registered (invoice, reminder, sars, sync)</criterion>
  <criterion>SchedulerService can schedule jobs</criterion>
  <criterion>BaseProcessor handles errors and logging</criterion>
  <criterion>Retry logic works with exponential backoff</criterion>
  <criterion>Queue metrics endpoint returns data</criterion>
  <criterion>All tests pass with real Redis</criterion>
</validation_criteria>

<test_commands>
  <command>npm install @nestjs/bull @nestjs/schedule bull-board</command>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="scheduler" --verbose</command>
</test_commands>

</task_spec>
