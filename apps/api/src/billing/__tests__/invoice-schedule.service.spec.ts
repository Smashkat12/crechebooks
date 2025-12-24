/**
 * Invoice Schedule Service Tests
 * TASK-BILL-016: Invoice Generation Scheduling Cron Job
 */
import { Test, TestingModule } from '@nestjs/testing';
import { InvoiceScheduleService } from '../invoice-schedule.service';
import { SchedulerService } from '../../scheduler/scheduler.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { BusinessException } from '../../shared/exceptions';
import { QUEUE_NAMES } from '../../scheduler/types/scheduler.types';

describe('InvoiceScheduleService', () => {
  let service: InvoiceScheduleService;
  let mockSchedulerService: any;
  let mockPrisma: any;
  let mockAuditLogService: any;

  const tenantId = 'tenant-123';

  beforeEach(async () => {
    mockSchedulerService = {
      scheduleCronJob: jest.fn(),
      scheduleJob: jest.fn(),
    };

    mockPrisma = {
      tenant: {
        findUnique: jest.fn(),
      },
    };

    mockAuditLogService = {
      logAction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InvoiceScheduleService,
        { provide: SchedulerService, useValue: mockSchedulerService },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<InvoiceScheduleService>(InvoiceScheduleService);
  });

  describe('scheduleTenantInvoices', () => {
    it('should schedule invoices with default cron (6AM on 1st)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      await service.scheduleTenantInvoices(tenantId);

      expect(mockSchedulerService.scheduleCronJob).toHaveBeenCalledWith(
        QUEUE_NAMES.INVOICE_GENERATION,
        expect.objectContaining({
          tenantId,
          triggeredBy: 'cron',
          dryRun: false,
        }),
        '0 6 1 * *',
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

      expect(mockSchedulerService.scheduleCronJob).toHaveBeenCalledWith(
        QUEUE_NAMES.INVOICE_GENERATION,
        expect.any(Object),
        customCron,
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
      expect(mockSchedulerService.scheduleCronJob).toHaveBeenCalledWith(
        QUEUE_NAMES.INVOICE_GENERATION,
        expect.any(Object),
        newCron,
      );
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
      const call = mockSchedulerService.scheduleCronJob.mock.calls[0];
      const jobData = call[1];

      expect(jobData.billingMonth).toMatch(/^\d{4}-\d{2}$/);
    });
  });
});
