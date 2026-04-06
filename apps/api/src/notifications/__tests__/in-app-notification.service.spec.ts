import { Test, TestingModule } from '@nestjs/testing';
import { InAppNotificationService } from '../in-app-notification.service';
import { PrismaService } from '../../database/prisma/prisma.service';
import { NotificationPriority, Prisma } from '@prisma/client';

const TENANT_ID = 'tenant-1';
const RECIPIENT_ID = 'user-1';
const RECIPIENT_TYPE = 'USER' as const;

function buildNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: 'notif-1',
    tenantId: TENANT_ID,
    recipientType: RECIPIENT_TYPE,
    recipientId: RECIPIENT_ID,
    type: 'PAYMENT_RECEIVED',
    priority: NotificationPriority.NORMAL,
    title: 'Payment received',
    body: 'A payment of R500 was received',
    actionUrl: '/payments/pay-1',
    metadata: null,
    isRead: false,
    readAt: null,
    expiresAt: null,
    createdAt: new Date('2026-04-01T00:00:00Z'),
    updatedAt: new Date('2026-04-01T00:00:00Z'),
    ...overrides,
  };
}

describe('InAppNotificationService', () => {
  let service: InAppNotificationService;
  let prisma: {
    notification: {
      create: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      notification: {
        create: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InAppNotificationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<InAppNotificationService>(InAppNotificationService);
  });

  describe('create', () => {
    it('should create notification with correct data', async () => {
      const input = {
        tenantId: TENANT_ID,
        recipientType: RECIPIENT_TYPE,
        recipientId: RECIPIENT_ID,
        type: 'PAYMENT_RECEIVED',
        priority: 'HIGH',
        title: 'Payment received',
        body: 'R500 received',
        actionUrl: '/payments/pay-1',
        metadata: { invoiceId: 'inv-1' },
        expiresAt: new Date('2026-05-01'),
      };

      const expected = buildNotification({
        priority: 'HIGH',
        metadata: { invoiceId: 'inv-1' },
        actionUrl: '/payments/pay-1',
        expiresAt: new Date('2026-05-01'),
      });
      prisma.notification.create.mockResolvedValue(expected);

      const result = await service.create(input);

      expect(result).toEqual(expected);
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          tenantId: TENANT_ID,
          recipientType: RECIPIENT_TYPE,
          recipientId: RECIPIENT_ID,
          type: 'PAYMENT_RECEIVED',
          priority: 'HIGH',
          title: 'Payment received',
          body: 'R500 received',
          actionUrl: '/payments/pay-1',
          metadata: { invoiceId: 'inv-1' },
          expiresAt: new Date('2026-05-01'),
        },
      });
    });

    it('should use NORMAL priority when not specified', async () => {
      const input = {
        tenantId: TENANT_ID,
        recipientType: RECIPIENT_TYPE,
        recipientId: RECIPIENT_ID,
        type: 'INVOICE_GENERATED',
        title: 'Invoice ready',
        body: 'Your invoice is ready',
      };

      prisma.notification.create.mockResolvedValue(buildNotification());

      await service.create(input);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          priority: NotificationPriority.NORMAL,
        }),
      });
    });

    it('should set actionUrl to null when not provided', async () => {
      const input = {
        tenantId: TENANT_ID,
        recipientType: RECIPIENT_TYPE,
        recipientId: RECIPIENT_ID,
        type: 'GENERAL',
        title: 'Hello',
        body: 'World',
      };

      prisma.notification.create.mockResolvedValue(buildNotification());

      await service.create(input);

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          actionUrl: null,
          expiresAt: null,
          metadata: Prisma.DbNull,
        }),
      });
    });
  });

  describe('listForRecipient', () => {
    const baseQuery = {
      tenantId: TENANT_ID,
      recipientType: RECIPIENT_TYPE,
      recipientId: RECIPIENT_ID,
    };

    it('should return paginated results with cursor', async () => {
      const items = [
        buildNotification({ id: 'n-2' }),
        buildNotification({ id: 'n-1' }),
      ];
      // Return exactly limit items (no extra), so hasMore = false
      prisma.notification.findMany.mockResolvedValue(items);
      prisma.notification.count.mockResolvedValue(1);

      const result = await service.listForRecipient({
        ...baseQuery,
        cursor: 'n-3',
        limit: 5,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta.hasMore).toBe(false);
      expect(result.meta.nextCursor).toBeNull();
      expect(result.meta.unreadCount).toBe(1);

      // Verify cursor-based pagination args
      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          cursor: { id: 'n-3' },
          skip: 1,
          take: 6, // limit + 1
        }),
      );
    });

    it('should calculate hasMore correctly', async () => {
      // Return limit+1 items to indicate there are more
      const items = Array.from({ length: 4 }, (_, i) =>
        buildNotification({ id: `n-${i}` }),
      );
      prisma.notification.findMany.mockResolvedValue(items);
      prisma.notification.count.mockResolvedValue(5);

      const result = await service.listForRecipient({
        ...baseQuery,
        limit: 3,
      });

      expect(result.meta.hasMore).toBe(true);
      expect(result.data).toHaveLength(3);
      expect(result.meta.nextCursor).toBe('n-2');
    });

    it('should filter by isRead and type', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await service.listForRecipient({
        ...baseQuery,
        isRead: false,
        type: 'PAYMENT_RECEIVED',
      });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            isRead: false,
            type: 'PAYMENT_RECEIVED',
          }),
        }),
      );
    });

    it('should cap limit at 50', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await service.listForRecipient({ ...baseQuery, limit: 100 });

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 51, // MAX_LIMIT(50) + 1
        }),
      );
    });

    it('should default limit to 20 when not provided', async () => {
      prisma.notification.findMany.mockResolvedValue([]);
      prisma.notification.count.mockResolvedValue(0);

      await service.listForRecipient(baseQuery);

      expect(prisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 21, // DEFAULT_LIMIT(20) + 1
        }),
      );
    });
  });

  describe('getUnreadCount', () => {
    it('should return count of unread notifications', async () => {
      prisma.notification.count.mockResolvedValue(7);

      const result = await service.getUnreadCount(
        TENANT_ID,
        RECIPIENT_TYPE,
        RECIPIENT_ID,
      );

      expect(result).toBe(7);
      expect(prisma.notification.count).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          recipientType: RECIPIENT_TYPE,
          recipientId: RECIPIENT_ID,
          isRead: false,
        },
      });
    });
  });

  describe('markAsRead', () => {
    it('should update isRead and readAt', async () => {
      prisma.notification.update.mockResolvedValue(
        buildNotification({ isRead: true, readAt: new Date() }),
      );

      await service.markAsRead('notif-1', TENANT_ID);

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1', tenantId: TENANT_ID },
        data: {
          isRead: true,
          readAt: expect.any(Date),
        },
      });
    });
  });

  describe('markAllAsRead', () => {
    it('should update all unread and return count', async () => {
      prisma.notification.updateMany.mockResolvedValue({ count: 5 });

      const result = await service.markAllAsRead(
        TENANT_ID,
        RECIPIENT_TYPE,
        RECIPIENT_ID,
      );

      expect(result).toBe(5);
      expect(prisma.notification.updateMany).toHaveBeenCalledWith({
        where: {
          tenantId: TENANT_ID,
          recipientType: RECIPIENT_TYPE,
          recipientId: RECIPIENT_ID,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: expect.any(Date),
        },
      });
    });
  });

  describe('deleteNotification', () => {
    it('should delete by id and tenantId', async () => {
      prisma.notification.delete.mockResolvedValue(buildNotification());

      await service.deleteNotification('notif-1', TENANT_ID);

      expect(prisma.notification.delete).toHaveBeenCalledWith({
        where: { id: 'notif-1', tenantId: TENANT_ID },
      });
    });
  });
});
