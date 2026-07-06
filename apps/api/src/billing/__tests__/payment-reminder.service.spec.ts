/**
 * Payment Reminder Service Tests
 * TASK-PAY-015 + AUDIT-BILL-05
 *
 * Focuses on cancelReminders() wiring and the cancel-before-schedule
 * ordering guarantee introduced by AUDIT-BILL-05.
 *
 * BUGFIX (multi-tenant cron collision): scheduleReminders/cancelReminders
 * now call the injected Bull queue directly (queue.add/removeRepeatable)
 * with a per-tenant jobId, instead of SchedulerService.scheduleCronJob/
 * removeRepeatableCronJob (which do not thread a jobId through). Tests
 * below mock the injected queue accordingly.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { PaymentReminderService } from '../payment-reminder.service';
import { SchedulerService } from '../../scheduler/scheduler.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { BusinessException } from '../../shared/exceptions';
import { QUEUE_NAMES } from '../../scheduler/types/scheduler.types';

describe('PaymentReminderService', () => {
  let service: PaymentReminderService;
  let mockSchedulerService: jest.Mocked<
    Pick<
      SchedulerService,
      'scheduleCronJob' | 'scheduleJob' | 'removeRepeatableCronJob'
    >
  >;
  let mockReminderQueue: any;
  let mockPrisma: any;
  let mockAuditLogService: any;

  const tenantId = 'tenant-456';

  beforeEach(async () => {
    mockSchedulerService = {
      scheduleCronJob: jest.fn(),
      scheduleJob: jest.fn(),
      removeRepeatableCronJob: jest.fn(),
    };

    mockReminderQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      removeRepeatable: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      tenant: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
      },
      invoice: { findMany: jest.fn() },
      reminder: { findMany: jest.fn() },
    };

    mockAuditLogService = {
      logAction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentReminderService,
        { provide: SchedulerService, useValue: mockSchedulerService },
        {
          provide: getQueueToken(QUEUE_NAMES.PAYMENT_REMINDER),
          useValue: mockReminderQueue,
        },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<PaymentReminderService>(PaymentReminderService);
  });

  describe('scheduleReminders', () => {
    it('should schedule reminders with default cron (09:00 SAST daily), keyed by per-tenant jobId', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      await service.scheduleReminders(tenantId);

      expect(mockReminderQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          triggeredBy: 'cron',
        }),
        expect.objectContaining({
          jobId: `${QUEUE_NAMES.PAYMENT_REMINDER}:${tenantId}`,
          repeat: { cron: '0 9 * * *' },
        }),
      );
      expect(mockAuditLogService.logAction).toHaveBeenCalled();
    });

    it('should throw if tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.scheduleReminders(tenantId)).rejects.toThrow(
        BusinessException,
      );
    });

    it('should throw for invalid cron expression', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      await expect(
        service.scheduleReminders(tenantId, 'bad-cron'),
      ).rejects.toThrow('Invalid cron expression');
    });
  });

  describe('cancelReminders', () => {
    it('should invoke queue.removeRepeatable with default cron and this tenant jobId only', async () => {
      await service.cancelReminders(tenantId);

      expect(mockReminderQueue.removeRepeatable).toHaveBeenCalledWith({
        cron: '0 9 * * *',
        jobId: `${QUEUE_NAMES.PAYMENT_REMINDER}:${tenantId}`,
      });
    });

    it('should audit-log the cancellation', async () => {
      await service.cancelReminders(tenantId);

      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          entityType: 'PaymentReminderSchedule',
          afterValue: expect.objectContaining({ enabled: false }),
        }),
      );
    });
  });

  describe('triggerManualReminders', () => {
    it('should schedule a manual job and audit-log it', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: tenantId });
      const mockJob = { id: 'job-99' };
      mockSchedulerService.scheduleJob.mockResolvedValue(mockJob as any);

      const result = await service.triggerManualReminders(tenantId);

      expect(mockSchedulerService.scheduleJob).toHaveBeenCalledWith(
        QUEUE_NAMES.PAYMENT_REMINDER,
        expect.objectContaining({ tenantId, triggeredBy: 'manual' }),
      );
      expect(result.id).toBe('job-99');
      expect(mockAuditLogService.logAction).toHaveBeenCalled();
    });

    it('should throw if tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.triggerManualReminders(tenantId)).rejects.toThrow(
        BusinessException,
      );
    });
  });

  describe('onApplicationBootstrap', () => {
    it('calls queue.add once per ACTIVE tenant, each with a distinct per-tenant jobId', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: 'tenant-a', name: 'Creche A' },
        { id: 'tenant-b', name: 'Creche B' },
      ]);
      mockPrisma.tenant.findUnique
        .mockResolvedValueOnce({ id: 'tenant-a', name: 'Creche A' })
        .mockResolvedValueOnce({ id: 'tenant-b', name: 'Creche B' });

      await service.onApplicationBootstrap();

      expect(mockReminderQueue.removeRepeatable).toHaveBeenCalledTimes(2);
      expect(mockReminderQueue.add).toHaveBeenCalledTimes(2);
      expect(mockReminderQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-a' }),
        expect.objectContaining({
          jobId: `${QUEUE_NAMES.PAYMENT_REMINDER}:tenant-a`,
          repeat: { cron: '0 9 * * *' },
        }),
      );
      expect(mockReminderQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-b' }),
        expect.objectContaining({
          jobId: `${QUEUE_NAMES.PAYMENT_REMINDER}:tenant-b`,
          repeat: { cron: '0 9 * * *' },
        }),
      );

      // Distinct jobIds are the crux of the multi-tenant collision fix.
      const jobIds = mockReminderQueue.add.mock.calls.map(
        (call: any[]) => call[1].jobId,
      );
      expect(new Set(jobIds).size).toBe(2);
    });

    it('is idempotent: calling twice does remove-then-schedule each time', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: 'tenant-a', name: 'Creche A' },
      ]);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-a',
        name: 'Creche A',
      });

      await service.onApplicationBootstrap();
      await service.onApplicationBootstrap();

      expect(mockReminderQueue.removeRepeatable).toHaveBeenCalledTimes(2);
      expect(mockReminderQueue.add).toHaveBeenCalledTimes(2);
    });

    it('skips registration when no ACTIVE tenants exist', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([]);

      await service.onApplicationBootstrap();

      expect(mockReminderQueue.add).not.toHaveBeenCalled();
    });
  });
});
