import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { NotificationEmitter } from '../notification-emitter';
import { PrismaService } from '../../../database/prisma/prisma.service';

describe('NotificationEmitter', () => {
  let emitter: NotificationEmitter;
  let mockQueue: { add: jest.Mock };
  let mockPrisma: { user: { findMany: jest.Mock } };

  const TENANT_ID = 'tenant-1';

  const notifyParams = {
    type: 'PAYMENT_RECEIVED',
    title: 'Payment received',
    body: 'R500 received',
    actionUrl: '/payments/pay-1',
    metadata: { invoiceId: 'inv-1' },
  };

  beforeEach(async () => {
    mockQueue = { add: jest.fn().mockResolvedValue({ id: 'job-1' }) };
    mockPrisma = {
      user: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'admin-1' }, { id: 'admin-2' }]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationEmitter,
        { provide: getQueueToken('notification'), useValue: mockQueue },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    emitter = module.get<NotificationEmitter>(NotificationEmitter);
  });

  describe('notifyAdmins', () => {
    it('should query admins and enqueue one job per admin', async () => {
      await emitter.notifyAdmins(TENANT_ID, notifyParams);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {
          currentTenantId: TENANT_ID,
          role: { in: ['OWNER', 'ADMIN'] },
          isActive: true,
        },
        select: { id: true },
      });

      expect(mockQueue.add).toHaveBeenCalledTimes(2);

      // First admin
      expect(mockQueue.add).toHaveBeenCalledWith(
        {
          notification: {
            tenantId: TENANT_ID,
            recipientType: 'USER',
            recipientId: 'admin-1',
            ...notifyParams,
          },
        },
        expect.objectContaining({
          removeOnComplete: true,
          attempts: 3,
        }),
      );

      // Second admin
      expect(mockQueue.add).toHaveBeenCalledWith(
        {
          notification: {
            tenantId: TENANT_ID,
            recipientType: 'USER',
            recipientId: 'admin-2',
            ...notifyParams,
          },
        },
        expect.objectContaining({
          removeOnComplete: true,
          attempts: 3,
        }),
      );
    });

    it('should not throw when no admins found', async () => {
      mockPrisma.user.findMany.mockResolvedValue([]);

      await expect(
        emitter.notifyAdmins(TENANT_ID, notifyParams),
      ).resolves.toBeUndefined();

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should not throw when prisma query fails', async () => {
      mockPrisma.user.findMany.mockRejectedValue(new Error('DB down'));

      await expect(
        emitter.notifyAdmins(TENANT_ID, notifyParams),
      ).resolves.toBeUndefined();
    });
  });

  describe('notifyParent', () => {
    it('should enqueue single job with PARENT recipientType', async () => {
      await emitter.notifyParent(TENANT_ID, 'parent-1', notifyParams);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        {
          notification: {
            tenantId: TENANT_ID,
            recipientType: 'PARENT',
            recipientId: 'parent-1',
            ...notifyParams,
          },
        },
        expect.objectContaining({
          removeOnComplete: true,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1000 },
        }),
      );
    });
  });

  describe('notifyStaff', () => {
    it('should enqueue single job with STAFF recipientType', async () => {
      await emitter.notifyStaff(TENANT_ID, 'staff-1', notifyParams);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        {
          notification: {
            tenantId: TENANT_ID,
            recipientType: 'STAFF',
            recipientId: 'staff-1',
            ...notifyParams,
          },
        },
        expect.objectContaining({
          removeOnComplete: true,
          attempts: 3,
        }),
      );
    });
  });

  describe('notifyUser', () => {
    it('should enqueue single job with USER recipientType', async () => {
      await emitter.notifyUser(TENANT_ID, 'user-1', notifyParams);

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      expect(mockQueue.add).toHaveBeenCalledWith(
        {
          notification: {
            tenantId: TENANT_ID,
            recipientType: 'USER',
            recipientId: 'user-1',
            ...notifyParams,
          },
        },
        expect.objectContaining({
          removeOnComplete: true,
          attempts: 3,
        }),
      );
    });
  });

  describe('fire-and-forget error handling', () => {
    it('should not throw when queue add fails', async () => {
      mockQueue.add.mockRejectedValue(new Error('Redis down'));

      await expect(
        emitter.notifyUser(TENANT_ID, 'user-1', notifyParams),
      ).resolves.toBeUndefined();
    });

    it('should not throw when queue add fails for parent', async () => {
      mockQueue.add.mockRejectedValue(new Error('Redis down'));

      await expect(
        emitter.notifyParent(TENANT_ID, 'parent-1', notifyParams),
      ).resolves.toBeUndefined();
    });

    it('should not throw when queue add fails for staff', async () => {
      mockQueue.add.mockRejectedValue(new Error('Redis down'));

      await expect(
        emitter.notifyStaff(TENANT_ID, 'staff-1', notifyParams),
      ).resolves.toBeUndefined();
    });
  });
});
