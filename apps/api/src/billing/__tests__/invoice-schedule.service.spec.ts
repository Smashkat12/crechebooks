/**
 * Invoice Schedule Service Tests
 * TASK-BILL-016: Invoice Generation Scheduling Cron Job
 *
 * BUGFIX (multi-tenant cron collision): scheduleTenantInvoices/cancelSchedule
 * now call the injected Bull queue directly (queue.add/removeRepeatable) with
 * a per-tenant jobId, instead of SchedulerService.scheduleCronJob/
 * removeRepeatableCronJob (which do not thread a jobId through). Tests below
 * mock the injected queue accordingly.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { InvoiceScheduleService } from '../invoice-schedule.service';
import { SchedulerService } from '../../scheduler/scheduler.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { BusinessException } from '../../shared/exceptions';
import { QUEUE_NAMES } from '../../scheduler/types/scheduler.types';

describe('InvoiceScheduleService', () => {
  let service: InvoiceScheduleService;
  let mockSchedulerService: any;
  let mockInvoiceQueue: any;
  let mockPrisma: any;
  let mockAuditLogService: any;

  const tenantId = 'tenant-123';

  beforeEach(async () => {
    mockSchedulerService = {
      scheduleCronJob: jest.fn(),
      scheduleJob: jest.fn(),
      removeRepeatableCronJob: jest.fn(),
    };

    mockInvoiceQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      removeRepeatable: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      tenant: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    mockAuditLogService = {
      logAction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceScheduleService,
        { provide: SchedulerService, useValue: mockSchedulerService },
        {
          provide: getQueueToken(QUEUE_NAMES.INVOICE_GENERATION),
          useValue: mockInvoiceQueue,
        },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<InvoiceScheduleService>(InvoiceScheduleService);
  });

  describe('scheduleTenantInvoices', () => {
    it('should schedule invoices with default cron (6AM on 1st), keyed by per-tenant jobId', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      await service.scheduleTenantInvoices(tenantId);

      expect(mockInvoiceQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          triggeredBy: 'cron',
          dryRun: false,
        }),
        expect.objectContaining({
          jobId: `${QUEUE_NAMES.INVOICE_GENERATION}:${tenantId}`,
          repeat: { cron: '0 6 1 * *' },
        }),
      );

      expect(mockAuditLogService.logAction).toHaveBeenCalled();
    });

    it('should schedule invoices with custom cron expression', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      const customCron = '0 8 15 * *'; // 8AM on 15th of month

      await service.scheduleTenantInvoices(tenantId, customCron);

      expect(mockInvoiceQueue.add).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          jobId: `${QUEUE_NAMES.INVOICE_GENERATION}:${tenantId}`,
          repeat: { cron: customCron },
        }),
      );
    });

    it('should throw if tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.scheduleTenantInvoices(tenantId)).rejects.toThrow(
        BusinessException,
      );
    });

    it('should throw for invalid cron expression', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      await expect(
        service.scheduleTenantInvoices(tenantId, 'invalid-cron'),
      ).rejects.toThrow('Invalid cron expression');
    });

    it('should reject cron with wrong number of fields', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      // Only 4 fields instead of 5
      await expect(
        service.scheduleTenantInvoices(tenantId, '0 6 1 *'),
      ).rejects.toThrow('Invalid cron expression');
    });
  });

  describe('triggerManualGeneration', () => {
    it('should trigger manual generation successfully', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
      });

      const mockJob = { id: 'job-123' };
      mockSchedulerService.scheduleJob.mockResolvedValue(mockJob);

      const result = await service.triggerManualGeneration(tenantId, '2025-01');

      expect(mockSchedulerService.scheduleJob).toHaveBeenCalledWith(
        QUEUE_NAMES.INVOICE_GENERATION,
        expect.objectContaining({
          tenantId,
          billingMonth: '2025-01',
          triggeredBy: 'manual',
          dryRun: false,
        }),
      );

      expect(result.id).toBe('job-123');
      expect(mockAuditLogService.logAction).toHaveBeenCalled();
    });

    it('should support dry run mode', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
      });

      const mockJob = { id: 'job-123' };
      mockSchedulerService.scheduleJob.mockResolvedValue(mockJob);

      await service.triggerManualGeneration(tenantId, '2025-01', true);

      expect(mockSchedulerService.scheduleJob).toHaveBeenCalledWith(
        QUEUE_NAMES.INVOICE_GENERATION,
        expect.objectContaining({
          dryRun: true,
        }),
      );
    });

    it('should throw for invalid billing month format', async () => {
      await expect(
        service.triggerManualGeneration(tenantId, '2025-1'),
      ).rejects.toThrow('Invalid billing month format');
    });

    it('should throw for wrong format patterns', async () => {
      await expect(
        service.triggerManualGeneration(tenantId, 'January 2025'),
      ).rejects.toThrow('Invalid billing month format');

      await expect(
        service.triggerManualGeneration(tenantId, '01-2025'),
      ).rejects.toThrow('Invalid billing month format');
    });

    it('should throw if tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.triggerManualGeneration(tenantId, '2025-01'),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('cancelSchedule', () => {
    it('should cancel schedule and log audit', async () => {
      await service.cancelSchedule(tenantId);

      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          entityType: 'InvoiceSchedule',
          afterValue: expect.objectContaining({
            enabled: false,
          }),
        }),
      );
    });

    it('should invoke queue.removeRepeatable with default cron and this tenant jobId only', async () => {
      await service.cancelSchedule(tenantId);

      expect(mockInvoiceQueue.removeRepeatable).toHaveBeenCalledWith({
        cron: '0 6 1 * *',
        jobId: `${QUEUE_NAMES.INVOICE_GENERATION}:${tenantId}`,
      });
    });
  });

  describe('updateSchedule', () => {
    it('should update schedule by cancelling and creating new', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      const newCron = '0 9 5 * *';

      await service.updateSchedule(tenantId, newCron);

      // Should cancel first
      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'InvoiceSchedule',
          afterValue: expect.objectContaining({
            enabled: false,
          }),
        }),
      );

      // Then schedule new
      expect(mockInvoiceQueue.add).toHaveBeenCalledWith(
        expect.any(Object),
        expect.objectContaining({
          jobId: `${QUEUE_NAMES.INVOICE_GENERATION}:${tenantId}`,
          repeat: { cron: newCron },
        }),
      );
    });

    it('should call cancelSchedule before scheduleTenantInvoices', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      const callOrder: string[] = [];
      mockInvoiceQueue.removeRepeatable.mockImplementation(async () => {
        callOrder.push('cancel');
      });
      mockInvoiceQueue.add.mockImplementation(async () => {
        callOrder.push('schedule');
        return { id: 'job-1' };
      });

      await service.updateSchedule(tenantId, '0 9 5 * *');

      expect(callOrder).toEqual(['cancel', 'schedule']);
    });
  });

  describe('getScheduleConfig', () => {
    it('should return default config for existing tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
      });

      const config = await service.getScheduleConfig(tenantId);

      expect(config).toEqual({
        tenantId,
        cronExpression: '0 6 1 * *',
        timezone: 'Africa/Johannesburg',
        enabled: true,
      });
    });

    it('should return null for non-existent tenant', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      const config = await service.getScheduleConfig(tenantId);

      expect(config).toBeNull();
    });
  });

  describe('cron expression validation', () => {
    it('should accept valid cron expressions', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      // Standard expressions
      await expect(
        service.scheduleTenantInvoices(tenantId, '0 6 1 * *'),
      ).resolves.not.toThrow();

      await expect(
        service.scheduleTenantInvoices(tenantId, '* * * * *'),
      ).resolves.not.toThrow();

      await expect(
        service.scheduleTenantInvoices(tenantId, '0 0 1,15 * *'),
      ).resolves.not.toThrow();

      await expect(
        service.scheduleTenantInvoices(tenantId, '*/5 * * * *'),
      ).resolves.not.toThrow();
    });

    it('should reject expressions with range syntax in invalid format', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      // 6 fields is invalid for standard cron
      await expect(
        service.scheduleTenantInvoices(tenantId, '0 0 0 6 1 * *'),
      ).rejects.toThrow('Invalid cron expression');
    });
  });

  describe('getNextBillingMonth', () => {
    it('should return next month in YYYY-MM format', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      await service.scheduleTenantInvoices(tenantId);

      // Verify the billingMonth format in the job data
      const call = mockInvoiceQueue.add.mock.calls[0];
      const jobData = call[0];

      expect(jobData.billingMonth).toMatch(/^\d{4}-\d{2}$/);
    });
  });

  describe('onApplicationBootstrap', () => {
    it('calls queue.add once per ACTIVE tenant, each with a distinct per-tenant jobId', async () => {
      mockPrisma.tenant.findMany = jest.fn().mockResolvedValue([
        { id: 'tenant-a', name: 'Creche A' },
        { id: 'tenant-b', name: 'Creche B' },
      ]);
      // findUnique is called inside scheduleTenantInvoices for each tenant
      mockPrisma.tenant.findUnique
        .mockResolvedValueOnce({ id: 'tenant-a', name: 'Creche A' })
        .mockResolvedValueOnce({ id: 'tenant-b', name: 'Creche B' });

      await service.onApplicationBootstrap();

      // removeRepeatable called once per tenant before scheduling
      expect(mockInvoiceQueue.removeRepeatable).toHaveBeenCalledTimes(2);
      expect(mockInvoiceQueue.removeRepeatable).toHaveBeenCalledWith({
        cron: '0 6 1 * *',
        jobId: `${QUEUE_NAMES.INVOICE_GENERATION}:tenant-a`,
      });
      expect(mockInvoiceQueue.removeRepeatable).toHaveBeenCalledWith({
        cron: '0 6 1 * *',
        jobId: `${QUEUE_NAMES.INVOICE_GENERATION}:tenant-b`,
      });

      // queue.add called once per tenant, each with its own jobId (this is
      // the crux of the multi-tenant collision fix — both tenants get a
      // real, independent repeatable job).
      expect(mockInvoiceQueue.add).toHaveBeenCalledTimes(2);
      expect(mockInvoiceQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-a' }),
        expect.objectContaining({
          jobId: `${QUEUE_NAMES.INVOICE_GENERATION}:tenant-a`,
          repeat: { cron: '0 6 1 * *' },
        }),
      );
      expect(mockInvoiceQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-b' }),
        expect.objectContaining({
          jobId: `${QUEUE_NAMES.INVOICE_GENERATION}:tenant-b`,
          repeat: { cron: '0 6 1 * *' },
        }),
      );

      // The two jobIds must differ — this is what prevents tenant-b's
      // removeRepeatable from ever targeting tenant-a's repeatable.
      const jobIds = mockInvoiceQueue.add.mock.calls.map(
        (call: any[]) => call[1].jobId,
      );
      expect(new Set(jobIds).size).toBe(2);
    });

    it('is idempotent: calling twice results in remove-then-schedule for each call', async () => {
      mockPrisma.tenant.findMany = jest
        .fn()
        .mockResolvedValue([{ id: 'tenant-a', name: 'Creche A' }]);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-a',
        name: 'Creche A',
      });

      await service.onApplicationBootstrap();
      await service.onApplicationBootstrap();

      // removeRepeatable called before each queue.add on each bootstrap
      // 2 bootstraps × 1 tenant = 2 remove calls, 2 add calls
      expect(mockInvoiceQueue.removeRepeatable).toHaveBeenCalledTimes(2);
      expect(mockInvoiceQueue.add).toHaveBeenCalledTimes(2);
    });

    it('skips registration when no ACTIVE tenants exist', async () => {
      mockPrisma.tenant.findMany = jest.fn().mockResolvedValue([]);

      await service.onApplicationBootstrap();

      expect(mockInvoiceQueue.add).not.toHaveBeenCalled();
    });

    it('continues registering remaining tenants if one fails', async () => {
      mockPrisma.tenant.findMany = jest.fn().mockResolvedValue([
        { id: 'tenant-a', name: 'Creche A' },
        { id: 'tenant-b', name: 'Creche B' },
      ]);
      // tenant-a: removeRepeatable succeeds, scheduleTenantInvoices findUnique returns null → throws
      mockPrisma.tenant.findUnique
        .mockResolvedValueOnce(null) // tenant-a fails
        .mockResolvedValueOnce({ id: 'tenant-b', name: 'Creche B' }); // tenant-b succeeds

      await expect(service.onApplicationBootstrap()).resolves.not.toThrow();

      // tenant-b was still scheduled despite tenant-a failing
      expect(mockInvoiceQueue.add).toHaveBeenCalledTimes(1);
      expect(mockInvoiceQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-b' }),
        expect.objectContaining({
          jobId: `${QUEUE_NAMES.INVOICE_GENERATION}:tenant-b`,
        }),
      );
    });
  });
});
