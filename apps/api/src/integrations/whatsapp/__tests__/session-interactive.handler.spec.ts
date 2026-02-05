/**
 * Session Interactive Handler Tests
 * TASK-WA-010: Session-Based Interactive Features
 */

import { Test, TestingModule } from '@nestjs/testing';
import { SessionInteractiveHandler } from '../handlers/session-interactive.handler';
import { TwilioContentService } from '../services/twilio-content.service';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { AuditLogService } from '../../../database/services/audit-log.service';
import {
  parseListResponse,
  createListId,
  isValidListPickerType,
  parseMenuAction,
} from '../types/session.types';

describe('SessionInteractiveHandler', () => {
  let handler: SessionInteractiveHandler;
  let prismaService: jest.Mocked<PrismaService>;
  let contentService: jest.Mocked<TwilioContentService>;
  let auditLogService: jest.Mocked<AuditLogService>;

  const mockTenant = {
    id: 'tenant-123',
    name: 'Little Stars Creche',
    tradingName: 'Little Stars',
    phone: '+27600188230',
    email: 'admin@littlestars.co.za',
    bankName: 'FNB',
    bankAccountNumber: '62012345678',
    bankBranchCode: '250655',
  };

  const mockInvoices = [
    {
      id: 'inv-1',
      invoiceNumber: 'INV-2026-0001',
      tenantId: 'tenant-123',
      parentId: 'parent-123',
      totalCents: 150000,
      amountPaidCents: 50000,
      status: 'PARTIALLY_PAID',
      dueDate: new Date('2026-02-15'),
      isDeleted: false,
    },
    {
      id: 'inv-2',
      invoiceNumber: 'INV-2026-0002',
      tenantId: 'tenant-123',
      parentId: 'parent-123',
      totalCents: 200000,
      amountPaidCents: 0,
      status: 'OVERDUE',
      dueDate: new Date('2026-01-31'),
      isDeleted: false,
    },
  ];

  beforeEach(async () => {
    const mockPrismaService = {
      tenant: {
        findUnique: jest.fn(),
      },
      invoice: {
        findMany: jest.fn(),
      },
    };

    const mockContentService = {
      sendSessionMessage: jest
        .fn()
        .mockResolvedValue({ success: true, messageSid: 'SM123' }),
      sendSessionQuickReply: jest
        .fn()
        .mockResolvedValue({ success: true, messageSid: 'SM456' }),
      sendListPicker: jest
        .fn()
        .mockResolvedValue({ success: true, messageSid: 'SM789' }),
    };

    const mockAuditLogService = {
      logAction: jest.fn().mockResolvedValue({ id: 'audit-123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SessionInteractiveHandler,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TwilioContentService, useValue: mockContentService },
        { provide: AuditLogService, useValue: mockAuditLogService },
      ],
    }).compile();

    handler = module.get<SessionInteractiveHandler>(SessionInteractiveHandler);
    prismaService = module.get(PrismaService);
    contentService = module.get(TwilioContentService);
    auditLogService = module.get(AuditLogService);
  });

  describe('parseListResponse', () => {
    it('should parse statement_current list ID', () => {
      const result = parseListResponse('statement_current');
      expect(result.success).toBe(true);
      expect(result.parsed).toEqual({
        type: 'statement',
        value: 'current',
        rawListId: 'statement_current',
      });
    });

    it('should parse statement_3mo list ID', () => {
      const result = parseListResponse('statement_3mo');
      expect(result.success).toBe(true);
      expect(result.parsed?.type).toBe('statement');
      expect(result.parsed?.value).toBe('3mo');
    });

    it('should parse invoice list ID with UUID', () => {
      const result = parseListResponse('invoice_abc-123-def-456');
      expect(result.success).toBe(true);
      expect(result.parsed?.type).toBe('invoice');
      expect(result.parsed?.value).toBe('abc-123-def-456');
    });

    it('should parse help_balance list ID', () => {
      const result = parseListResponse('help_balance');
      expect(result.success).toBe(true);
      expect(result.parsed?.type).toBe('help');
      expect(result.parsed?.value).toBe('balance');
    });

    it('should parse help_payment list ID', () => {
      const result = parseListResponse('help_payment');
      expect(result.success).toBe(true);
      expect(result.parsed?.type).toBe('help');
      expect(result.parsed?.value).toBe('payment');
    });

    it('should fail for empty list ID', () => {
      const result = parseListResponse('');
      expect(result.success).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should fail for list ID without underscore', () => {
      const result = parseListResponse('statementcurrent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing underscore');
    });

    it('should fail for unknown type', () => {
      const result = parseListResponse('unknown_value');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown list picker type');
    });

    it('should fail for missing value', () => {
      const result = parseListResponse('statement_');
      expect(result.success).toBe(false);
      expect(result.error).toContain('missing type or value');
    });
  });

  describe('createListId', () => {
    it('should create statement list ID', () => {
      const id = createListId('statement', 'current');
      expect(id).toBe('statement_current');
    });

    it('should create invoice list ID', () => {
      const id = createListId('invoice', 'abc-123');
      expect(id).toBe('invoice_abc-123');
    });

    it('should create help list ID', () => {
      const id = createListId('help', 'balance');
      expect(id).toBe('help_balance');
    });
  });

  describe('isValidListPickerType', () => {
    it('should return true for valid types', () => {
      expect(isValidListPickerType('statement')).toBe(true);
      expect(isValidListPickerType('invoice')).toBe(true);
      expect(isValidListPickerType('help')).toBe(true);
    });

    it('should return false for invalid types', () => {
      expect(isValidListPickerType('unknown')).toBe(false);
      expect(isValidListPickerType('')).toBe(false);
      expect(isValidListPickerType('STATEMENT')).toBe(false); // Case sensitive
    });
  });

  describe('parseMenuAction', () => {
    it('should parse menu_pay action', () => {
      expect(parseMenuAction('menu_pay')).toBe('pay');
    });

    it('should parse menu_invoices action', () => {
      expect(parseMenuAction('menu_invoices')).toBe('invoices');
    });

    it('should parse menu_statement action', () => {
      expect(parseMenuAction('menu_statement')).toBe('statement');
    });

    it('should return null for invalid menu actions', () => {
      expect(parseMenuAction('menu_unknown')).toBeNull();
      expect(parseMenuAction('pay')).toBeNull();
      expect(parseMenuAction('')).toBeNull();
    });
  });

  describe('sendStatementPeriodSelector', () => {
    beforeEach(() => {
      (prismaService.tenant.findUnique as jest.Mock).mockResolvedValue(
        mockTenant,
      );
    });

    it('should send list picker with 5 period options', async () => {
      const result = await handler.sendStatementPeriodSelector(
        '+27821234567',
        'tenant-123',
      );

      expect(result.success).toBe(true);
      expect(contentService.sendListPicker).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('Little Stars'),
        'Select Period',
        expect.arrayContaining([
          expect.objectContaining({ item: 'Current Month' }),
          expect.objectContaining({ item: 'Previous Month' }),
          expect.objectContaining({ item: 'Last 3 Months' }),
          expect.objectContaining({ item: 'Year to Date' }),
          expect.objectContaining({ item: 'Last Tax Year' }),
        ]),
        'tenant-123',
      );
    });

    it('should return error when tenant not found', async () => {
      (prismaService.tenant.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await handler.sendStatementPeriodSelector(
        '+27821234567',
        'tenant-123',
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tenant not found');
    });
  });

  describe('handleStatementSelection', () => {
    beforeEach(() => {
      (prismaService.tenant.findUnique as jest.Mock).mockResolvedValue(
        mockTenant,
      );
    });

    it('should handle current month selection', async () => {
      const result = await handler.handleStatementSelection(
        '+27821234567',
        'current',
        'tenant-123',
        'parent-123',
      );

      expect(result.success).toBe(true);
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('current month'),
        'tenant-123',
      );
      expect(auditLogService.logAction).toHaveBeenCalled();
    });

    it('should handle tax year selection', async () => {
      const result = await handler.handleStatementSelection(
        '+27821234567',
        'tax',
        'tenant-123',
        'parent-123',
      );

      expect(result.success).toBe(true);
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('tax year'),
        'tenant-123',
      );
    });
  });

  describe('sendInvoiceList', () => {
    beforeEach(() => {
      (prismaService.tenant.findUnique as jest.Mock).mockResolvedValue(
        mockTenant,
      );
    });

    it('should send list picker with unpaid invoices', async () => {
      (prismaService.invoice.findMany as jest.Mock).mockResolvedValue(
        mockInvoices,
      );

      const result = await handler.sendInvoiceList(
        '+27821234567',
        'tenant-123',
        'parent-123',
      );

      expect(result.success).toBe(true);
      expect(contentService.sendListPicker).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('2 unpaid invoice(s)'),
        'View Invoices',
        expect.arrayContaining([
          expect.objectContaining({
            item: 'INV-2026-0001',
            id: 'invoice_inv-1',
          }),
          expect.objectContaining({
            item: 'INV-2026-0002',
            id: 'invoice_inv-2',
          }),
        ]),
        'tenant-123',
      );
    });

    it('should send good news message when no unpaid invoices', async () => {
      (prismaService.invoice.findMany as jest.Mock).mockResolvedValue([]);

      const result = await handler.sendInvoiceList(
        '+27821234567',
        'tenant-123',
        'parent-123',
      );

      expect(result.success).toBe(true);
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('no unpaid invoices'),
        'tenant-123',
      );
      expect(contentService.sendListPicker).not.toHaveBeenCalled();
    });

    it('should format invoice amounts correctly', async () => {
      (prismaService.invoice.findMany as jest.Mock).mockResolvedValue(
        mockInvoices,
      );

      await handler.sendInvoiceList('+27821234567', 'tenant-123', 'parent-123');

      const callArgs = (contentService.sendListPicker as jest.Mock).mock
        .calls[0][3];

      // First invoice: 150000 - 50000 = 100000 cents = R1,000.00
      expect(callArgs[0].description).toContain('1');
      expect(callArgs[0].description).toContain('PARTIALLY_PAID');

      // Second invoice: 200000 - 0 = 200000 cents = R2,000.00
      expect(callArgs[1].description).toContain('2');
      expect(callArgs[1].description).toContain('OVERDUE');
    });
  });

  describe('sendHelpMenu', () => {
    beforeEach(() => {
      (prismaService.tenant.findUnique as jest.Mock).mockResolvedValue(
        mockTenant,
      );
    });

    it('should send list picker with 5 help options', async () => {
      const result = await handler.sendHelpMenu('+27821234567', 'tenant-123');

      expect(result.success).toBe(true);
      expect(contentService.sendListPicker).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('How can Little Stars help'),
        'Select Topic',
        expect.arrayContaining([
          expect.objectContaining({
            item: 'View My Balance',
            id: 'help_balance',
          }),
          expect.objectContaining({
            item: 'Payment Methods',
            id: 'help_payment',
          }),
          expect.objectContaining({
            item: 'Request Statement',
            id: 'help_statement',
          }),
          expect.objectContaining({
            item: 'Update Details',
            id: 'help_update',
          }),
          expect.objectContaining({
            item: 'Speak to Someone',
            id: 'help_human',
          }),
        ]),
        'tenant-123',
      );
    });
  });

  describe('handleHelpSelection', () => {
    beforeEach(() => {
      (prismaService.tenant.findUnique as jest.Mock).mockResolvedValue(
        mockTenant,
      );
      (prismaService.invoice.findMany as jest.Mock).mockResolvedValue(
        mockInvoices,
      );
    });

    it('should handle balance selection', async () => {
      const result = await handler.handleHelpSelection(
        '+27821234567',
        'balance',
        'tenant-123',
        'parent-123',
      );

      expect(result.success).toBe(true);
      expect(contentService.sendSessionQuickReply).toHaveBeenCalled();
    });

    it('should handle payment selection', async () => {
      const result = await handler.handleHelpSelection(
        '+27821234567',
        'payment',
        'tenant-123',
        'parent-123',
      );

      expect(result.success).toBe(true);
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('Payment Methods'),
        'tenant-123',
      );
    });

    it('should handle statement selection', async () => {
      const result = await handler.handleHelpSelection(
        '+27821234567',
        'statement',
        'tenant-123',
        'parent-123',
      );

      expect(result.success).toBe(true);
      expect(contentService.sendListPicker).toHaveBeenCalled();
    });

    it('should handle update selection', async () => {
      const result = await handler.handleHelpSelection(
        '+27821234567',
        'update',
        'tenant-123',
        'parent-123',
      );

      expect(result.success).toBe(true);
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('Parent Portal'),
        'tenant-123',
      );
    });

    it('should handle human callback selection', async () => {
      const result = await handler.handleHelpSelection(
        '+27821234567',
        'human',
        'tenant-123',
        'parent-123',
      );

      expect(result.success).toBe(true);
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('call you back'),
        'tenant-123',
      );
      expect(auditLogService.logAction).toHaveBeenCalled();
    });

    it('should handle unknown selection gracefully', async () => {
      const result = await handler.handleHelpSelection(
        '+27821234567',
        'unknown',
        'tenant-123',
        'parent-123',
      );

      expect(result.success).toBe(false);
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining("didn't understand"),
        'tenant-123',
      );
    });
  });

  describe('sendBalanceInfo', () => {
    beforeEach(() => {
      (prismaService.tenant.findUnique as jest.Mock).mockResolvedValue(
        mockTenant,
      );
      (prismaService.invoice.findMany as jest.Mock).mockResolvedValue(
        mockInvoices,
      );
    });

    it('should send balance with quick reply buttons', async () => {
      const result = await handler.sendBalanceInfo(
        '+27821234567',
        'tenant-123',
        'parent-123',
      );

      expect(result.success).toBe(true);
      expect(contentService.sendSessionQuickReply).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('Your current balance'),
        [
          { title: 'Pay Now', id: 'menu_pay' },
          { title: 'View Invoices', id: 'menu_invoices' },
          { title: 'Get Statement', id: 'menu_statement' },
        ],
        'tenant-123',
      );
    });

    it('should calculate total outstanding correctly', async () => {
      await handler.sendBalanceInfo('+27821234567', 'tenant-123', 'parent-123');

      // Total: (150000-50000) + (200000-0) = 100000 + 200000 = 300000 cents = R3,000.00
      expect(contentService.sendSessionQuickReply).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('R3'),
        expect.any(Array),
        'tenant-123',
      );
    });

    it('should include invoice count in message', async () => {
      await handler.sendBalanceInfo('+27821234567', 'tenant-123', 'parent-123');

      expect(contentService.sendSessionQuickReply).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('2 unpaid invoice(s)'),
        expect.any(Array),
        'tenant-123',
      );
    });
  });

  describe('sendPaymentMethods', () => {
    it('should include bank details when available', async () => {
      const result = await handler.sendPaymentMethods(
        '+27821234567',
        'tenant-123',
        mockTenant,
      );

      expect(result.success).toBe(true);
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('FNB'),
        'tenant-123',
      );
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('62012345678'),
        'tenant-123',
      );
    });

    it('should work without bank details', async () => {
      const tenantWithoutBank = {
        ...mockTenant,
        bankName: null,
        bankAccountNumber: null,
        bankBranchCode: null,
      };

      const result = await handler.sendPaymentMethods(
        '+27821234567',
        'tenant-123',
        tenantWithoutBank,
      );

      expect(result.success).toBe(true);
      expect(contentService.sendSessionMessage).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('Online Payment'),
        'tenant-123',
      );
    });
  });

  describe('calculateStatementPeriod', () => {
    it('should calculate current month period', () => {
      const { startDate } = handler.calculateStatementPeriod('current');

      const now = new Date();
      expect(startDate.getMonth()).toBe(now.getMonth());
      expect(startDate.getDate()).toBe(1);
    });

    it('should calculate previous month period', () => {
      const { startDate } = handler.calculateStatementPeriod('prev');

      const now = new Date();
      const expectedMonth = now.getMonth() === 0 ? 11 : now.getMonth() - 1;
      expect(startDate.getMonth()).toBe(expectedMonth);
      expect(startDate.getDate()).toBe(1);
    });

    it('should calculate last 3 months period', () => {
      const { startDate } = handler.calculateStatementPeriod('3mo');

      const now = new Date();
      // 2 months ago (for 3 month range)
      const expectedMonth = (now.getMonth() - 2 + 12) % 12;
      expect(startDate.getMonth()).toBe(expectedMonth);
    });

    it('should calculate year to date period', () => {
      const { startDate } = handler.calculateStatementPeriod('ytd');

      const now = new Date();
      expect(startDate.getFullYear()).toBe(now.getFullYear());
      expect(startDate.getMonth()).toBe(0); // January
      expect(startDate.getDate()).toBe(1);
    });

    it('should calculate SA tax year period (March to February)', () => {
      const { startDate } = handler.calculateStatementPeriod('tax');

      // Tax year starts in March
      expect(startDate.getMonth()).toBe(2); // March
      expect(startDate.getDate()).toBe(1);
    });
  });

  describe('periodToLabel', () => {
    it('should return correct labels', () => {
      expect(handler.periodToLabel('current')).toBe('current month');
      expect(handler.periodToLabel('prev')).toBe('previous month');
      expect(handler.periodToLabel('3mo')).toBe('last 3 months');
      expect(handler.periodToLabel('ytd')).toBe('year to date');
      expect(handler.periodToLabel('tax')).toBe('tax year');
    });

    it('should return period as-is for unknown values', () => {
      expect(handler.periodToLabel('unknown')).toBe('unknown');
    });
  });

  describe('tenant branding', () => {
    beforeEach(() => {
      (prismaService.tenant.findUnique as jest.Mock).mockResolvedValue(
        mockTenant,
      );
    });

    it('should use tradingName in all messages', async () => {
      await handler.sendHelpMenu('+27821234567', 'tenant-123');

      expect(contentService.sendListPicker).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('Little Stars'),
        expect.any(String),
        expect.any(Array),
        'tenant-123',
      );
    });

    it('should fall back to tenant name if tradingName not set', async () => {
      (prismaService.tenant.findUnique as jest.Mock).mockResolvedValue({
        ...mockTenant,
        tradingName: null,
      });

      await handler.sendHelpMenu('+27821234567', 'tenant-123');

      expect(contentService.sendListPicker).toHaveBeenCalledWith(
        '+27821234567',
        expect.stringContaining('Little Stars Creche'),
        expect.any(String),
        expect.any(Array),
        'tenant-123',
      );
    });
  });
});
