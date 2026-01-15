import { Logger } from '@nestjs/common';
import type { Job } from 'bull';
import { OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull';
import { ScheduledJobData } from '../types/scheduler.types';

export abstract class BaseProcessor<T extends ScheduledJobData> {
  protected readonly logger: Logger;

  constructor(protected readonly queueName: string) {
    this.logger = new Logger(`${queueName}-processor`);
  }

  abstract processJob(job: Job<T>): Promise<void>;

  @OnQueueActive()
  onActive(job: Job<T>) {
    this.logger.log({
      message: 'Job started',
      jobId: job.id,
      queueName: this.queueName,
      tenantId: job.data.tenantId,
      triggeredBy: job.data.triggeredBy,
      timestamp: new Date().toISOString(),
    });
  }

  @OnQueueCompleted()
  onCompleted(job: Job<T>, result: any) {
    this.logger.log({
      message: 'Job completed',
      jobId: job.id,
      queueName: this.queueName,
      tenantId: job.data.tenantId,
      result,
      duration:
        job.finishedOn && job.processedOn
          ? job.finishedOn - job.processedOn
          : 0,
      timestamp: new Date().toISOString(),
    });
  }

  @OnQueueFailed()
  onFailed(job: Job<T>, error: Error) {
    this.logger.error({
      message: 'Job failed',
      jobId: job.id,
      queueName: this.queueName,
      tenantId: job.data.tenantId,
      error: error.message,
      stack: error.stack,
      attemptsMade: job.attemptsMade,
      timestamp: new Date().toISOString(),
    });

    // Re-throw to allow Bull's retry mechanism to work
    throw error;
  }

  protected handleError(
    error: Error,
    context: {
      file: string;
      function: string;
      inputs: Record<string, any>;
      job: Job<T>;
    },
  ): never {
    const errorLog = {
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      file: context.file,
      function: context.function,
      inputs: context.inputs,
      jobId: context.job.id,
      queueName: this.queueName,
      attemptsMade: context.job.attemptsMade,
      timestamp: new Date().toISOString(),
    };

    this.logger.error(errorLog);

    // Re-throw to allow Bull's retry mechanism
    throw error;
  }
}
