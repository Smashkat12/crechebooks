/**
 * MessageRecipientEntity Tests
 * TASK-COMM-001: Ad-hoc Communication Database Schema
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { MessageRecipientEntity } from '../../../src/communications/entities/message-recipient.entity';
import {
  DeliveryStatus,
  RecipientType,
} from '../../../src/communications/types/communication.types';

describe('MessageRecipientEntity', () => {
  let entity: MessageRecipientEntity;
  let _prismaService: PrismaService;

  const mockBroadcastId = '123e4567-e89b-12d3-a456-426614174000';
  const mockRecipientId = '123e4567-e89b-12d3-a456-426614174001';
  const mockMessageId = '123e4567-e89b-12d3-a456-426614174002';

  const mockRecipient = {
    id: mockMessageId,
    broadcastId: mockBroadcastId,
    recipientId: mockRecipientId,
    recipientType: RecipientType.PARENT,
    recipientName: 'John Doe',
    recipientEmail: 'john@example.com',
    recipientPhone: '+27821234567',
    emailStatus: DeliveryStatus.PENDING,
    emailSentAt: null,
    emailMessageId: null,
    whatsappStatus: DeliveryStatus.PENDING,
    whatsappSentAt: null,
    whatsappWamid: null,
    smsStatus: DeliveryStatus.PENDING,
    smsSentAt: null,
    smsMessageId: null,
    lastError: null,
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    messageRecipient: {
      createMany: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageRecipientEntity,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    entity = module.get<MessageRecipientEntity>(MessageRecipientEntity);
    _prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  describe('createMany', () => {
    it('should create multiple recipients', async () => {
      mockPrismaService.messageRecipient.createMany.mockResolvedValue({
        count: 3,
      });

      const recipients = [
        {
          broadcastId: mockBroadcastId,
          recipientId: '1',
          recipientType: RecipientType.PARENT,
          recipientName: 'Parent 1',
          recipientEmail: 'parent1@example.com',
        },
        {
          broadcastId: mockBroadcastId,
          recipientId: '2',
          recipientType: RecipientType.PARENT,
          recipientName: 'Parent 2',
          recipientEmail: 'parent2@example.com',
        },
        {
          broadcastId: mockBroadcastId,
          recipientId: '3',
          recipientType: RecipientType.PARENT,
          recipientName: 'Parent 3',
          recipientPhone: '+27821234567',
        },
      ];

      const result = await entity.createMany(recipients);

      expect(result.count).toBe(3);
      expect(
        mockPrismaService.messageRecipient.createMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          skipDuplicates: true,
        }),
      );
    });
  });

  describe('findById', () => {
    it('should find recipient by ID', async () => {
      mockPrismaService.messageRecipient.findUnique.mockResolvedValue(
        mockRecipient,
      );

      const result = await entity.findById(mockMessageId);

      expect(result).toEqual(mockRecipient);
    });
  });

  describe('findByBroadcast', () => {
    it('should find all recipients for a broadcast', async () => {
      const recipients = [mockRecipient];
      mockPrismaService.messageRecipient.findMany.mockResolvedValue(recipients);

      const result = await entity.findByBroadcast(mockBroadcastId);

      expect(result).toEqual(recipients);
      expect(mockPrismaService.messageRecipient.findMany).toHaveBeenCalledWith({
        where: { broadcastId: mockBroadcastId },
        orderBy: { recipientName: 'asc' },
      });
    });
  });

  describe('findByBroadcastAndRecipient', () => {
    it('should find recipient by composite key', async () => {
      mockPrismaService.messageRecipient.findUnique.mockResolvedValue(
        mockRecipient,
      );

      const result = await entity.findByBroadcastAndRecipient(
        mockBroadcastId,
        mockRecipientId,
      );

      expect(result).toEqual(mockRecipient);
      expect(
        mockPrismaService.messageRecipient.findUnique,
      ).toHaveBeenCalledWith({
        where: {
          broadcastId_recipientId: {
            broadcastId: mockBroadcastId,
            recipientId: mockRecipientId,
          },
        },
      });
    });
  });

  describe('updateEmailStatus', () => {
    it('should update email status to sent', async () => {
      const updatedRecipient = {
        ...mockRecipient,
        emailStatus: DeliveryStatus.SENT,
        emailMessageId: 'msg-123',
        emailSentAt: new Date(),
      };
      mockPrismaService.messageRecipient.update.mockResolvedValue(
        updatedRecipient,
      );

      const result = await entity.updateEmailStatus(
        mockBroadcastId,
        mockRecipientId,
        DeliveryStatus.SENT,
        'msg-123',
      );

      expect(result.emailStatus).toBe(DeliveryStatus.SENT);
      expect(mockPrismaService.messageRecipient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            emailStatus: DeliveryStatus.SENT,
            emailMessageId: 'msg-123',
            emailSentAt: expect.any(Date),
          }),
        }),
      );
    });

    it('should update email status to failed with error', async () => {
      mockPrismaService.messageRecipient.update.mockResolvedValue({
        ...mockRecipient,
        emailStatus: DeliveryStatus.FAILED,
        lastError: 'Invalid email address',
      });

      await entity.updateEmailStatus(
        mockBroadcastId,
        mockRecipientId,
        DeliveryStatus.FAILED,
        undefined,
        'Invalid email address',
      );

      expect(mockPrismaService.messageRecipient.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            emailStatus: DeliveryStatus.FAILED,
            lastError: 'Invalid email address',
          }),
        }),
      );
    });
  });

  describe('updateWhatsAppStatus', () => {
    it('should update WhatsApp status to delivered', async () => {
      const updatedRecipient = {
        ...mockRecipient,
        whatsappStatus: DeliveryStatus.DELIVERED,
        whatsappWamid: 'wamid-123',
      };
      mockPrismaService.messageRecipient.update.mockResolvedValue(
        updatedRecipient,
      );

      const result = await entity.updateWhatsAppStatus(
        mockBroadcastId,
        mockRecipientId,
        DeliveryStatus.DELIVERED,
        'wamid-123',
      );

      expect(result.whatsappStatus).toBe(DeliveryStatus.DELIVERED);
    });
  });

  describe('updateSmsStatus', () => {
    it('should update SMS status', async () => {
      const updatedRecipient = {
        ...mockRecipient,
        smsStatus: DeliveryStatus.SENT,
        smsMessageId: 'sms-123',
      };
      mockPrismaService.messageRecipient.update.mockResolvedValue(
        updatedRecipient,
      );

      const result = await entity.updateSmsStatus(
        mockBroadcastId,
        mockRecipientId,
        DeliveryStatus.SENT,
        'sms-123',
      );

      expect(result.smsStatus).toBe(DeliveryStatus.SENT);
    });
  });

  describe('getDeliveryStats', () => {
    it('should calculate delivery statistics', async () => {
      const recipients = [
        {
          emailStatus: DeliveryStatus.DELIVERED,
          whatsappStatus: DeliveryStatus.READ,
          smsStatus: DeliveryStatus.DELIVERED,
        },
        {
          emailStatus: DeliveryStatus.SENT,
          whatsappStatus: DeliveryStatus.DELIVERED,
          smsStatus: DeliveryStatus.SENT,
        },
        {
          emailStatus: DeliveryStatus.FAILED,
          whatsappStatus: DeliveryStatus.FAILED,
          smsStatus: null,
        },
      ];
      mockPrismaService.messageRecipient.findMany.mockResolvedValue(recipients);

      const stats = await entity.getDeliveryStats(mockBroadcastId);

      expect(stats.total).toBe(3);
      expect(stats.emailSent).toBe(2);
      expect(stats.emailDelivered).toBe(1);
      expect(stats.emailFailed).toBe(1);
      expect(stats.whatsappSent).toBe(2);
      // whatsappDelivered = 2: one from READ (which implies delivered), one from DELIVERED
      expect(stats.whatsappDelivered).toBe(2);
      expect(stats.whatsappRead).toBe(1);
      expect(stats.whatsappFailed).toBe(1);
      expect(stats.smsSent).toBe(2);
      expect(stats.smsDelivered).toBe(1);
    });
  });

  describe('getFailedRecipients', () => {
    it('should get failed recipients for retry', async () => {
      const failedRecipients = [
        { ...mockRecipient, emailStatus: DeliveryStatus.FAILED, retryCount: 1 },
      ];
      mockPrismaService.messageRecipient.findMany.mockResolvedValue(
        failedRecipients,
      );

      const result = await entity.getFailedRecipients(mockBroadcastId, 3);

      expect(result).toEqual(failedRecipients);
      expect(mockPrismaService.messageRecipient.findMany).toHaveBeenCalledWith({
        where: {
          broadcastId: mockBroadcastId,
          retryCount: { lt: 3 },
          OR: [
            { emailStatus: DeliveryStatus.FAILED },
            { whatsappStatus: DeliveryStatus.FAILED },
            { smsStatus: DeliveryStatus.FAILED },
          ],
        },
      });
    });
  });

  describe('getPendingRecipients', () => {
    it('should get pending recipients', async () => {
      const pendingRecipients = [mockRecipient];
      mockPrismaService.messageRecipient.findMany.mockResolvedValue(
        pendingRecipients,
      );

      const result = await entity.getPendingRecipients(mockBroadcastId);

      expect(result).toEqual(pendingRecipients);
    });
  });

  describe('countByBroadcast', () => {
    it('should count recipients by broadcast', async () => {
      mockPrismaService.messageRecipient.count.mockResolvedValue(50);

      const result = await entity.countByBroadcast(mockBroadcastId);

      expect(result).toBe(50);
    });
  });

  describe('deleteByBroadcast', () => {
    it('should delete all recipients for a broadcast', async () => {
      mockPrismaService.messageRecipient.deleteMany.mockResolvedValue({
        count: 10,
      });

      const result = await entity.deleteByBroadcast(mockBroadcastId);

      expect(result.count).toBe(10);
    });
  });

  describe('markFailed', () => {
    it('should mark recipient as failed', async () => {
      mockPrismaService.messageRecipient.findUnique.mockResolvedValue(
        mockRecipient,
      );
      mockPrismaService.messageRecipient.update.mockResolvedValue({
        ...mockRecipient,
        emailStatus: DeliveryStatus.FAILED,
        whatsappStatus: DeliveryStatus.FAILED,
        smsStatus: DeliveryStatus.FAILED,
        lastError: 'Connection timeout',
        retryCount: 1,
      });

      const result = await entity.markFailed(
        mockMessageId,
        'Connection timeout',
      );

      expect(result.lastError).toBe('Connection timeout');
      expect(result.retryCount).toBe(1);
    });
  });
});
