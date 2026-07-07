/**
 * Statement Schedule Service Tests
 * TASK-STMT-008: Scheduled Monthly Statement Generation — producer
 *
 * Mirrors invoice-schedule.service.spec.ts conventions: mocks the injected
 * Bull queue directly (queue.add/removeRepeatable/getRepeatableJobs/
 * removeRepeatableByKey) since the service calls it directly rather than via
 * SchedulerService.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { StatementScheduleService } from '../statement-schedule.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { BusinessException } from '../../shared/exceptions';
import { QUEUE_NAMES } from '../../scheduler/types/scheduler.types';

describe('StatementScheduleService', () => {
  let service: StatementScheduleService;
  let mockStatementQueue: any;
  let mockPrisma: any;
  let mockAuditLogService: any;

  const tenantId = 'tenant-123';

  beforeEach(async () => {
    mockStatementQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      removeRepeatable: jest.fn().mockResolvedValue(undefined),
      getRepeatableJobs: jest.fn().mockResolvedValue([]),
      removeRepeatableByKey: jest.fn().mockResolvedValue(undefined),
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
        StatementScheduleService,
        {
          provide: getQueueToken(QUEUE_NAMES.STATEMENT_GENERATION),
          useValue: mockStatementQueue,
        },
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<StatementScheduleService>(StatementScheduleService);
  });

  describe('scheduleTenantStatements', () => {
    it('should schedule statements with default cron, keyed by per-tenant jobId, defaulting autoFinalize/autoDeliver to false', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      await service.scheduleTenantStatements(tenantId);

      expect(mockStatementQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          triggeredBy: 'cron',
          autoFinalize: false,
          autoDeliver: false,
          dryRun: false,
        }),
        expect.objectContaining({
          jobId: `${QUEUE_NAMES.STATEMENT_GENERATION}:${tenantId}`,
          repeat: { cron: '0 7 1 * *' },
        }),
      );

      expect(mockAuditLogService.logAction).toHaveBeenCalled();
    });

    it('should force autoDeliver false when autoFinalize is false, even if autoDeliver: true is passed', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      await service.scheduleTenantStatements(tenantId, undefined, {
        autoFinalize: false,
        autoDeliver: true,
      });

      expect(mockStatementQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ autoFinalize: false, autoDeliver: false }),
        expect.any(Object),
      );
    });

    it('should allow autoFinalize + autoDeliver when both explicitly opted in', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      await service.scheduleTenantStatements(tenantId, undefined, {
        autoFinalize: true,
        autoDeliver: true,
      });

      expect(mockStatementQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ autoFinalize: true, autoDeliver: true }),
        expect.any(Object),
      );
    });

    it('should throw if tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(service.scheduleTenantStatements(tenantId)).rejects.toThrow(
        BusinessException,
      );
    });

    it('should throw for invalid cron expression', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      await expect(
        service.scheduleTenantStatements(tenantId, 'invalid-cron'),
      ).rejects.toThrow('Invalid cron expression');
    });
  });

  describe('cancelSchedule', () => {
    it('should cancel schedule and log audit', async () => {
      await service.cancelSchedule(tenantId);

      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          entityType: 'StatementSchedule',
          afterValue: expect.objectContaining({ enabled: false }),
        }),
      );
    });

    it('should fall back to removeRepeatable with default cron when no persisted repeatable is found', async () => {
      mockStatementQueue.getRepeatableJobs.mockResolvedValue([]);

      await service.cancelSchedule(tenantId);

      expect(mockStatementQueue.removeRepeatable).toHaveBeenCalledWith({
        cron: '0 7 1 * *',
        jobId: `${QUEUE_NAMES.STATEMENT_GENERATION}:${tenantId}`,
      });
      expect(mockStatementQueue.removeRepeatableByKey).not.toHaveBeenCalled();
    });

    // Same class of bug the InvoiceScheduleService fix addresses: a tenant
    // scheduled with a custom (non-default) cron must be cancellable by
    // looking up its actual persisted repeatable, not by assuming the
    // default cron.
    it('should remove the persisted repeatable by key when the tenant has a custom (non-default) cron', async () => {
      const jobId = `${QUEUE_NAMES.STATEMENT_GENERATION}:${tenantId}`;
      mockStatementQueue.getRepeatableJobs.mockResolvedValue([
        {
          key: `${QUEUE_NAMES.STATEMENT_GENERATION}::0 9 15 * *::${jobId}`,
          id: jobId,
          name: QUEUE_NAMES.STATEMENT_GENERATION,
          cron: '0 9 15 * *',
          next: 0,
        },
      ]);

      await service.cancelSchedule(tenantId);

      expect(mockStatementQueue.removeRepeatableByKey).toHaveBeenCalledWith(
        `${QUEUE_NAMES.STATEMENT_GENERATION}::0 9 15 * *::${jobId}`,
      );
      expect(mockStatementQueue.removeRepeatable).not.toHaveBeenCalled();
    });
  });

  describe('updateSchedule', () => {
    it('should cancel before scheduling the new cron', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: tenantId,
        name: 'Test Creche',
      });

      const callOrder: string[] = [];
      mockStatementQueue.removeRepeatable.mockImplementation(async () => {
        callOrder.push('cancel');
      });
      mockStatementQueue.add.mockImplementation(async () => {
        callOrder.push('schedule');
        return { id: 'job-1' };
      });

      await service.updateSchedule(tenantId, '0 9 5 * *');

      expect(callOrder).toEqual(['cancel', 'schedule']);
    });
  });

  describe('triggerManualGeneration', () => {
    it('should trigger manual generation successfully', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({ id: tenantId });

      const result = await service.triggerManualGeneration(tenantId, '2025-01');

      expect(mockStatementQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId,
          statementMonth: '2025-01',
          triggeredBy: 'manual',
          autoFinalize: false,
          autoDeliver: false,
        }),
        expect.any(Object),
      );
      expect(result.id).toBe('job-1');
      expect(mockAuditLogService.logAction).toHaveBeenCalled();
    });

    it('should throw for invalid statement month format', async () => {
      await expect(
        service.triggerManualGeneration(tenantId, '2025-1'),
      ).rejects.toThrow('Invalid statement month format');
    });

    it('should throw if tenant not found', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.triggerManualGeneration(tenantId, '2025-01'),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('onApplicationBootstrap', () => {
    it('does not enroll ACTIVE tenants that have statementScheduleEnabled=false (default)', async () => {
      mockPrisma.tenant.findMany = jest.fn().mockResolvedValue([
        {
          id: 'tenant-a',
          name: 'Creche A',
          statementScheduleEnabled: false,
        },
        {
          id: 'tenant-b',
          name: 'Creche B',
          statementScheduleEnabled: false,
        },
      ]);

      await service.onApplicationBootstrap();

      // Opt-in flag is the default (false) — bootstrap enrols zero tenants,
      // preserving the OPT-IN SAFETY invariant from the service file header.
      expect(mockStatementQueue.add).not.toHaveBeenCalled();
      expect(mockStatementQueue.removeRepeatable).not.toHaveBeenCalled();
    });

    it('enrolls only ACTIVE tenants with statementScheduleEnabled=true', async () => {
      mockPrisma.tenant.findMany = jest.fn().mockResolvedValue([
        {
          id: 'tenant-opted-in',
          name: 'Creche Opted-In',
          statementScheduleEnabled: true,
        },
        {
          id: 'tenant-opted-out',
          name: 'Creche Opted-Out',
          statementScheduleEnabled: false,
        },
      ]);
      // scheduleTenantStatements re-fetches the tenant for its name — return
      // the opted-in tenant so the schedule call succeeds.
      mockPrisma.tenant.findUnique.mockResolvedValue({
        id: 'tenant-opted-in',
        name: 'Creche Opted-In',
      });

      await service.onApplicationBootstrap();

      // Exactly one add() — only the opted-in tenant is enrolled.
      expect(mockStatementQueue.add).toHaveBeenCalledTimes(1);
      expect(mockStatementQueue.add).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: 'tenant-opted-in' }),
        expect.objectContaining({
          jobId: `${QUEUE_NAMES.STATEMENT_GENERATION}:tenant-opted-in`,
        }),
      );
      // Remove-then-schedule idempotency: the opted-in tenant is
      // pre-cleaned; the opted-out tenant is never touched.
      expect(mockStatementQueue.removeRepeatable).toHaveBeenCalledTimes(1);
      expect(mockStatementQueue.removeRepeatable).toHaveBeenCalledWith({
        cron: '0 7 1 * *',
        jobId: `${QUEUE_NAMES.STATEMENT_GENERATION}:tenant-opted-in`,
      });
    });

    it('skips registration when no ACTIVE tenants exist', async () => {
      mockPrisma.tenant.findMany = jest.fn().mockResolvedValue([]);

      await service.onApplicationBootstrap();

      expect(mockStatementQueue.add).not.toHaveBeenCalled();
    });
  });
});
