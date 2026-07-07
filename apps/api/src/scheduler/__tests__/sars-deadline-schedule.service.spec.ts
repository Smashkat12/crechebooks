/**
 * SARS Deadline Schedule Service Tests
 * TASK-SARS-017: SARS Deadline Reminder System — producer
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { SarsDeadlineScheduleService } from '../sars-deadline-schedule.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { QUEUE_NAMES } from '../types/scheduler.types';
import { SubscriptionStatus } from '../../database/entities/tenant.entity';

describe('SarsDeadlineScheduleService', () => {
  let service: SarsDeadlineScheduleService;
  let mockQueue: any;
  let mockPrisma: any;

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
    };

    mockPrisma = {
      tenant: {
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SarsDeadlineScheduleService,
        {
          provide: getQueueToken(QUEUE_NAMES.SARS_DEADLINE),
          useValue: mockQueue,
        },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<SarsDeadlineScheduleService>(
      SarsDeadlineScheduleService,
    );
  });

  it('enqueues one deadline-check job per ACTIVE tenant with a per-tenant/day jobId', async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([
      { id: 'tenant-a', name: 'Creche A' },
      { id: 'tenant-b', name: 'Creche B' },
    ]);

    await service.enqueueDailyDeadlineChecks();

    expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
      where: { subscriptionStatus: SubscriptionStatus.ACTIVE },
      select: { id: true, name: true },
    });

    expect(mockQueue.add).toHaveBeenCalledTimes(2);

    const dateKey = new Date().toISOString().split('T')[0];
    expect(mockQueue.add).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        triggeredBy: 'cron',
      }),
      expect.objectContaining({
        jobId: `${QUEUE_NAMES.SARS_DEADLINE}:tenant-a:${dateKey}`,
      }),
    );
    expect(mockQueue.add).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-b',
        triggeredBy: 'cron',
      }),
      expect.objectContaining({
        jobId: `${QUEUE_NAMES.SARS_DEADLINE}:tenant-b:${dateKey}`,
      }),
    );
  });

  it('does not enqueue anything when there are no active tenants', async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([]);

    await service.enqueueDailyDeadlineChecks();

    expect(mockQueue.add).not.toHaveBeenCalled();
  });

  it('continues enqueueing remaining tenants when one add fails', async () => {
    mockPrisma.tenant.findMany.mockResolvedValue([
      { id: 'tenant-a', name: 'Creche A' },
      { id: 'tenant-b', name: 'Creche B' },
      { id: 'tenant-c', name: 'Creche C' },
    ]);
    mockQueue.add
      .mockResolvedValueOnce({ id: 'job-1' })
      .mockRejectedValueOnce(new Error('Redis connection lost'))
      .mockResolvedValueOnce({ id: 'job-3' });

    await expect(service.enqueueDailyDeadlineChecks()).resolves.not.toThrow();

    expect(mockQueue.add).toHaveBeenCalledTimes(3);
    expect(mockQueue.add).toHaveBeenLastCalledWith(
      expect.objectContaining({ tenantId: 'tenant-c' }),
      expect.anything(),
    );
  });
});
