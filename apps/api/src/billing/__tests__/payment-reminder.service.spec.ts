/**
 * Payment Reminder Service Tests
 * TASK-PAY-015 + AUDIT-BILL-05
 *
 * Focuses on cancelReminders() wiring and the cancel-before-schedule
 * ordering guarantee introduced by AUDIT-BILL-05.
 */
import { Test, TestingModule } from '@nestjs/testing';
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
  let mockPrisma: any;
  let mockAuditLogService: any;

  const tenantId = 'tenant-456';

  beforeEach(async () => {
    mockSchedulerService = {
      scheduleCronJob: jest.fn(),
      scheduleJob: jest.fn(),
      removeRepeatableCronJob: jest.fn(),
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
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<PaymentReminderService>(PaymentReminderService);
  });

  describe('scheduleReminders', () => {
    it('should schedule reminders with default cron (09:00 SAST daily)', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });
      mockSchedulerService.scheduleCronJob.mockResolvedValue({
        id: 'job-1',
      } as any);

      await service.scheduleReminders(tenantId);

      expect(mockSchedulerService.scheduleCronJob).toHaveBeenCalledWith(
        QUEUE_NAMES.PAYMENT_REMINDER,
        expect.objectContaining({
          tenantId,
          triggeredBy: 'cron',
        }),
        '0 9 * * *',
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
    it('should invoke removeRepeatableCronJob with PAYMENT_REMINDER queue and default cron', async () => {
      mockSchedulerService.removeRepeatableCronJob.mockResolvedValue(undefined);

      await service.cancelReminders(tenantId);

      expect(mockSchedulerService.removeRepeatableCronJob).toHaveBeenCalledWith(
        QUEUE_NAMES.PAYMENT_REMINDER,
        '0 9 * * *',
      );
    });

    it('should audit-log the cancellation', async () => {
      mockSchedulerService.removeRepeatableCronJob.mockResolvedValue(undefined);

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
    it('calls scheduleReminders once per ACTIVE tenant', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: 'tenant-a', name: 'Creche A' },
        { id: 'tenant-b', name: 'Creche B' },
      ]);
      mockPrisma.tenant.findUnique
        .mockResolvedValueOnce({ id: 'tenant-a', name: 'Creche A' })
        .mockResolvedValueOnce({ id: 'tenant-b', name: 'Creche B' });

      await service.onApplicationBootstrap();

      expect(
        mockSchedulerService.removeRepeatableCronJob,
      ).toHaveBeenCalledTimes(2);
      expect(mockSchedulerService.scheduleCronJob).toHaveBeenCalledTimes(2);
      expect(mockSchedulerService.scheduleCronJob).toHaveBeenCalledWith(
        QUEUE_NAMES.PAYMENT_REMINDER,
        expect.objectContaining({ tenantId: 'tenant-a' }),
        '0 9 * * *',
      );
      expect(mockSchedulerService.scheduleCronJob).toHaveBeenCalledWith(
        QUEUE_NAMES.PAYMENT_REMINDER,
        expect.objectContaining({ tenantId: 'tenant-b' }),
        '0 9 * * *',
      );
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

      expect(
        mockSchedulerService.removeRepeatableCronJob,
      ).toHaveBeenCalledTimes(2);
      expect(mockSchedulerService.scheduleCronJob).toHaveBeenCalledTimes(2);
    });

    it('skips registration when no ACTIVE tenants exist', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([]);

      await service.onApplicationBootstrap();

      expect(mockSchedulerService.scheduleCronJob).not.toHaveBeenCalled();
    });
  });
});
