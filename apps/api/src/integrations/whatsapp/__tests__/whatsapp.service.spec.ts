/**
 * WhatsApp Service Tests
 * TASK-BILL-015: WhatsApp Business API Integration
 */

// Set environment variables before any imports
process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token';
process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-number-id';
process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = 'test-business-account-id';
process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'test-webhook-verify-token';
process.env.WHATSAPP_APP_SECRET = 'test-app-secret';

import { Test, TestingModule } from '@nestjs/testing';
import { WhatsAppService } from '../whatsapp.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AuditLogService } from '../../../database/services/audit-log.service';
import { BusinessException } from '../../../shared/exceptions';
import { WhatsAppWebhookPayload } from '../types/whatsapp.types';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('WhatsAppService', () => {
  let service: WhatsAppService;
  let mockPrisma: any;
  let mockAuditLogService: any;

  const tenantId = 'tenant-123';
  const parentId = 'parent-123';
  const invoiceId = 'invoice-123';

  beforeEach(async () => {
    mockPrisma = {
      parent: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      invoice: {
        findUnique: jest.fn(),
      },
      auditLog: {
        create: jest.fn(),
      },
    };

    mockAuditLogService = {
      logAction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    service = module.get<WhatsAppService>(WhatsAppService);
    mockFetch.mockReset();
  });

  describe('Phone Number Formatting', () => {
    it('should format South African number starting with 0', () => {
      const result = service.formatPhoneE164('0821234567');
      expect(result).toBe('+27821234567');
    });

    it('should format number with 27 prefix', () => {
      const result = service.formatPhoneE164('27821234567');
      expect(result).toBe('+27821234567');
    });

    it('should keep E.164 format unchanged', () => {
      const result = service.formatPhoneE164('+27821234567');
      expect(result).toBe('+27821234567');
    });

    it('should handle 9-digit numbers', () => {
      const result = service.formatPhoneE164('821234567');
      expect(result).toBe('+27821234567');
    });

    it('should remove non-digit characters', () => {
      const result = service.formatPhoneE164('082-123-4567');
      expect(result).toBe('+27821234567');
    });

    it('should return empty for null/undefined', () => {
      expect(service.formatPhoneE164(null as any)).toBe('');
      expect(service.formatPhoneE164(undefined as any)).toBe('');
    });
  });

  describe('Phone Number Validation', () => {
    it('should validate correct SA number', () => {
      expect(service.isValidPhoneNumber('0821234567')).toBe(true);
      expect(service.isValidPhoneNumber('+27821234567')).toBe(true);
      expect(service.isValidPhoneNumber('27821234567')).toBe(true);
    });

    it('should reject invalid numbers', () => {
      expect(service.isValidPhoneNumber('12345')).toBe(false);
      expect(service.isValidPhoneNumber('')).toBe(false);
      expect(service.isValidPhoneNumber(null as any)).toBe(false);
    });
  });

  describe('sendInvoice', () => {
    const mockParent = {
      id: parentId,
      phone: '0821234567',
      whatsapp: null,
      firstName: 'John',
      lastName: 'Doe',
      whatsappOptIn: true,
      tenantId,
    };

    const mockInvoice = {
      id: invoiceId,
      invoiceNumber: 'INV-001',
      totalCents: 150000,
      dueDate: new Date('2024-02-15'),
      pdfUrl: 'https://example.com/invoice.pdf',
    };

    it('should send invoice notification successfully', async () => {
      mockPrisma.parent.findUnique.mockResolvedValue(mockParent);
      mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '+27821234567', wa_id: '27821234567' }],
          messages: [{ id: 'msg-123' }],
        }),
      });

      const result = await service.sendInvoice(parentId, invoiceId);

      expect(result.messageId).toBe('msg-123');
      expect(result.status).toBe('sent');
      expect(result.recipientPhone).toBe('+27821234567');
      expect(mockAuditLogService.logAction).toHaveBeenCalled();
    });

    it('should throw when parent not found', async () => {
      mockPrisma.parent.findUnique.mockResolvedValue(null);

      await expect(service.sendInvoice(parentId, invoiceId)).rejects.toThrow(
        BusinessException,
      );
    });

    it('should throw when parent not opted in', async () => {
      mockPrisma.parent.findUnique.mockResolvedValue({
        ...mockParent,
        whatsappOptIn: false,
      });

      await expect(service.sendInvoice(parentId, invoiceId)).rejects.toThrow(
        'Parent has not opted in to WhatsApp messages',
      );
    });

    it('should throw when phone number missing', async () => {
      mockPrisma.parent.findUnique.mockResolvedValue({
        ...mockParent,
        phone: null,
        whatsapp: null,
      });

      await expect(service.sendInvoice(parentId, invoiceId)).rejects.toThrow(
        'Parent phone number not available',
      );
    });

    it('should throw when invoice not found', async () => {
      mockPrisma.parent.findUnique.mockResolvedValue(mockParent);
      mockPrisma.invoice.findUnique.mockResolvedValue(null);

      await expect(service.sendInvoice(parentId, invoiceId)).rejects.toThrow(
        BusinessException,
      );
    });

    it('should use whatsapp number when available', async () => {
      mockPrisma.parent.findUnique.mockResolvedValue({
        ...mockParent,
        whatsapp: '0831234567',
        phone: '0821234567',
      });
      mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '+27831234567', wa_id: '27831234567' }],
          messages: [{ id: 'msg-123' }],
        }),
      });

      const result = await service.sendInvoice(parentId, invoiceId);

      expect(result.recipientPhone).toBe('+27831234567');
    });

    it('should handle API error', async () => {
      mockPrisma.parent.findUnique.mockResolvedValue(mockParent);
      mockPrisma.invoice.findUnique.mockResolvedValue(mockInvoice);
      mockFetch.mockResolvedValue({
        ok: false,
        json: async () => ({
          error: {
            message: 'Invalid access token',
            type: 'OAuthException',
            code: 190,
            fbtrace_id: 'trace-123',
          },
        }),
      });

      await expect(service.sendInvoice(parentId, invoiceId)).rejects.toThrow(
        'WhatsApp API error: Invalid access token',
      );
    });
  });

  describe('sendReminder', () => {
    const mockParent = {
      id: parentId,
      phone: '0821234567',
      whatsapp: null,
      whatsappOptIn: true,
      tenantId,
    };

    it('should send reminder successfully', async () => {
      mockPrisma.parent.findUnique.mockResolvedValue(mockParent);
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          messaging_product: 'whatsapp',
          contacts: [{ input: '+27821234567', wa_id: '27821234567' }],
          messages: [{ id: 'msg-123' }],
        }),
      });

      const result = await service.sendReminder(parentId, 'invoice_reminder', {
        amount: 'R 1,500.00',
        due_date: '15 February 2024',
      });

      expect(result.messageId).toBe('msg-123');
      expect(result.status).toBe('sent');
    });
  });

  describe('checkOptIn', () => {
    it('should return true when opted in', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue({ id: parentId });

      const result = await service.checkOptIn('0821234567');

      expect(result).toBe(true);
      expect(mockPrisma.parent.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [{ phone: '+27821234567' }, { whatsapp: '+27821234567' }],
          whatsappOptIn: true,
        },
        select: { id: true },
      });
    });

    it('should return false when not opted in', async () => {
      mockPrisma.parent.findFirst.mockResolvedValue(null);

      const result = await service.checkOptIn('0821234567');

      expect(result).toBe(false);
    });
  });

  describe('optOut', () => {
    it('should opt out phone number', async () => {
      mockPrisma.parent.updateMany.mockResolvedValue({ count: 1 });

      await service.optOut('0821234567');

      expect(mockPrisma.parent.updateMany).toHaveBeenCalledWith({
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
    it('should opt in parent', async () => {
      mockPrisma.parent.update.mockResolvedValue({ id: parentId });

      await service.optIn(parentId);

      expect(mockPrisma.parent.update).toHaveBeenCalledWith({
        where: { id: parentId },
        data: {
          whatsappOptIn: true,
          updatedAt: expect.any(Date),
        },
      });
    });
  });

  describe('handleWebhook', () => {
    it('should process status updates', async () => {
      const payload: WhatsAppWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'entry-123',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+27821234567',
                    phone_number_id: 'phone-id',
                  },
                  statuses: [
                    {
                      id: 'msg-123',
                      status: 'delivered',
                      timestamp: '1234567890',
                      recipient_id: '+27821234567',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      await service.handleWebhook(payload);

      expect(mockAuditLogService.logAction).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: 'WhatsAppMessageStatus',
          entityId: 'msg-123',
        }),
      );
    });

    it('should process opt-out messages', async () => {
      const payload: WhatsAppWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'entry-123',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '+27821234567',
                    phone_number_id: 'phone-id',
                  },
                  messages: [
                    {
                      from: '27821234567',
                      id: 'msg-456',
                      timestamp: '1234567890',
                      type: 'text',
                      text: { body: 'STOP' },
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      mockPrisma.parent.updateMany.mockResolvedValue({ count: 1 });

      await service.handleWebhook(payload);

      expect(mockPrisma.parent.updateMany).toHaveBeenCalled();
    });
  });
});

describe('WhatsAppService (unconfigured)', () => {
  let service: WhatsAppService;

  beforeEach(async () => {
    // Clear environment variables
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.WHATSAPP_PHONE_NUMBER_ID;
    delete process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
    delete process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditLogService, useValue: {} },
      ],
    }).compile();

    service = module.get<WhatsAppService>(WhatsAppService);
  });

  afterEach(() => {
    // Restore environment variables for other tests
    process.env.WHATSAPP_ACCESS_TOKEN = 'test-access-token';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'test-phone-number-id';
    process.env.WHATSAPP_BUSINESS_ACCOUNT_ID = 'test-business-account-id';
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = 'test-webhook-verify-token';
  });

  it('should throw when not configured', async () => {
    await expect(
      service.sendInvoice('parent-123', 'invoice-123'),
    ).rejects.toThrow('WhatsApp integration not configured');
  });
});
