import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { SchedulerService } from '../scheduler.service';
import {
  QUEUE_NAMES,
  InvoiceGenerationJobData,
} from '../types/scheduler.types';
import { Job } from 'bull';

describe('SchedulerService', () => {
  let service: SchedulerService;
  let mockInvoiceQueue: any;
  let mockPaymentQueue: any;
  let mockSarsQueue: any;
  let mockBankQueue: any;
  let mockStatementQueue: any;

  beforeEach(async () => {
    const createMockQueue = () => ({
      add: jest.fn(),
      getJob: jest.fn(),
      getJobCounts: jest.fn(),
      getFailed: jest.fn(),
      getCompleted: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
    });

    mockInvoiceQueue = createMockQueue();
    mockPaymentQueue = createMockQueue();
    mockSarsQueue = createMockQueue();
    mockBankQueue = createMockQueue();
    mockStatementQueue = createMockQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        {
          provide: getQueueToken(QUEUE_NAMES.INVOICE_GENERATION),
          useValue: mockInvoiceQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.PAYMENT_REMINDER),
          useValue: mockPaymentQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.SARS_DEADLINE),
          useValue: mockSarsQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.BANK_SYNC),
          useValue: mockBankQueue,
        },
        {
          provide: getQueueToken(QUEUE_NAMES.STATEMENT_GENERATION),
          useValue: mockStatementQueue,
        },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('scheduleJob', () => {
    it('should schedule a job to the correct queue', async () => {
      const jobData: InvoiceGenerationJobData = {
        tenantId: 'tenant-123',
        triggeredBy: 'cron',
        scheduledAt: new Date(),
        billingMonth: '2025-01',
        dryRun: false,
      };

      const mockJob = {
        id: 'job-123',
        data: jobData,
      } as Job<InvoiceGenerationJobData>;

      mockInvoiceQueue.add.mockResolvedValue(mockJob);

      const result = await service.scheduleJob(
        QUEUE_NAMES.INVOICE_GENERATION,
        jobData,
      );

      expect(mockInvoiceQueue.add).toHaveBeenCalledWith(
        jobData,
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: false,
        }),
      );
      expect(result).toEqual(mockJob);
    });

    it('should merge custom options with default options', async () => {
      const jobData: InvoiceGenerationJobData = {
        tenantId: 'tenant-123',
        triggeredBy: 'manual',
        scheduledAt: new Date(),
        billingMonth: '2025-01',
      };

      const customOptions = {
        priority: 5,
        delay: 5000,
      };

      const mockJob = {
        id: 'job-456',
        data: jobData,
      } as Job<InvoiceGenerationJobData>;
      mockInvoiceQueue.add.mockResolvedValue(mockJob);

      await service.scheduleJob(
        QUEUE_NAMES.INVOICE_GENERATION,
        jobData,
        customOptions,
      );

      expect(mockInvoiceQueue.add).toHaveBeenCalledWith(
        jobData,
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: false,
          priority: 5,
          delay: 5000,
        }),
      );
    });

    it('should throw error when queue name is invalid', async () => {
      const jobData: InvoiceGenerationJobData = {
        tenantId: 'tenant-123',
        triggeredBy: 'cron',
        scheduledAt: new Date(),
        billingMonth: '2025-01',
      };

      await expect(
        service.scheduleJob('invalid-queue' as any, jobData),
      ).rejects.toThrow('Unknown queue name: invalid-queue');
    });
  });

  describe('getQueueMetrics', () => {
    it('should return queue metrics', async () => {
      const mockCounts = {
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
      };

      mockInvoiceQueue.getJobCounts.mockResolvedValue(mockCounts);

      const metrics = await service.getQueueMetrics(
        QUEUE_NAMES.INVOICE_GENERATION,
      );

      expect(metrics).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
      });
      expect(mockInvoiceQueue.getJobCounts).toHaveBeenCalled();
    });

    it('should handle missing counts gracefully', async () => {
      mockInvoiceQueue.getJobCounts.mockResolvedValue({
        waiting: 5,
        // other fields missing
      });

      const metrics = await service.getQueueMetrics(
        QUEUE_NAMES.INVOICE_GENERATION,
      );

      expect(metrics).toEqual({
        waiting: 5,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      });
    });
  });

  describe('getJobStatus', () => {
    it('should return job status for existing job', async () => {
      const mockJob = {
        id: 'job-123',
        getState: jest.fn().mockResolvedValue('completed'),
        progress: jest.fn().mockReturnValue(100),
        attemptsMade: 1,
        failedReason: undefined,
        finishedOn: 1640995200000,
      } as any;

      mockInvoiceQueue.getJob.mockResolvedValue(mockJob);

      const status = await service.getJobStatus(
        QUEUE_NAMES.INVOICE_GENERATION,
        'job-123',
      );

      expect(status).toEqual({
        id: 'job-123',
        state: 'completed',
        progress: 100,
        attemptsMade: 1,
        failedReason: undefined,
        finishedOn: new Date(1640995200000),
      });
      expect(mockInvoiceQueue.getJob).toHaveBeenCalledWith('job-123');
    });

    it('should return null for non-existent job', async () => {
      mockInvoiceQueue.getJob.mockResolvedValue(null);

      const status = await service.getJobStatus(
        QUEUE_NAMES.INVOICE_GENERATION,
        'non-existent',
      );

      expect(status).toBeNull();
    });
  });

  describe('retryFailedJobs', () => {
    it('should retry all failed jobs', async () => {
      const mockFailedJob1 = { retry: jest.fn().mockResolvedValue(undefined) };
      const mockFailedJob2 = { retry: jest.fn().mockResolvedValue(undefined) };

      mockInvoiceQueue.getFailed.mockResolvedValue([
        mockFailedJob1,
        mockFailedJob2,
      ]);

      const retriedCount = await service.retryFailedJobs(
        QUEUE_NAMES.INVOICE_GENERATION,
      );

      expect(retriedCount).toBe(2);
      expect(mockFailedJob1.retry).toHaveBeenCalled();
      expect(mockFailedJob2.retry).toHaveBeenCalled();
    });
  });

  describe('scheduleCronJob', () => {
    it('should schedule a cron job with repeat configuration', async () => {
      const jobData: InvoiceGenerationJobData = {
        tenantId: 'tenant-123',
        triggeredBy: 'cron',
        scheduledAt: new Date(),
        billingMonth: '2025-01',
      };

      const cronExpression = '0 0 1 * *'; // First day of every month
      const mockJob = {
        id: 'cron-job-123',
        data: jobData,
      } as Job<InvoiceGenerationJobData>;

      mockInvoiceQueue.add.mockResolvedValue(mockJob);

      const result = await service.scheduleCronJob(
        QUEUE_NAMES.INVOICE_GENERATION,
        jobData,
        cronExpression,
      );

      expect(mockInvoiceQueue.add).toHaveBeenCalledWith(
        jobData,
        expect.objectContaining({
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
          removeOnComplete: 100,
          removeOnFail: false,
          repeat: { cron: cronExpression },
        }),
      );
      expect(result).toEqual(mockJob);
    });
  });

  describe('pauseQueue', () => {
    it('should pause the queue', async () => {
      mockInvoiceQueue.pause.mockResolvedValue(undefined);

      await service.pauseQueue(QUEUE_NAMES.INVOICE_GENERATION);

      expect(mockInvoiceQueue.pause).toHaveBeenCalled();
    });
  });

  describe('resumeQueue', () => {
    it('should resume the queue', async () => {
      mockInvoiceQueue.resume.mockResolvedValue(undefined);

      await service.resumeQueue(QUEUE_NAMES.INVOICE_GENERATION);

      expect(mockInvoiceQueue.resume).toHaveBeenCalled();
    });
  });
});
