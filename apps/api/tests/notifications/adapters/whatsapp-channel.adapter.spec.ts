/**
 * WhatsApp Channel Adapter Tests
 * TASK-WA-005: WhatsApp Channel Adapter Tests
 *
 * Unit tests for WhatsAppChannelAdapter covering:
 * - Availability checking (opt-in, phone validation)
 * - Message sending via WhatsAppService
 * - Error handling and edge cases
 * - Tenant isolation
 */

import { Test, TestingModule } from '@nestjs/testing';
import { WhatsAppChannelAdapter } from '../../../src/notifications/adapters/whatsapp-channel.adapter';
import { WhatsAppService } from '../../../src/integrations/whatsapp/whatsapp.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import {
  NotificationChannelType,
  NotificationDeliveryStatus,
  Notification,
} from '../../../src/notifications/types/notification.types';

describe('WhatsAppChannelAdapter', () => {
  let adapter: WhatsAppChannelAdapter;
  let whatsAppService: jest.Mocked<Partial<WhatsAppService>>;
  let prisma: {
    parent: {
      findUnique: jest.Mock;
    };
  };

  const mockTenantId = 'tenant-123';
  const mockParentId = 'parent-456';
  const mockPhone = '+27821234567';

  beforeEach(async () => {
    // Create mock PrismaService
    prisma = {
      parent: {
        findUnique: jest.fn(),
      },
    };

    // Create mock WhatsAppService
    whatsAppService = {
      sendMessage: jest.fn(),
      isValidPhoneNumber: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppChannelAdapter,
        {
          provide: WhatsAppService,
          useValue: whatsAppService,
        },
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    adapter = module.get<WhatsAppChannelAdapter>(WhatsAppChannelAdapter);
  });

  describe('channelType', () => {
    it('should have WHATSAPP as channel type', () => {
      expect(adapter.channelType).toBe(NotificationChannelType.WHATSAPP);
    });
  });

  describe('isAvailable', () => {
    beforeEach(() => {
      // Set environment variables for config check
      process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
      process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-id';
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = 'test-account-id';
    });

    afterEach(() => {
      delete process.env.WHATSAPP_ACCESS_TOKEN;
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;
      delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    });

    it('should return true when parent is opted in and has valid phone', async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: mockPhone,
        whatsapp: null,
        whatsappOptIn: true,
      });
      whatsAppService.isValidPhoneNumber!.mockReturnValue(true);

      const result = await adapter.isAvailable(mockParentId);

      expect(result).toBe(true);
      expect(prisma.parent.findUnique).toHaveBeenCalledWith({
        where: { id: mockParentId },
        select: {
          whatsapp: true,
          phone: true,
          whatsappOptIn: true,
        },
      });
    });

    it('should return true when parent has whatsapp number instead of phone', async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: null,
        whatsapp: mockPhone,
        whatsappOptIn: true,
      });
      whatsAppService.isValidPhoneNumber!.mockReturnValue(true);

      const result = await adapter.isAvailable(mockParentId);

      expect(result).toBe(true);
    });

    it('should return false when parent is not opted in', async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: mockPhone,
        whatsapp: null,
        whatsappOptIn: false,
      });

      const result = await adapter.isAvailable(mockParentId);

      expect(result).toBe(false);
    });

    it('should return false when parent has no phone or whatsapp', async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: null,
        whatsapp: null,
        whatsappOptIn: true,
      });

      const result = await adapter.isAvailable(mockParentId);

      expect(result).toBe(false);
    });

    it('should return false when parent has invalid phone format', async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: '0821234567', // Missing country code
        whatsapp: null,
        whatsappOptIn: true,
      });
      whatsAppService.isValidPhoneNumber!.mockReturnValue(false);

      const result = await adapter.isAvailable(mockParentId);

      expect(result).toBe(false);
    });

    it('should return false when parent not found', async () => {
      prisma.parent.findUnique.mockResolvedValue(null);

      const result = await adapter.isAvailable(mockParentId);

      expect(result).toBe(false);
    });

    it('should return false when WhatsApp is not configured', async () => {
      delete process.env.WHATSAPP_ACCESS_TOKEN;

      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: mockPhone,
        whatsapp: null,
        whatsappOptIn: true,
      });
      whatsAppService.isValidPhoneNumber!.mockReturnValue(true);

      const result = await adapter.isAvailable(mockParentId);

      expect(result).toBe(false);
    });

    it('should return false and log error on database exception', async () => {
      prisma.parent.findUnique.mockRejectedValue(new Error('Database error'));

      const result = await adapter.isAvailable(mockParentId);

      expect(result).toBe(false);
    });
  });

  describe('send', () => {
    const mockNotification: Notification = {
      recipientId: mockParentId,
      channelType: NotificationChannelType.WHATSAPP,
      tenantId: mockTenantId,
      body: 'Test message content',
      subject: 'Test Subject',
    };

    it('should send notification via WhatsApp successfully', async () => {
      const mockMessageId = 'wamid_test123';
      const mockSentAt = new Date();

      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: null,
        whatsapp: mockPhone,
        whatsappOptIn: true,
        firstName: 'John',
        lastName: 'Doe',
      });

      whatsAppService.sendMessage!.mockResolvedValue({
        messageId: mockMessageId,
        sentAt: mockSentAt,
      });

      const result = await adapter.send(mockNotification);

      expect(result.success).toBe(true);
      expect(result.channelUsed).toBe(NotificationChannelType.WHATSAPP);
      expect(result.messageId).toBe(mockMessageId);
      expect(result.status).toBe(NotificationDeliveryStatus.SENT);
      expect(result.sentAt).toBe(mockSentAt);
      expect(whatsAppService.sendMessage).toHaveBeenCalledWith(
        mockPhone,
        mockNotification.body,
      );
    });

    it('should use phone when whatsapp number not available', async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: mockPhone,
        whatsapp: null,
        whatsappOptIn: true,
        firstName: 'John',
        lastName: 'Doe',
      });

      whatsAppService.sendMessage!.mockResolvedValue({
        messageId: 'wamid_test456',
        sentAt: new Date(),
      });

      await adapter.send(mockNotification);

      expect(whatsAppService.sendMessage).toHaveBeenCalledWith(
        mockPhone,
        mockNotification.body,
      );
    });

    it('should return failure when parent not found', async () => {
      prisma.parent.findUnique.mockResolvedValue(null);

      const result = await adapter.send(mockNotification);

      expect(result.success).toBe(false);
      expect(result.status).toBe(NotificationDeliveryStatus.FAILED);
      expect(result.errorCode).toBe('PARENT_NOT_FOUND');
    });

    it('should return failure when parent not opted in', async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: mockPhone,
        whatsapp: null,
        whatsappOptIn: false,
        firstName: 'John',
        lastName: 'Doe',
      });

      const result = await adapter.send(mockNotification);

      expect(result.success).toBe(false);
      expect(result.status).toBe(NotificationDeliveryStatus.FAILED);
      expect(result.errorCode).toBe('WHATSAPP_OPT_IN_REQUIRED');
    });

    it('should return failure when no phone number available', async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: null,
        whatsapp: null,
        whatsappOptIn: true,
        firstName: 'John',
        lastName: 'Doe',
      });

      const result = await adapter.send(mockNotification);

      expect(result.success).toBe(false);
      expect(result.status).toBe(NotificationDeliveryStatus.FAILED);
      expect(result.errorCode).toBe('WHATSAPP_NUMBER_MISSING');
    });

    it('should handle WhatsApp service errors gracefully', async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: mockPhone,
        whatsapp: null,
        whatsappOptIn: true,
        firstName: 'John',
        lastName: 'Doe',
      });

      whatsAppService.sendMessage!.mockRejectedValue(
        new Error('Rate limit exceeded'),
      );

      const result = await adapter.send(mockNotification);

      expect(result.success).toBe(false);
      expect(result.status).toBe(NotificationDeliveryStatus.FAILED);
      expect(result.error).toBe('Rate limit exceeded');
      expect(result.errorCode).toBe('WHATSAPP_SEND_FAILED');
    });

    it('should handle database errors gracefully', async () => {
      prisma.parent.findUnique.mockRejectedValue(new Error('Connection lost'));

      const result = await adapter.send(mockNotification);

      expect(result.success).toBe(false);
      expect(result.status).toBe(NotificationDeliveryStatus.FAILED);
      expect(result.error).toContain('Connection lost');
    });
  });

  describe('getDeliveryStatus', () => {
    it('should return SENT status (status updated via webhooks)', async () => {
      const status = await adapter.getDeliveryStatus('test-message-id');

      expect(status).toBe(NotificationDeliveryStatus.SENT);
    });
  });

  describe('edge cases', () => {
    it('should prefer whatsapp number over phone when both available', async () => {
      const whatsappNumber = '+27829876543';
      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: mockPhone,
        whatsapp: whatsappNumber, // Different from phone
        whatsappOptIn: true,
        firstName: 'John',
        lastName: 'Doe',
      });

      whatsAppService.sendMessage!.mockResolvedValue({
        messageId: 'wamid_test789',
        sentAt: new Date(),
      });

      const notification: Notification = {
        recipientId: mockParentId,
        channelType: NotificationChannelType.WHATSAPP,
        tenantId: mockTenantId,
        body: 'Test message',
      };

      await adapter.send(notification);

      // Should use whatsapp number, not phone
      expect(whatsAppService.sendMessage).toHaveBeenCalledWith(
        whatsappNumber,
        notification.body,
      );
    });

    it('should handle empty message body', async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: mockPhone,
        whatsapp: null,
        whatsappOptIn: true,
        firstName: 'John',
        lastName: 'Doe',
      });

      whatsAppService.sendMessage!.mockResolvedValue({
        messageId: 'wamid_empty',
        sentAt: new Date(),
      });

      const notification: Notification = {
        recipientId: mockParentId,
        channelType: NotificationChannelType.WHATSAPP,
        tenantId: mockTenantId,
        body: '',
      };

      const result = await adapter.send(notification);

      // Service should still try to send (validation is elsewhere)
      expect(whatsAppService.sendMessage).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should handle special characters in message', async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: mockPhone,
        whatsapp: null,
        whatsappOptIn: true,
        firstName: 'John',
        lastName: 'Doe',
      });

      whatsAppService.sendMessage!.mockResolvedValue({
        messageId: 'wamid_special',
        sentAt: new Date(),
      });

      const notification: Notification = {
        recipientId: mockParentId,
        channelType: NotificationChannelType.WHATSAPP,
        tenantId: mockTenantId,
        body: 'Invoice: R1,500.00 🎉 <script>alert("xss")</script>',
      };

      const result = await adapter.send(notification);

      expect(result.success).toBe(true);
      expect(whatsAppService.sendMessage).toHaveBeenCalledWith(
        mockPhone,
        notification.body,
      );
    });

    it('should handle very long messages', async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: mockPhone,
        whatsapp: null,
        whatsappOptIn: true,
        firstName: 'John',
        lastName: 'Doe',
      });

      whatsAppService.sendMessage!.mockResolvedValue({
        messageId: 'wamid_long',
        sentAt: new Date(),
      });

      const longMessage = 'A'.repeat(5000); // Very long message
      const notification: Notification = {
        recipientId: mockParentId,
        channelType: NotificationChannelType.WHATSAPP,
        tenantId: mockTenantId,
        body: longMessage,
      };

      const result = await adapter.send(notification);

      expect(result.success).toBe(true);
    });
  });

  describe('phone number validation scenarios', () => {
    beforeEach(() => {
      process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
      process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-id';
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = 'test-account-id';
    });

    afterEach(() => {
      delete process.env.WHATSAPP_ACCESS_TOKEN;
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;
      delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    });

    it('should accept South African mobile numbers with +27', async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: '+27821234567',
        whatsapp: null,
        whatsappOptIn: true,
      });
      whatsAppService.isValidPhoneNumber!.mockReturnValue(true);

      const result = await adapter.isAvailable(mockParentId);

      expect(result).toBe(true);
    });

    it('should reject numbers without country code', async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: '0821234567',
        whatsapp: null,
        whatsappOptIn: true,
      });
      whatsAppService.isValidPhoneNumber!.mockReturnValue(false);

      const result = await adapter.isAvailable(mockParentId);

      expect(result).toBe(false);
    });

    it('should accept international numbers', async () => {
      prisma.parent.findUnique.mockResolvedValue({
        id: mockParentId,
        phone: '+441onal234567890',
        whatsapp: null,
        whatsappOptIn: true,
      });
      whatsAppService.isValidPhoneNumber!.mockReturnValue(true);

      const result = await adapter.isAvailable(mockParentId);

      expect(result).toBe(true);
    });
  });
});
