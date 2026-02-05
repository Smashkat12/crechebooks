/**
 * Button Response Handler Tests
 * TASK-WA-009: Interactive Button Response Handlers
 * TASK-WA-010: View Invoice Handler
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ButtonResponseHandler } from '../handlers/button-response.handler';
import { TwilioContentService } from '../services/twilio-content.service';
import { DocumentUrlService } from '../services/document-url.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AuditLogService } from '../../../database/services/audit-log.service';
import {
  parseButtonPayload,
  createButtonPayload,
  isValidButtonAction,
} from '../types/button.types';

describe('ButtonResponseHandler', () => {
  let handler: ButtonResponseHandler;
  let prismaService: jest.Mocked<PrismaService>;
  let contentService: jest.Mocked<TwilioContentService>;
  let documentUrlService: jest.Mocked<DocumentUrlService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const mockTenant = {
    id: 'tenant-123',
    name: 'Little Stars Creche',
    tradingName: 'Little Stars',
    phone: '+27600188230',
    email: 'admin@littlestars.co.za',
  };

  const mockInvoice = {
    id: 'invoice-123',
    invoiceNumber: 'INV-2026-001234',
    tenantId: 'tenant-123',
    parentId: 'parent-123',
    isDeleted: false,
    parent: {
      id: 'parent-123',
      firstName: 'Sarah',
      lastName: 'Smith',
    },
  };

  beforeEach(async () => {
    const mockPrismaService = {
      tenant: {
        findUnique: jest.fn(),
      },
      invoice: {
        findFirst: jest.fn(),
      },
    };

    const mockContentService = {
      sendSessionMessage: jest
        .fn()
        .mockResolvedValue({ success: true, messageSid: 'SM123' }),
      sendSessionQuickReply: jest
        .fn()
        .mockResolvedValue({ success: true, messageSid: 'SM456' }),
      sendMediaMessage: jest
        .fn()
        .mockResolvedValue({ success: true, messageSid: 'SM789' }),
    };

    const mockDocumentUrlService = {
      generateInvoiceUrl: jest.fn().mockResolvedValue({
        url: 'https://api.example.com/public/documents/view?token=test123',
        expiresIn: 900,
        expiresAt: new Date(),
      }),
    };

    const mockAuditLogService = {
      logAction: jest.fn().mockResolvedValue({ id: 'audit-123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ButtonResponseHandler,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TwilioContentService, useValue: mockContentService },
        { provide: DocumentUrlService, useValue: mockDocumentUrlService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    handler = module.get<ButtonResponseHandler>(ButtonResponseHandler);
    prismaService = module.get(PrismaService);
    contentService = module.get(TwilioContentService);
    documentUrlService = module.get(DocumentUrlService);
    auditLogService = module.get(AuditLogService);
  });

  describe('parseButtonPayload', () => {
    it('should parse valid pay button payload', () => {
      const result = parseButtonPayload('pay_INV-2026-001234');
      expect(result.success).toBe(true);
      expect(result.payload).toEqual({
        action: 'pay',
        referenceId: 'INV-2026-001234',
        rawPayload: 'pay_INV-2026-001234',
      });
    });

    it('should parse valid extension button payload', () => {
      const result = parseButtonPayload('extension_INV-2026-001234');
      expect(result.success).toBe(true);
      expect(result.payload?.action).toBe('extension');
      expect(result.payload?.referenceId).toBe('INV-2026-001234');
    });

    it('should parse valid contact button payload', () => {
      const result = parseButtonPayload('contact_INV-2026-001234');
      expect(result.success).toBe(true);
      expect(result.payload?.action).toBe('contact');
    });

    it('should parse valid paid button payload', () => {
      const result = parseButtonPayload('paid_INV-2026-001234');
      expect(result.success).toBe(true);
      expect(result.payload?.action).toBe('paid');
    });

    it('should parse valid help button payload', () => {
      const result = parseButtonPayload('help_INV-2026-001234');
      expect(result.success).toBe(true);
      expect(result.payload?.action).toBe('help');
    });

    it('should parse valid plan button payload', () => {
      const result = parseButtonPayload('plan_INV-2026-001234');
      expect(result.success).toBe(true);
      expect(result.payload?.action).toBe('plan');
    });

    it('should parse valid callback button payload', () => {
      const result = parseButtonPayload('callback_INV-2026-001234');
      expect(result.success).toBe(true);
      expect(result.payload?.action).toBe('callback');
    });

    it('should parse valid view button payload', () => {
      const result = parseButtonPayload('view_INV-2026-001234');
      expect(result.success).toBe(true);
      expect(result.payload?.action).toBe('view');
      expect(result.payload?.referenceId).toBe('INV-2026-001234');
    });

    it('should handle reference IDs with underscores', () => {
      const result = parseButtonPayload('pay_INV_2026_001234');
      expect(result.success).toBe(true);
      expect(result.payload?.referenceId).toBe('INV_2026_001234');
    });

    it('should fail for empty payload', () => {
      const result = parseButtonPayload('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should fail for payload without underscore', () => {
      const result = parseButtonPayload('payINV2026001234');
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing underscore');
    });

    it('should fail for unknown action', () => {
      const result = parseButtonPayload('unknown_INV-2026-001234');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown button action');
    });

    it('should fail for missing reference ID', () => {
      const result = parseButtonPayload('pay_');
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing action or reference ID');
    });
  });

  describe('createButtonPayload', () => {
    it('should create valid payload string', () => {
      const payload = createButtonPayload('pay', 'INV-2026-001234');
      expect(payload).toBe('pay_INV-2026-001234');
    });

    it('should handle extension action', () => {
      const payload = createButtonPayload('extension', 'INV-2026-001234');
      expect(payload).toBe('extension_INV-2026-001234');
    });
  });

  describe('isValidButtonAction', () => {
    it('should return true for valid actions', () => {
      expect(isValidButtonAction('pay')).toBe(true);
      expect(isValidButtonAction('extension')).toBe(true);
      expect(isValidButtonAction('contact')).toBe(true);
      expect(isValidButtonAction('paid')).toBe(true);
      expect(isValidButtonAction('help')).toBe(true);
      expect(isValidButtonAction('plan')).toBe(true);
      expect(isValidButtonAction('callback')).toBe(true);
      expect(isValidButtonAction('view')).toBe(true);
    });

    it('should return false for invalid actions', () => {
      expect(isValidButtonAction('unknown')).toBe(false);
      expect(isValidButtonAction('')).toBe(false);
      expect(isValidButtonAction('PAY')).toBe(false); // Case sensitive
    });
  });

  describe('handleButtonResponse', () => {
    beforeEach(() => {
      (prismaService.tenant.findUnique as jest.Mock).mockResolvedValue(
        mockTenant,
      );
      (prismaService.invoice.findFirst as jest.Mock).mockResolvedValue(
        mockInvoice,
      );
    });

    it('should handle pay button and send payment link', async () => {
      const result = await handler.handleButtonResponse(
        '+27821234567',
        'pay_INV-2026-001234',
        'tenant-123',
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('pay');
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('payment link'),
        'tenant-123',
      );
      expect(auditLogService.logAction).toHaveBeenCalled();
    });

    it('should handle extension button and log request', async () => {
      const result = await handler.handleButtonResponse(
        '+27821234567',
        'extension_INV-2026-001234',
        'tenant-123',
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('extension');
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('extension request'),
        'tenant-123',
      );
    });

    it('should handle contact button and open conversation', async () => {
      const result = await handler.handleButtonResponse(
        '+27821234567',
        'contact_INV-2026-001234',
        'tenant-123',
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('contact');
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('help'),
        'tenant-123',
      );
    });

    it('should handle paid button and request proof', async () => {
      const result = await handler.handleButtonResponse(
        '+27821234567',
        'paid_INV-2026-001234',
        'tenant-123',
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('paid');
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('proof of payment'),
        'tenant-123',
      );
    });

    it('should handle help button and send quick reply menu', async () => {
      const result = await handler.handleButtonResponse(
        '+27821234567',
        'help_INV-2026-001234',
        'tenant-123',
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('help');
      expect(contentService.sendSessionQuickReply).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('help'),
        expect.arrayContaining([
          expect.objectContaining({ title: 'Check Balance' }),
          expect.objectContaining({ title: 'Payment Methods' }),
          expect.objectContaining({ title: 'Speak to Someone' }),
        ]),
        'tenant-123',
      );
    });

    it('should handle plan button and log request', async () => {
      const result = await handler.handleButtonResponse(
        '+27821234567',
        'plan_INV-2026-001234',
        'tenant-123',
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('plan');
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('payment plan'),
        'tenant-123',
      );
    });

    it('should handle callback button and log request', async () => {
      const result = await handler.handleButtonResponse(
        '+27821234567',
        'callback_INV-2026-001234',
        'tenant-123',
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('callback');
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('call you back'),
        'tenant-123',
      );
    });

    it('should handle view button and send invoice PDF', async () => {
      // Mock invoice with details needed for view handler
      (prismaService.invoice.findFirst as jest.Mock).mockResolvedValue({
        id: 'invoice-123',
        invoiceNumber: 'INV-2026-001234',
        tenantId: 'tenant-123',
        totalCents: 150000, // R1500.00
        amountPaidCents: 0,
        dueDate: new Date('2026-02-15'),
        isDeleted: false,
      });

      const result = await handler.handleButtonResponse(
        '+27821234567',
        'view_INV-2026-001234',
        'tenant-123',
      );

      expect(result.success).toBe(true);
      expect(result.action).toBe('view');
      expect(documentUrlService.generateInvoiceUrl).toHaveBeenCalledWith(
        'invoice-123',
        'tenant-123',
      );
      expect(contentService.sendMediaMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('token=test123'),
        expect.stringContaining('Invoice INV-2026-001234'),
        'tenant-123',
      );
    });

    it('should handle view button when invoice not found', async () => {
      (prismaService.invoice.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await handler.handleButtonResponse(
        '+27821234567',
        'view_INV-2026-001234',
        'tenant-123',
      );

      expect(result.success).toBe(true);
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining("couldn't find invoice"),
        'tenant-123',
      );
    });

    it('should return error for invalid payload', async () => {
      const result = await handler.handleButtonResponse(
        '+27821234567',
        'invalid_payload_format_no_action',
        'tenant-123',
      );

      // Even with unknown action, should fail gracefully
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return error when tenant not found', async () => {
      (prismaService.tenant.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await handler.handleButtonResponse(
        '+27821234567',
        'pay_INV-2026-001234',
        'tenant-123',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tenant not found');
    });

    it('should handle extension request when invoice not found', async () => {
      (prismaService.invoice.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await handler.handleButtonResponse(
        '+27821234567',
        'extension_INV-2026-001234',
        'tenant-123',
      );

      expect(result.success).toBe(true);
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining("couldn't find that invoice"),
        'tenant-123',
      );
    });

    it('should include tenant trading name in messages', async () => {
      await handler.handleButtonResponse(
        '+27821234567',
        'pay_INV-2026-001234',
        'tenant-123',
      );

      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('Little Stars'),
        'tenant-123',
      );
    });

    it('should fall back to tenant name if trading name not set', async () => {
      (prismaService.tenant.findUnique as jest.Mock).mockResolvedValue({
        ...mockTenant,
        tradingName: null,
      });

      await handler.handleButtonResponse(
        '+27821234567',
        'pay_INV-2026-001234',
        'tenant-123',
      );

      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('Little Stars Creche'),
        'tenant-123',
      );
    });
  });
});
