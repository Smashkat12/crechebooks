/**
 * Notification Service Tests
 * TASK-INFRA-012: Multi-Channel Notification Service Enhancement
 *
 * Tests unified notification service with multi-channel delivery and fallback.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../database/prisma/prisma.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { EmailService } from '../../integrations/email/email.service';
import { WhatsAppService } from '../../integrations/whatsapp/whatsapp.service';
import { NotificationService } from '../notification.service';
import { EmailChannelAdapter } from '../adapters/email-channel.adapter';
import { WhatsAppChannelAdapter } from '../adapters/whatsapp-channel.adapter';
import { SmsChannelAdapter } from '../adapters/sms-channel.adapter';
import { NotificationPreferenceService } from '../notification-preference.service';
import { SMS_GATEWAY_TOKEN } from '../interfaces/sms-gateway.interface';
import {
  NotificationChannelType,
  NotificationDeliveryStatus,
  NotificationPayload,
} from '../types/notification.types';
import { PreferredContact } from '@prisma/client';
import { BusinessException } from '../../shared/exceptions';

describe('NotificationService', () => {
  let service: NotificationService;
  let prisma: PrismaService;
  let emailService: EmailService;
  let whatsAppService: WhatsAppService;
  let auditLogService: AuditLogService;

  const mockTenantId = 'tenant-1';
  const mockParentId = 'parent-1';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        NotificationPreferenceService,
        EmailChannelAdapter,
        WhatsAppChannelAdapter,
        SmsChannelAdapter,
        {
          provide: PrismaService,
          useValue: {
            parent: {
              findUnique: jest.fn(),
              update: jest.fn(),
            },
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendEmail: jest.fn(),
            isValidEmail: jest.fn(),
          },
        },
        {
          provide: WhatsAppService,
          useValue: {
            sendMessage: jest.fn(),
            isValidPhoneNumber: jest.fn(),
          },
        },
        {
          provide: AuditLogService,
          useValue: {
            logAction: jest.fn(),
          },
        },
        {
          provide: SMS_GATEWAY_TOKEN,
          useValue: {
            send: jest.fn().mockResolvedValue({
              messageId: 'sms-123',
              status: 'sent',
            }),
            isConfigured: jest.fn().mockReturnValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
    prisma = module.get<PrismaService>(PrismaService);
    emailService = module.get<EmailService>(EmailService);
    whatsAppService = module.get<WhatsAppService>(WhatsAppService);
    auditLogService = module.get<AuditLogService>(AuditLogService);
  });

  describe('send', () => {
    it('should send notification via preferred channel (EMAIL)', async () => {
      // Mock parent with EMAIL preference
      (prisma.parent.findUnique as jest.Mock).mockResolvedValue({
        id: mockParentId,
        email: 'parent@example.com',
        phone: '+27123456789',
        whatsapp: null,
        preferredContact: PreferredContact.EMAIL,
        whatsappOptIn: false,
        firstName: 'John',
        lastName: 'Doe',
      });

      (emailService.isValidEmail as jest.Mock).mockReturnValue(true);
      (emailService.sendEmail as jest.Mock).mockResolvedValue({
        messageId: 'email-123',
        status: 'sent',
      });

      const notification: NotificationPayload = {
        recipientId: mockParentId,
        subject: 'Test Notification',
        body: 'This is a test notification',
      };

      const result = await service.send(mockTenantId, notification);

      expect(result.success).toBe(true);
      expect(result.channelUsed).toBe(NotificationChannelType.EMAIL);
      expect(result.messageId).toBe('email-123');
      expect(emailService.sendEmail).toHaveBeenCalledWith(
        'parent@example.com',
        'Test Notification',
        'This is a test notification',
      );
    });

    it('should send notification via preferred channel (WHATSAPP)', async () => {
      // Mock parent with WHATSAPP preference
      (prisma.parent.findUnique as jest.Mock).mockResolvedValue({
        id: mockParentId,
        email: 'parent@example.com',
        phone: null,
        whatsapp: '+27123456789',
        preferredContact: PreferredContact.WHATSAPP,
        whatsappOptIn: true,
        firstName: 'John',
        lastName: 'Doe',
      });

      (whatsAppService.isValidPhoneNumber as jest.Mock).mockReturnValue(true);
      (whatsAppService.sendMessage as jest.Mock).mockResolvedValue({
        messageId: 'whatsapp-123',
        status: 'sent',
        sentAt: new Date(),
        recipientPhone: '+27123456789',
      });

      // Mock WhatsApp API configured
      process.env.WHATSAPP_ACCESS_TOKEN = 'test-token';
      process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-id';
      process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = 'test-account';

      const notification: NotificationPayload = {
        recipientId: mockParentId,
        body: 'This is a WhatsApp test',
      };

      const result = await service.send(mockTenantId, notification);

      expect(result.success).toBe(true);
      expect(result.channelUsed).toBe(NotificationChannelType.WHATSAPP);
      expect(result.messageId).toBe('whatsapp-123');
    });

    it('should throw error if all preferred channels fail', async () => {
      // Mock parent with EMAIL preference but no email
      (prisma.parent.findUnique as jest.Mock).mockResolvedValue({
        id: mockParentId,
        email: null, // No email available
        phone: null,
        whatsapp: null,
        preferredContact: PreferredContact.EMAIL,
        whatsappOptIn: false,
      });

      const notification: NotificationPayload = {
        recipientId: mockParentId,
        subject: 'Test',
        body: 'Test',
      };

      await expect(service.send(mockTenantId, notification)).rejects.toThrow(
        BusinessException,
      );
    });
  });

  describe('sendWithFallback', () => {
    it('should fallback to EMAIL when WHATSAPP fails', async () => {
      // Mock parent with WHATSAPP preference
      (prisma.parent.findUnique as jest.Mock).mockResolvedValue({
        id: mockParentId,
        email: 'parent@example.com',
        phone: '+27123456789',
        whatsapp: '+27123456789',
        preferredContact: PreferredContact.WHATSAPP,
        whatsappOptIn: true,
        firstName: 'John',
        lastName: 'Doe',
      });

      // WhatsApp not configured (will fail availability check)
      delete process.env.WHATSAPP_ACCESS_TOKEN;
      delete process.env.WHATSAPP_PHONE_NUMBER_ID;
      delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;

      (emailService.isValidEmail as jest.Mock).mockReturnValue(true);
      (emailService.sendEmail as jest.Mock).mockResolvedValue({
        messageId: 'email-fallback-123',
        status: 'sent',
      });

      const notification: NotificationPayload = {
        recipientId: mockParentId,
        subject: 'Fallback Test',
        body: 'Testing fallback',
      };

      const result = await service.sendWithFallback(mockTenantId, notification);

      expect(result.success).toBe(true);
      expect(result.channelUsed).toBe(NotificationChannelType.EMAIL);
      expect(result.attemptedChannels).toContain(NotificationChannelType.EMAIL);
    });

    it('should throw error if all fallback channels fail', async () => {
      // Mock parent with no valid channels
      (prisma.parent.findUnique as jest.Mock).mockResolvedValue({
        id: mockParentId,
        email: null,
        phone: null,
        whatsapp: null,
        preferredContact: PreferredContact.BOTH,
        whatsappOptIn: false,
      });

      const notification: NotificationPayload = {
        recipientId: mockParentId,
        subject: 'Test',
        body: 'Test',
      };

      await expect(
        service.sendWithFallback(mockTenantId, notification),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('getPreferences', () => {
    it('should return notification preferences for parent', async () => {
      (prisma.parent.findUnique as jest.Mock).mockResolvedValue({
        id: mockParentId,
        email: 'parent@example.com',
        phone: '+27123456789',
        whatsapp: '+27123456789',
        preferredContact: PreferredContact.BOTH,
        whatsappOptIn: true,
      });

      const prefs = await service.getPreferences(mockParentId);

      expect(prefs.parentId).toBe(mockParentId);
      expect(prefs.preferredChannels).toContain(NotificationChannelType.EMAIL);
      expect(prefs.preferredChannels).toContain(
        NotificationChannelType.WHATSAPP,
      );
      expect(prefs.emailEnabled).toBe(true);
      expect(prefs.whatsappEnabled).toBe(true);
      expect(prefs.whatsappOptIn).toBe(true);
    });
  });

  describe('updatePreferences', () => {
    it('should update notification preferences', async () => {
      (prisma.parent.findUnique as jest.Mock).mockResolvedValue({
        id: mockParentId,
      });

      (prisma.parent.update as jest.Mock).mockResolvedValue({
        id: mockParentId,
      });

      await service.updatePreferences(mockParentId, {
        preferredChannels: [NotificationChannelType.EMAIL],
        whatsappOptIn: false,
      });

      expect(prisma.parent.update).toHaveBeenCalledWith({
        where: { id: mockParentId },
        data: expect.objectContaining({
          preferredContact: PreferredContact.EMAIL,
          whatsappOptIn: false,
        }),
      });
    });
  });
});
