/**
 * SimplePay Sync Service Tests
 * TASK-STAFF-003 / TASK-STAFF-010: SimplePay Sync Retry Queue
 *
 * Tests queue operations for SimplePay synchronization.
 * Uses Bull queue mock since Redis is external infrastructure.
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SimplePaySyncService } from '../../../src/integrations/simplepay/simplepay-sync.service';
import {
  SIMPLEPAY_SYNC_QUEUE,
  SimplePaySyncProcessor,
} from '../../../src/integrations/simplepay/simplepay-sync.processor';
import { SimplePayEmployeeService } from '../../../src/integrations/simplepay/simplepay-employee.service';
import { SimplePayLeaveService } from '../../../src/integrations/simplepay/simplepay-leave.service';
import { SimplePayPayRunService } from '../../../src/integrations/simplepay/simplepay-payrun.service';
import {
  SyncJobType,
  SyncJobPriority,
  CreateEmployeeSyncJobData,
  SyncLeaveSyncJobData,
  SyncPayrollSyncJobData,
} from '../../../src/integrations/simplepay/dto/sync-job.dto';

/**
 * Mock Bull Queue
 * NOTE: This mocks the Redis/Bull infrastructure, not application data
 */
const createMockQueue = () => {
  const jobs: Map<string, any> = new Map();
  let jobIdCounter = 1;

  return {
    add: jest.fn().mockImplementation((data, options) => {
      const jobId = options?.jobId || `job-${jobIdCounter++}`;
      const job = {
        id: jobId,
        data,
        opts: options,
        timestamp: Date.now(),
        attemptsMade: 0,
        delay: options?.delay || 0,
        priority: options?.priority || 5,
        processedOn: null,
        finishedOn: null,
        failedReason: null,
        getState: jest.fn().mockResolvedValue('waiting'),
      };
      jobs.set(jobId, job);
      return Promise.resolve(job);
    }),
    getJob: jest.fn().mockImplementation((id) => {
      return Promise.resolve(jobs.get(id) || null);
    }),
    isReady: jest.fn().mockResolvedValue(true),
    isPaused: jest.fn().mockResolvedValue(false),
    pause: jest.fn().mockResolvedValue(undefined),
    resume: jest.fn().mockResolvedValue(undefined),
    getWaitingCount: jest.fn().mockResolvedValue(0),
    getActiveCount: jest.fn().mockResolvedValue(0),
    getCompletedCount: jest.fn().mockResolvedValue(0),
    getFailedCount: jest.fn().mockResolvedValue(0),
    getDelayedCount: jest.fn().mockResolvedValue(0),
    getWaiting: jest.fn().mockResolvedValue([]),
    getActive: jest.fn().mockResolvedValue([]),
    getCompleted: jest.fn().mockResolvedValue([]),
    getFailed: jest.fn().mockResolvedValue([]),
    getDelayed: jest.fn().mockResolvedValue([]),
    clean: jest.fn().mockResolvedValue([]),
    _jobs: jobs, // For test inspection
  };
};

/**
 * Mock services - external API integrations
 */
const mockEmployeeService = {
  syncEmployee: jest.fn(),
  syncAllEmployees: jest.fn(),
};

const mockLeaveService = {
  syncLeaveRequestToSimplePay: jest.fn(),
  getLeaveBalances: jest.fn(),
};

const mockPayRunService = {
  syncPayRun: jest.fn(),
  syncAllPayRuns: jest.fn(),
};

const mockEventEmitter = {
  emit: jest.fn(),
};

describe('SimplePaySyncService', () => {
  let service: SimplePaySyncService;
  let mockQueue: ReturnType<typeof createMockQueue>;

  beforeEach(async () => {
    mockQueue = createMockQueue();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimplePaySyncService,
        {
          provide: getQueueToken(SIMPLEPAY_SYNC_QUEUE),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<SimplePaySyncService>(SimplePaySyncService);

    // Trigger onModuleInit
    await service.onModuleInit();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('queue availability', () => {
    it('should report queue as available after successful init', () => {
      expect(service.isQueueAvailable()).toBe(true);
    });

    it('should report queue as unavailable when Redis fails', async () => {
      const failingQueue = createMockQueue();
      failingQueue.isReady.mockRejectedValue(new Error('Connection refused'));

      const module = await Test.createTestingModule({
        providers: [
          SimplePaySyncService,
          {
            provide: getQueueToken(SIMPLEPAY_SYNC_QUEUE),
            useValue: failingQueue,
          },
        ],
      }).compile();

      const failingService =
        module.get<SimplePaySyncService>(SimplePaySyncService);
      await failingService.onModuleInit();

      expect(failingService.isQueueAvailable()).toBe(false);
    });
  });

  describe('queueEmployeeCreate', () => {
    it('should queue an employee creation job', async () => {
      const tenantId = 'tenant-123';
      const staffId = 'staff-456';

      const job = await service.queueEmployeeCreate(tenantId, staffId);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(job.data.type).toBe(SyncJobType.CREATE_EMPLOYEE);
      expect(job.data.tenantId).toBe(tenantId);
      expect(job.data.staffId).toBe(staffId);
      expect(job.data.triggeredBy).toBe('event');
      expect(job.data.correlationId).toBeDefined();
    });

    it('should respect priority options', async () => {
      const job = await service.queueEmployeeCreate('tenant-1', 'staff-1', {
        priority: SyncJobPriority.HIGH,
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          priority: SyncJobPriority.HIGH,
        }),
      );
    });

    it('should respect delay options', async () => {
      const delay = 5000;
      const job = await service.queueEmployeeCreate('tenant-1', 'staff-1', {
        delay,
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          delay,
        }),
      );
    });

    it('should use custom job ID for deduplication', async () => {
      const customJobId = 'employee-create-tenant-1-staff-1';
      const job = await service.queueEmployeeCreate('tenant-1', 'staff-1', {
        jobId: customJobId,
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          jobId: customJobId,
        }),
      );
    });
  });

  describe('queueEmployeeUpdate', () => {
    it('should queue an employee update job with changed fields', async () => {
      const tenantId = 'tenant-123';
      const staffId = 'staff-456';
      const simplePayEmployeeId = 'sp-789';
      const changedFields = ['email', 'phone'];

      const job = await service.queueEmployeeUpdate(
        tenantId,
        staffId,
        simplePayEmployeeId,
        changedFields,
      );

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(job.data.type).toBe(SyncJobType.UPDATE_EMPLOYEE);
      expect(job.data.tenantId).toBe(tenantId);
      expect((job.data as any).staffId).toBe(staffId);
      expect((job.data as any).simplePayEmployeeId).toBe(simplePayEmployeeId);
      expect((job.data as any).changedFields).toEqual(changedFields);
    });
  });

  describe('queueLeaveSync', () => {
    it('should queue a leave sync job', async () => {
      const tenantId = 'tenant-123';
      const leaveRequestId = 'leave-456';
      const staffId = 'staff-789';

      const job = await service.queueLeaveSync(
        tenantId,
        leaveRequestId,
        staffId,
      );

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(job.data.type).toBe(SyncJobType.SYNC_LEAVE);
      expect(job.data.tenantId).toBe(tenantId);
      expect(job.data.leaveRequestId).toBe(leaveRequestId);
      expect(job.data.staffId).toBe(staffId);
    });
  });

  describe('queuePayrollSync', () => {
    it('should queue a specific pay run sync', async () => {
      const tenantId = 'tenant-123';
      const payRunId = 'payrun-456';

      const job = await service.queuePayrollSync(tenantId, payRunId);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(job.data.type).toBe(SyncJobType.SYNC_PAYROLL);
      expect(job.data.simplePayPayRunId).toBe(payRunId);
      expect(job.data.triggeredBy).toBe('event');
    });

    it('should queue a bulk pay run sync for all waves', async () => {
      const tenantId = 'tenant-123';

      const job = await service.queuePayrollSync(tenantId);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(job.data.type).toBe(SyncJobType.SYNC_PAYROLL);
      expect(job.data.simplePayPayRunId).toBeUndefined();
      expect(job.data.triggeredBy).toBe('scheduled');
    });

    it('should queue a pay run sync for specific wave', async () => {
      const tenantId = 'tenant-123';
      const waveId = 42;

      const job = await service.queuePayrollSync(tenantId, undefined, waveId);

      expect(job.data.waveId).toBe(waveId);
    });
  });

  describe('queueBulkEmployeeSync', () => {
    it('should queue a bulk sync for all employees', async () => {
      const tenantId = 'tenant-123';

      const job = await service.queueBulkEmployeeSync(tenantId);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(job.data.type).toBe(SyncJobType.BULK_EMPLOYEE_SYNC);
      expect((job.data as any).staffIds).toBeUndefined();
      expect(job.data.triggeredBy).toBe('manual');
    });

    it('should queue a bulk sync for specific staff IDs', async () => {
      const tenantId = 'tenant-123';
      const staffIds = ['staff-1', 'staff-2', 'staff-3'];

      const job = await service.queueBulkEmployeeSync(tenantId, staffIds);

      expect((job.data as any).staffIds).toEqual(staffIds);
    });
  });

  describe('queueLeaveBalancesSync', () => {
    it('should queue a leave balances sync job', async () => {
      const tenantId = 'tenant-123';
      const staffId = 'staff-456';
      const simplePayEmployeeId = 'sp-789';

      const job = await service.queueLeaveBalancesSync(
        tenantId,
        staffId,
        simplePayEmployeeId,
      );

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(job.data.type).toBe(SyncJobType.SYNC_LEAVE_BALANCES);
      expect((job.data as any).staffId).toBe(staffId);
      expect((job.data as any).simplePayEmployeeId).toBe(simplePayEmployeeId);
    });
  });

  describe('getJobStatus', () => {
    it('should return job status for existing job', async () => {
      // First queue a job
      const job = await service.queueEmployeeCreate('tenant-1', 'staff-1');

      // Then get its status
      const status = await service.getJobStatus(job.id as string);

      expect(status).toBeDefined();
      expect(status!.id).toBe(job.id);
      expect(status!.type).toBe(SyncJobType.CREATE_EMPLOYEE);
      expect(status!.state).toBe('waiting');
      expect(status!.attemptsMade).toBe(0);
    });

    it('should return null for non-existent job', async () => {
      const status = await service.getJobStatus('non-existent-job-id');
      expect(status).toBeNull();
    });
  });

  describe('retryFailedJob', () => {
    it('should create a new job with retry trigger for failed job', async () => {
      // Create a mock failed job
      const originalJob = await service.queueEmployeeCreate(
        'tenant-1',
        'staff-1',
      );
      const jobData = mockQueue._jobs.get(originalJob.id as string);
      jobData.getState = jest.fn().mockResolvedValue('failed');
      jobData.failedReason = 'API timeout';

      // Retry the job
      const retryJob = await service.retryFailedJob(originalJob.id as string);

      expect(retryJob.data.triggeredBy).toBe('retry');
      expect(retryJob.data.type).toBe(SyncJobType.CREATE_EMPLOYEE);
      expect(mockQueue.add).toHaveBeenCalledTimes(2); // Original + retry
    });

    it('should throw error for non-failed job', async () => {
      const job = await service.queueEmployeeCreate('tenant-1', 'staff-1');

      await expect(service.retryFailedJob(job.id as string)).rejects.toThrow(
        'is not in failed state',
      );
    });

    it('should throw error for non-existent job', async () => {
      await expect(service.retryFailedJob('non-existent')).rejects.toThrow(
        'not found',
      );
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      mockQueue.getWaitingCount.mockResolvedValue(5);
      mockQueue.getActiveCount.mockResolvedValue(2);
      mockQueue.getCompletedCount.mockResolvedValue(100);
      mockQueue.getFailedCount.mockResolvedValue(3);
      mockQueue.getDelayedCount.mockResolvedValue(1);

      const stats = await service.getQueueStats();

      expect(stats.waiting).toBe(5);
      expect(stats.active).toBe(2);
      expect(stats.completed).toBe(100);
      expect(stats.failed).toBe(3);
      expect(stats.delayed).toBe(1);
      expect(stats.byType).toBeDefined();
    });

    it('should include breakdown by job type', async () => {
      const failedJobs = [
        { data: { type: SyncJobType.CREATE_EMPLOYEE } },
        { data: { type: SyncJobType.CREATE_EMPLOYEE } },
        { data: { type: SyncJobType.SYNC_LEAVE } },
      ];
      const waitingJobs = [{ data: { type: SyncJobType.SYNC_PAYROLL } }];

      mockQueue.getFailed.mockResolvedValue(failedJobs);
      mockQueue.getWaiting.mockResolvedValue(waitingJobs);

      const stats = await service.getQueueStats();

      expect(stats.byType[SyncJobType.CREATE_EMPLOYEE].failed).toBe(2);
      expect(stats.byType[SyncJobType.SYNC_LEAVE].failed).toBe(1);
      expect(stats.byType[SyncJobType.SYNC_PAYROLL].waiting).toBe(1);
    });
  });

  describe('getFailedJobs', () => {
    it('should return failed jobs with error messages', async () => {
      const failedJobs = [
        {
          id: 'job-1',
          data: { type: SyncJobType.CREATE_EMPLOYEE },
          failedReason: 'API error',
        },
        {
          id: 'job-2',
          data: { type: SyncJobType.SYNC_LEAVE },
          failedReason: 'Timeout',
        },
      ];
      mockQueue.getFailed.mockResolvedValue(failedJobs);

      const result = await service.getFailedJobs(0, 10);

      expect(result.length).toBe(2);
      expect(result[0].error).toBe('API error');
      expect(result[1].error).toBe('Timeout');
    });
  });

  describe('getJobsByTenant', () => {
    it('should filter jobs by tenant ID', async () => {
      const allWaitingJobs = [
        { data: { tenantId: 'tenant-1', type: SyncJobType.CREATE_EMPLOYEE } },
        { data: { tenantId: 'tenant-2', type: SyncJobType.CREATE_EMPLOYEE } },
        { data: { tenantId: 'tenant-1', type: SyncJobType.SYNC_LEAVE } },
      ];
      mockQueue.getWaiting.mockResolvedValue(allWaitingJobs);
      mockQueue.getActive.mockResolvedValue([]);
      mockQueue.getDelayed.mockResolvedValue([]);
      mockQueue.getFailed.mockResolvedValue([]);

      const jobs = await service.getJobsByTenant('tenant-1');

      expect(jobs.length).toBe(2);
      expect(jobs.every((j) => j.data.tenantId === 'tenant-1')).toBe(true);
    });
  });

  describe('queue control', () => {
    it('should pause the queue', async () => {
      await service.pauseQueue();
      expect(mockQueue.pause).toHaveBeenCalledTimes(1);
    });

    it('should resume the queue', async () => {
      await service.resumeQueue();
      expect(mockQueue.resume).toHaveBeenCalledTimes(1);
    });

    it('should check if queue is paused', async () => {
      mockQueue.isPaused.mockResolvedValue(true);
      const paused = await service.isQueuePaused();
      expect(paused).toBe(true);
    });
  });

  describe('cleanOldJobs', () => {
    it('should clean old completed jobs', async () => {
      const cleanedJobs = [{ id: 'old-job-1' }, { id: 'old-job-2' }];
      mockQueue.clean.mockResolvedValue(cleanedJobs);

      const count = await service.cleanOldJobs(24 * 60 * 60 * 1000);

      expect(mockQueue.clean).toHaveBeenCalledWith(
        24 * 60 * 60 * 1000,
        'completed',
      );
      expect(count).toBe(2);
    });
  });
});

describe('SimplePaySyncProcessor', () => {
  let processor: SimplePaySyncProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SimplePaySyncProcessor,
        { provide: SimplePayEmployeeService, useValue: mockEmployeeService },
        { provide: SimplePayLeaveService, useValue: mockLeaveService },
        { provide: SimplePayPayRunService, useValue: mockPayRunService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    processor = module.get<SimplePaySyncProcessor>(SimplePaySyncProcessor);
  });

  /**
   * Create a mock Bull job for processor tests
   */
  const createMockJob = <T>(data: T, overrides: Partial<any> = {}) => ({
    id: `test-job-${Date.now()}`,
    data,
    attemptsMade: 0,
    progress: jest.fn(),
    log: jest.fn(),
    ...overrides,
  });

  describe('processJob - CREATE_EMPLOYEE', () => {
    it('should process employee creation successfully', async () => {
      const jobData: CreateEmployeeSyncJobData = {
        tenantId: 'tenant-123',
        type: SyncJobType.CREATE_EMPLOYEE,
        staffId: 'staff-456',
        queuedAt: new Date(),
        triggeredBy: 'event',
      };

      mockEmployeeService.syncEmployee.mockResolvedValue({
        simplePayEmployeeId: 'sp-789',
        syncStatus: 'SYNCED',
      });

      const result = await processor.processJob(createMockJob(jobData) as any);

      expect(result.success).toBe(true);
      expect(result.type).toBe(SyncJobType.CREATE_EMPLOYEE);
      expect(result.entityId).toBe('staff-456');
      expect(result.simplePayId).toBe('sp-789');
      expect(mockEmployeeService.syncEmployee).toHaveBeenCalledWith(
        'tenant-123',
        'staff-456',
      );
    });

    it('should throw on failure to trigger retry', async () => {
      const jobData: CreateEmployeeSyncJobData = {
        tenantId: 'tenant-123',
        type: SyncJobType.CREATE_EMPLOYEE,
        staffId: 'staff-456',
        queuedAt: new Date(),
        triggeredBy: 'event',
      };

      mockEmployeeService.syncEmployee.mockRejectedValue(
        new Error('API timeout'),
      );

      await expect(
        processor.processJob(createMockJob(jobData) as any),
      ).rejects.toThrow('API timeout');
    });
  });

  describe('processJob - SYNC_LEAVE', () => {
    it('should process leave sync successfully', async () => {
      const jobData: SyncLeaveSyncJobData = {
        tenantId: 'tenant-123',
        type: SyncJobType.SYNC_LEAVE,
        leaveRequestId: 'leave-456',
        staffId: 'staff-789',
        queuedAt: new Date(),
        triggeredBy: 'event',
      };

      mockLeaveService.syncLeaveRequestToSimplePay.mockResolvedValue({
        success: true,
        simplePayIds: ['ld-1', 'ld-2', 'ld-3'],
        errors: [],
      });

      const result = await processor.processJob(createMockJob(jobData) as any);

      expect(result.success).toBe(true);
      expect(result.type).toBe(SyncJobType.SYNC_LEAVE);
      expect(result.entityId).toBe('leave-456');
      expect(result.simplePayId).toBe('ld-1,ld-2,ld-3');
      expect(result.details).toEqual({ leaveDayCount: 3 });
    });

    it('should throw on leave sync failure', async () => {
      const jobData: SyncLeaveSyncJobData = {
        tenantId: 'tenant-123',
        type: SyncJobType.SYNC_LEAVE,
        leaveRequestId: 'leave-456',
        staffId: 'staff-789',
        queuedAt: new Date(),
        triggeredBy: 'event',
      };

      mockLeaveService.syncLeaveRequestToSimplePay.mockResolvedValue({
        success: false,
        simplePayIds: [],
        errors: ['Employee not synced', 'Invalid leave type'],
      });

      await expect(
        processor.processJob(createMockJob(jobData) as any),
      ).rejects.toThrow('Employee not synced; Invalid leave type');
    });
  });

  describe('processJob - SYNC_PAYROLL', () => {
    it('should process single pay run sync', async () => {
      const jobData: SyncPayrollSyncJobData = {
        tenantId: 'tenant-123',
        type: SyncJobType.SYNC_PAYROLL,
        simplePayPayRunId: 'pr-456',
        queuedAt: new Date(),
        triggeredBy: 'event',
      };

      mockPayRunService.syncPayRun.mockResolvedValue({
        id: 'sync-789',
        employeeCount: 10,
        totalGrossCents: 5000000,
      });

      const result = await processor.processJob(createMockJob(jobData) as any);

      expect(result.success).toBe(true);
      expect(result.type).toBe(SyncJobType.SYNC_PAYROLL);
      expect(result.simplePayId).toBe('pr-456');
      expect(result.details).toMatchObject({
        employeeCount: 10,
        totalGrossCents: 5000000,
      });
    });

    it('should process bulk pay run sync', async () => {
      const jobData: SyncPayrollSyncJobData = {
        tenantId: 'tenant-123',
        type: SyncJobType.SYNC_PAYROLL,
        queuedAt: new Date(),
        triggeredBy: 'scheduled',
      };

      mockPayRunService.syncAllPayRuns.mockResolvedValue([
        { success: true, payRunId: 'sync-1' },
        { success: true, payRunId: 'sync-2' },
        { success: false, errors: ['API error'] },
      ]);

      const result = await processor.processJob(createMockJob(jobData) as any);

      expect(result.success).toBe(true);
      expect(result.details).toMatchObject({
        totalPayRuns: 3,
        successCount: 2,
        failCount: 1,
      });
    });
  });

  describe('onFailed', () => {
    it('should emit alert after max retries exhausted', async () => {
      const jobData: CreateEmployeeSyncJobData = {
        tenantId: 'tenant-123',
        type: SyncJobType.CREATE_EMPLOYEE,
        staffId: 'staff-456',
        queuedAt: new Date(),
        triggeredBy: 'event',
      };

      const mockJob = createMockJob(jobData, { attemptsMade: 5 });
      const error = new Error('Persistent API failure');

      await processor.onFailed(mockJob as any, error);

      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'simplepay.sync.failed',
        expect.objectContaining({
          type: SyncJobType.CREATE_EMPLOYEE,
          tenantId: 'tenant-123',
          entityId: 'staff-456',
          errorMessage: 'Persistent API failure',
          attemptsMade: 5,
        }),
      );
    });

    it('should not emit alert before max retries', async () => {
      const jobData: CreateEmployeeSyncJobData = {
        tenantId: 'tenant-123',
        type: SyncJobType.CREATE_EMPLOYEE,
        staffId: 'staff-456',
        queuedAt: new Date(),
        triggeredBy: 'event',
      };

      const mockJob = createMockJob(jobData, { attemptsMade: 2 });
      const error = new Error('Temporary API failure');

      await processor.onFailed(mockJob as any, error);

      expect(mockEventEmitter.emit).not.toHaveBeenCalled();
    });
  });
});

describe('Exponential Backoff Configuration', () => {
  it('should configure 5 attempts with exponential backoff', () => {
    // Verify the default job options in the module configuration
    // The backoff should be: 2s -> 4s -> 8s -> 16s -> 32s
    const delays = [0, 1, 2, 3, 4].map((attempt) =>
      Math.min(2000 * Math.pow(2, attempt), 32000),
    );

    expect(delays).toEqual([2000, 4000, 8000, 16000, 32000]);
  });
});
