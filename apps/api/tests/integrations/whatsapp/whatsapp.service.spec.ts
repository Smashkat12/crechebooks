/**
 * WhatsAppService Unit Tests
 * TASK-WA-005: WhatsApp Channel Adapter Tests
 *
 * Tests for the main WhatsApp Business API integration service.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { WhatsAppService } from '../../../src/integrations/whatsapp/whatsapp.service';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { WhatsAppMessageEntity } from '../../../src/integrations/whatsapp/entities/whatsapp-message.entity';
import {
  WhatsAppContextType,
  WhatsAppMessageStatus,
} from '../../../src/integrations/whatsapp/types/message-history.types';
import { BusinessException } from '../../../src/shared/exceptions';

// Mock the fetch function
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('WhatsAppService', () => {
  let service: WhatsAppService;
  let prismaService: jest.Mocked<PrismaService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let messageEntity: jest.Mocked<WhatsAppMessageEntity>;

  // Store original env vars
  const originalEnv = process.env;

  beforeAll(() => {
    // Set up WhatsApp environment variables for tests
    process.env = {
      ...originalEnv,
      WHATSAPP_ACCESS_TOKEN: 'test-access-token',
      WHATSAPP_PHONE_NUMBER_ID: 'test-phone-number-id',
      WHATSAPP_BUSINESS_ACCOUNT_ID: 'test-business-account-id',
      WHATSAPP_WEBHOOK_VERIFY_TOKEN: 'test-verify-token',
      WHATSAPP_APP_SECRET: 'test-app-secret',
    };
  });

  afterAll(() => {
    // Restore original env vars
    process.env = originalEnv;
  });

  beforeEach(async () => {
    // Reset mocks
    mockFetch.mockReset();

    // Create mock services
    const mockPrismaService = {
      parent: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      invoice: {
        findUnique: jest.fn(),
      },
    };

    const mockAuditLogService = {
      logAction: jest.fn(),
    };

    const mockMessageEntity = {
      create: jest.fn(),
      updateStatus: jest.fn(),
      findByTenantAndParent: jest.fn(),
      getHistorySummary: jest.fn(),
      findByContext: jest.fn(),
      markAsSent: jest.fn(),
      markAsFailed: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AuditLogService, useValue: mockAuditLogService },
        { provide: WhatsAppMessageEntity, useValue: mockMessageEntity },
      ],
    }).compile();

    service = module.get<WhatsAppService>(WhatsAppService);
    prismaService = module.get(PrismaService);
    auditLogService = module.get(AuditLogService);
    messageEntity = module.get(WhatsAppMessageEntity);
  });

  describe('formatPhoneE164', () => {
    it('should convert SA mobile number (0XX) to E.164 format', () => {
      expect(service.formatPhoneE164('0821234567')).toBe('+27821234567');
    });

    it('should handle number already in E.164 format', () => {
      expect(service.formatPhoneE164('+27821234567')).toBe('+27821234567');
    });

    it('should handle number with country code but no +', () => {
      expect(service.formatPhoneE164('27821234567')).toBe('+27821234567');
    });

    it('should handle 9-digit number without leading 0', () => {
      expect(service.formatPhoneE164('821234567')).toBe('+27821234567');
    });

    it('should remove non-digit characters', () => {
      expect(service.formatPhoneE164('082-123-4567')).toBe('+27821234567');
      expect(service.formatPhoneE164('(082) 123 4567')).toBe('+27821234567');
    });

    it('should return empty string for invalid input', () => {
      expect(service.formatPhoneE164('')).toBe('');
      expect(service.formatPhoneE164(null as unknown as string)).toBe('');
      expect(service.formatPhoneE164(undefined as unknown as string)).toBe('');
    });
  });

  describe('isValidPhoneNumber', () => {
    it('should return true for valid SA mobile numbers', () => {
      expect(service.isValidPhoneNumber('0821234567')).toBe(true);
      expect(service.isValidPhoneNumber('+27821234567')).toBe(true);
      expect(service.isValidPhoneNumber('27821234567')).toBe(true);
    });

    it('should return false for invalid numbers', () => {
      expect(service.isValidPhoneNumber('')).toBe(false);
      expect(service.isValidPhoneNumber('123')).toBe(false);
      expect(service.isValidPhoneNumber('invalid')).toBe(false);
    });
  });

  describe('sendInvoice', () => {
    const mockParent = {
      id: 'parent-123',
      firstName: 'John',
      lastName: 'Doe',
      phone: '+27821234567',
      whatsapp: null,
      whatsappOptIn: true,
      tenantId: 'tenant-123',
    };

    const mockInvoice = {
      id: 'invoice-123',
      invoiceNumber: 'INV-001',
      totalCents: 150000,
      dueDate: new Date('2026-01-31'),
      pdfUrl: 'https://example.com/invoice.pdf',
    };

    it('should send invoice notification to parent', async () => {
      (prismaService.parent.findUnique as jest.Mock).mockResolvedValue(
        mockParent,
      );
      (prismaService.invoice.findUnique as jest.Mock).mockResolvedValue(
        mockInvoice,
      );
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            messaging_product: 'whatsapp',
            contacts: [{ input: '+27821234567', wa_id: '27821234567' }],
            messages: [{ id: 'wamid.test123' }],
          }),
      });

      const result = await service.sendInvoice('parent-123', 'invoice-123');

      expect(result.messageId).toBe('wamid.test123');
      expect(result.status).toBe('sent');
      expect(result.recipientPhone).toBe('+27821234567');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(auditLogService.logAction).toHaveBeenCalled();
    });

    it('should throw if parent not found', async () => {
      (prismaService.parent.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.sendInvoice('nonexistent', 'invoice-123'),
      ).rejects.toThrow(BusinessException);
    });

    it('should throw if parent has not opted in', async () => {
      (prismaService.parent.findUnique as jest.Mock).mockResolvedValue({
        ...mockParent,
        whatsappOptIn: false,
      });

      await expect(
        service.sendInvoice('parent-123', 'invoice-123'),
      ).rejects.toThrow('Parent has not opted in to WhatsApp messages');
    });

    it('should throw if parent has no phone number', async () => {
      (prismaService.parent.findUnique as jest.Mock).mockResolvedValue({
        ...mockParent,
        phone: null,
        whatsapp: null,
      });

      await expect(
        service.sendInvoice('parent-123', 'invoice-123'),
      ).rejects.toThrow('Parent phone number not available');
    });

    it('should throw if invoice not found', async () => {
      (prismaService.parent.findUnique as jest.Mock).mockResolvedValue(
        mockParent,
      );
      (prismaService.invoice.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(
        service.sendInvoice('parent-123', 'nonexistent'),
      ).rejects.toThrow(BusinessException);
    });
  });

  describe('sendTemplate (TASK-WA-003)', () => {
    it('should send template message with components', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            messaging_product: 'whatsapp',
            contacts: [{ input: '+27821234567', wa_id: '27821234567' }],
            messages: [{ id: 'wamid.template123' }],
          }),
      });

      const components = [
        {
          type: 'body' as const,
          parameters: [
            { type: 'text' as const, text: 'John' },
            { type: 'text' as const, text: '01 Jan 2026' },
          ],
        },
      ];

      const result = await service.sendTemplate(
        '+27821234567',
        'statement_notification',
        components,
      );

      expect(result.messageId).toBe('wamid.template123');
      expect(result.status).toBe('sent');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('graph.facebook.com'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should throw for invalid phone number', async () => {
      await expect(
        service.sendTemplate('invalid', 'statement_notification', []),
      ).rejects.toThrow('Invalid phone number');
    });
  });

  describe('optOut', () => {
    it('should opt out all parents with matching phone number', async () => {
      (prismaService.parent.updateMany as jest.Mock).mockResolvedValue({
        count: 2,
      });

      await service.optOut('+27821234567');

      expect(prismaService.parent.updateMany).toHaveBeenCalledWith({
        where: {
          OR: [{ phone: '+27821234567' }, { whatsapp: '+27821234567' }],
        },
        data: {
          whatsappOptIn: false,
          updatedAt: expect.any(Date),
        },
      });
    });
  });

  describe('optIn', () => {
    it('should opt in a parent', async () => {
      (prismaService.parent.update as jest.Mock).mockResolvedValue({
        id: 'parent-123',
        whatsappOptIn: true,
      });

      await service.optIn('parent-123');

      expect(prismaService.parent.update).toHaveBeenCalledWith({
        where: { id: 'parent-123' },
        data: {
          whatsappOptIn: true,
          updatedAt: expect.any(Date),
        },
      });
    });
  });

  describe('checkOptIn', () => {
    it('should return true if parent is opted in', async () => {
      (prismaService.parent.findFirst as jest.Mock).mockResolvedValue({
        id: 'parent-123',
      });

      const result = await service.checkOptIn('+27821234567');

      expect(result).toBe(true);
    });

    it('should return false if parent is not opted in', async () => {
      (prismaService.parent.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.checkOptIn('+27821234567');

      expect(result).toBe(false);
    });
  });

  describe('getMessageHistory (TASK-WA-001)', () => {
    it('should return message history for a parent', async () => {
      const mockMessages = [
        {
          id: 'msg-1',
          templateName: 'invoice_notification',
          status: WhatsAppMessageStatus.DELIVERED,
        },
        {
          id: 'msg-2',
          templateName: 'statement_notification',
          status: WhatsAppMessageStatus.READ,
        },
      ];
      (messageEntity.findByTenantAndParent as jest.Mock).mockResolvedValue(
        mockMessages,
      );

      const result = await service.getMessageHistory(
        'tenant-123',
        'parent-123',
        10,
      );

      expect(result).toEqual(mockMessages);
      expect(messageEntity.findByTenantAndParent).toHaveBeenCalledWith(
        'tenant-123',
        'parent-123',
        { limit: 10 },
      );
    });

    it('should return empty array if entity is not available', async () => {
      // Create service without message entity
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WhatsAppService,
          { provide: PrismaService, useValue: prismaService },
          { provide: AuditLogService, useValue: auditLogService },
          // No WhatsAppMessageEntity provided
        ],
      }).compile();

      const serviceWithoutEntity = module.get<WhatsAppService>(WhatsAppService);
      const result = await serviceWithoutEntity.getMessageHistory(
        'tenant-123',
        'parent-123',
      );

      expect(result).toEqual([]);
    });
  });

  describe('getMessageHistorySummary (TASK-WA-001)', () => {
    it('should return summary statistics', async () => {
      const mockSummary = {
        total: 100,
        pending: 5,
        sent: 10,
        delivered: 50,
        read: 30,
        failed: 5,
        deliveryRate: 83.33,
        readRate: 60,
      };
      messageEntity.getHistorySummary.mockResolvedValue(mockSummary);

      const result = await service.getMessageHistorySummary('tenant-123');

      expect(result).toEqual(mockSummary);
    });
  });

  describe('getMessagesByContext (TASK-WA-001)', () => {
    it('should return messages by context', async () => {
      const mockMessages = [
        { id: 'msg-1', contextType: WhatsAppContextType.STATEMENT },
      ];
      (messageEntity.findByContext as jest.Mock).mockResolvedValue(
        mockMessages,
      );

      const result = await service.getMessagesByContext(
        'tenant-123',
        WhatsAppContextType.STATEMENT,
        'stmt-123',
      );

      expect(result).toEqual(mockMessages);
      expect(messageEntity.findByContext).toHaveBeenCalledWith(
        'tenant-123',
        WhatsAppContextType.STATEMENT,
        'stmt-123',
      );
    });
  });

  describe('handleWebhook', () => {
    const validPayload = {
      object: 'whatsapp_business_account' as const,
      entry: [
        {
          id: 'entry-123',
          changes: [
            {
              field: 'messages',
              value: {
                messaging_product: 'whatsapp' as const,
                metadata: {
                  display_phone_number: '+1234567890',
                  phone_number_id: 'phone-123',
                },
                statuses: [
                  {
                    id: 'wamid.test123',
                    status: 'delivered' as const,
                    timestamp: '1234567890',
                    recipient_id: '+27821234567',
                  },
                ],
              },
            },
          ],
        },
      ],
    };

    it('should process status updates from webhook', async () => {
      await service.handleWebhook(validPayload);

      expect(messageEntity.updateStatus).toHaveBeenCalledWith({
        wamid: 'wamid.test123',
        status: WhatsAppMessageStatus.DELIVERED,
        timestamp: expect.any(Date),
        errorCode: undefined,
        errorMessage: undefined,
      });
      expect(auditLogService.logAction).toHaveBeenCalled();
    });

    it('should handle opt-out messages', async () => {
      const optOutPayload = {
        object: 'whatsapp_business_account' as const,
        entry: [
          {
            id: 'entry-123',
            changes: [
              {
                field: 'messages',
                value: {
                  messaging_product: 'whatsapp' as const,
                  metadata: {
                    display_phone_number: '+1234567890',
                    phone_number_id: 'phone-123',
                  },
                  messages: [
                    {
                      from: '+27821234567',
                      id: 'wamid.msg123',
                      timestamp: '1234567890',
                      type: 'text',
                      text: { body: 'STOP' },
                    },
                  ],
                },
              },
            ],
          },
        ],
      };

      (prismaService.parent.updateMany as jest.Mock).mockResolvedValue({
        count: 1,
      });

      await service.handleWebhook(optOutPayload);

      expect(prismaService.parent.updateMany).toHaveBeenCalled();
    });
  });

  describe('API error handling', () => {
    it('should handle API errors gracefully', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            error: {
              message: 'Template not approved',
              type: 'OAuthException',
              code: 100,
              fbtrace_id: 'trace-123',
            },
          }),
      });

      await expect(
        service.sendTemplate('+27821234567', 'statement_notification', []),
      ).rejects.toThrow('WhatsApp API error: Template not approved');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      await expect(
        service.sendTemplate('+27821234567', 'statement_notification', []),
      ).rejects.toThrow('Failed to send WhatsApp message');
    });
  });
});
