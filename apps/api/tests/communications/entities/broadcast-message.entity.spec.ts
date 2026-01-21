/**
 * BroadcastMessageEntity Tests
 * TASK-COMM-001: Ad-hoc Communication Database Schema
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { BroadcastMessageEntity } from '../../../src/communications/entities/broadcast-message.entity';
import {
  BroadcastStatus,
  RecipientType,
  CommunicationChannel,
} from '../../../src/communications/types/communication.types';

describe('BroadcastMessageEntity', () => {
  let entity: BroadcastMessageEntity;
  let _prismaService: PrismaService;

  const mockTenantId = '123e4567-e89b-12d3-a456-426614174000';
  const mockUserId = '123e4567-e89b-12d3-a456-426614174001';
  const mockBroadcastId = '123e4567-e89b-12d3-a456-426614174002';

  const mockBroadcast = {
    id: mockBroadcastId,
    tenantId: mockTenantId,
    subject: 'Test Announcement',
    body: 'This is a test message',
    htmlBody: '<p>This is a test message</p>',
    recipientType: RecipientType.PARENT,
    recipientFilter: { parentFilter: { isActive: true } },
    recipientGroupId: null,
    channel: CommunicationChannel.EMAIL,
    scheduledAt: null,
    sentAt: null,
    status: BroadcastStatus.DRAFT,
    totalRecipients: 0,
    sentCount: 0,
    failedCount: 0,
    createdBy: mockUserId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    broadcastMessage: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BroadcastMessageEntity,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    entity = module.get<BroadcastMessageEntity>(BroadcastMessageEntity);
    _prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a broadcast message', async () => {
      mockPrismaService.broadcastMessage.create.mockResolvedValue(
        mockBroadcast,
      );

      const result = await entity.create(
        {
          tenantId: mockTenantId,
          subject: 'Test Announcement',
          body: 'This is a test message',
          htmlBody: '<p>This is a test message</p>',
          recipientType: RecipientType.PARENT,
          recipientFilter: { parentFilter: { isActive: true } },
          channel: CommunicationChannel.EMAIL,
        },
        mockUserId,
      );

      expect(result).toEqual(mockBroadcast);
      expect(mockPrismaService.broadcastMessage.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: mockTenantId,
            subject: 'Test Announcement',
            body: 'This is a test message',
            createdBy: mockUserId,
            status: BroadcastStatus.DRAFT,
          }),
        }),
      );
    });

    it('should create a scheduled broadcast with SCHEDULED status', async () => {
      const scheduledAt = new Date('2026-02-01T10:00:00Z');
      const scheduledBroadcast = {
        ...mockBroadcast,
        scheduledAt,
        status: BroadcastStatus.SCHEDULED,
      };
      mockPrismaService.broadcastMessage.create.mockResolvedValue(
        scheduledBroadcast,
      );

      const result = await entity.create(
        {
          tenantId: mockTenantId,
          body: 'Scheduled message',
          recipientType: RecipientType.PARENT,
          channel: CommunicationChannel.EMAIL,
          scheduledAt,
        },
        mockUserId,
      );

      expect(result.status).toBe(BroadcastStatus.SCHEDULED);
    });
  });

  describe('findById', () => {
    it('should find a broadcast by ID', async () => {
      mockPrismaService.broadcastMessage.findUnique.mockResolvedValue(
        mockBroadcast,
      );

      const result = await entity.findById(mockBroadcastId);

      expect(result).toEqual(mockBroadcast);
      expect(
        mockPrismaService.broadcastMessage.findUnique,
      ).toHaveBeenCalledWith({
        where: { id: mockBroadcastId },
        include: expect.objectContaining({
          recipients: true,
          recipientGroup: true,
        }),
      });
    });

    it('should return null if broadcast not found', async () => {
      mockPrismaService.broadcastMessage.findUnique.mockResolvedValue(null);

      const result = await entity.findById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('findByTenant', () => {
    it('should find broadcasts by tenant', async () => {
      const broadcasts = [mockBroadcast];
      mockPrismaService.broadcastMessage.findMany.mockResolvedValue(broadcasts);

      const result = await entity.findByTenant(mockTenantId);

      expect(result).toEqual(broadcasts);
      expect(mockPrismaService.broadcastMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: mockTenantId },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });

    it('should filter by status when provided', async () => {
      mockPrismaService.broadcastMessage.findMany.mockResolvedValue([]);

      await entity.findByTenant(mockTenantId, { status: BroadcastStatus.SENT });

      expect(mockPrismaService.broadcastMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: mockTenantId,
            status: BroadcastStatus.SENT,
          },
        }),
      );
    });

    it('should apply pagination', async () => {
      mockPrismaService.broadcastMessage.findMany.mockResolvedValue([]);

      await entity.findByTenant(mockTenantId, { limit: 10, offset: 20 });

      expect(mockPrismaService.broadcastMessage.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 10,
          skip: 20,
        }),
      );
    });
  });

  describe('updateStatus', () => {
    it('should update broadcast status', async () => {
      const updatedBroadcast = {
        ...mockBroadcast,
        status: BroadcastStatus.SENDING,
      };
      mockPrismaService.broadcastMessage.update.mockResolvedValue(
        updatedBroadcast,
      );

      const result = await entity.updateStatus(
        mockBroadcastId,
        BroadcastStatus.SENDING,
      );

      expect(result.status).toBe(BroadcastStatus.SENDING);
    });

    it('should set sentAt when status is SENT', async () => {
      const updatedBroadcast = {
        ...mockBroadcast,
        status: BroadcastStatus.SENT,
        sentAt: new Date(),
      };
      mockPrismaService.broadcastMessage.update.mockResolvedValue(
        updatedBroadcast,
      );

      await entity.updateStatus(mockBroadcastId, BroadcastStatus.SENT);

      expect(mockPrismaService.broadcastMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: BroadcastStatus.SENT,
            sentAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should update counts when provided', async () => {
      mockPrismaService.broadcastMessage.update.mockResolvedValue(
        mockBroadcast,
      );

      await entity.updateStatus(
        mockBroadcastId,
        BroadcastStatus.PARTIALLY_SENT,
        {
          totalRecipients: 100,
          sentCount: 90,
          failedCount: 10,
        },
      );

      expect(mockPrismaService.broadcastMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalRecipients: 100,
            sentCount: 90,
            failedCount: 10,
          }),
        }),
      );
    });
  });

  describe('cancel', () => {
    it('should cancel a draft broadcast', async () => {
      mockPrismaService.broadcastMessage.findUnique.mockResolvedValue(
        mockBroadcast,
      );
      mockPrismaService.broadcastMessage.update.mockResolvedValue({
        ...mockBroadcast,
        status: BroadcastStatus.CANCELLED,
      });

      const result = await entity.cancel(mockBroadcastId);

      expect(result.status).toBe(BroadcastStatus.CANCELLED);
    });

    it('should throw error when cancelling a sent broadcast', async () => {
      mockPrismaService.broadcastMessage.findUnique.mockResolvedValue({
        ...mockBroadcast,
        status: BroadcastStatus.SENT,
      });

      await expect(entity.cancel(mockBroadcastId)).rejects.toThrow(
        'Can only cancel draft or scheduled broadcast messages',
      );
    });
  });

  describe('countByTenant', () => {
    it('should count broadcasts by tenant', async () => {
      mockPrismaService.broadcastMessage.count.mockResolvedValue(5);

      const result = await entity.countByTenant(mockTenantId);

      expect(result).toBe(5);
    });
  });

  describe('incrementSentCount', () => {
    it('should increment sent count', async () => {
      mockPrismaService.broadcastMessage.update.mockResolvedValue(
        mockBroadcast,
      );

      await entity.incrementSentCount(mockBroadcastId);

      expect(mockPrismaService.broadcastMessage.update).toHaveBeenCalledWith({
        where: { id: mockBroadcastId },
        data: {
          sentCount: {
            increment: 1,
          },
        },
      });
    });
  });

  describe('incrementFailedCount', () => {
    it('should increment failed count', async () => {
      mockPrismaService.broadcastMessage.update.mockResolvedValue(
        mockBroadcast,
      );

      await entity.incrementFailedCount(mockBroadcastId);

      expect(mockPrismaService.broadcastMessage.update).toHaveBeenCalledWith({
        where: { id: mockBroadcastId },
        data: {
          failedCount: {
            increment: 1,
          },
        },
      });
    });
  });
});
