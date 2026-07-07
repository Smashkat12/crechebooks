/**
 * ReminderService — bank details in ARREARS_REMINDER_* templates
 *
 * TASK-BILL-043 wires tenant.bankName / bankAccountNumber / bankBranchCode
 * into the substitution map that MessageTemplateResolverService uses when
 * rendering the ARREARS_REMINDER_FRIENDLY / FIRM / FINAL templates.
 *
 * Behaviour under test:
 *   1. Tenant WITH bank details -> placeholders render the tenant's values.
 *   2. Tenant WITHOUT bank details (null on the column) -> placeholders
 *      render as empty string (never the literal `{bankName}` token, which
 *      would leak Handlebars-style syntax into the parent-facing message).
 *
 * All delivery paths are mocked — no real email/WhatsApp calls are made.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ReminderService } from '../reminder.service';
import { PrismaService } from '../../prisma/prisma.service';
import { InvoiceRepository } from '../../repositories/invoice.repository';
import { ParentRepository } from '../../repositories/parent.repository';
import { ReminderRepository } from '../../repositories/reminder.repository';
import { ArrearsService } from '../arrears.service';
import { EmailService } from '../../../integrations/email/email.service';
import { WhatsAppProviderService } from '../../../integrations/whatsapp/services/whatsapp-provider.service';
import { MessageTemplateResolverService } from '../message-template-resolver.service';
import { EscalationLevel, DeliveryChannel } from '../../dto/reminder.dto';

describe('ReminderService — bank details wiring (TASK-BILL-043)', () => {
  let service: ReminderService;
  let mockPrisma: any;
  let mockReminderRepo: any;
  let mockEmailService: any;
  let mockWhatsAppService: any;

  const tenantId = 'tenant-123';
  const invoiceId = 'inv-1';

  const overdueDate = new Date();
  overdueDate.setDate(overdueDate.getDate() - 5);

  const baseInvoice = {
    id: invoiceId,
    invoiceNumber: 'INV-2026-042',
    tenantId,
    parentId: 'parent-1',
    dueDate: overdueDate,
    totalCents: 150000,
    amountPaidCents: 0,
    status: 'OVERDUE',
    isDeleted: false,
    parent: {
      id: 'parent-1',
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane@example.com',
      whatsapp: '+27821234567',
      preferredContact: 'EMAIL',
    },
    child: {
      id: 'child-1',
      firstName: 'Tommy',
      lastName: 'Doe',
    },
  };

  const tenantWithBank = {
    name: 'Elle Elephant',
    phone: '+27110000000',
    email: 'admin@elle.co.za',
    bankName: 'FNB',
    bankAccountNumber: '62812345678',
    bankBranchCode: '250655',
  };

  const tenantWithoutBank = {
    name: 'Elle Elephant',
    phone: '+27110000000',
    email: 'admin@elle.co.za',
    bankName: null,
    bankAccountNumber: null,
    bankBranchCode: null,
  };

  beforeEach(async () => {
    mockPrisma = {
      invoice: {
        findUnique: jest.fn(),
      },
      tenant: { findUnique: jest.fn() },
      reminder: { findMany: jest.fn() },
      messageTemplate: {
        // No override in the DB → resolver falls through to the coded default.
        findUnique: jest.fn().mockResolvedValue(null),
      },
    };

    mockReminderRepo = {
      create: jest.fn().mockResolvedValue({ id: 'rem-1' }),
      findRecentForInvoice: jest.fn().mockResolvedValue([]),
    };

    mockEmailService = {
      sendEmail: jest.fn().mockResolvedValue({ messageId: 'msg-1' }),
    };

    mockWhatsAppService = {
      sendMessage: jest
        .fn()
        .mockResolvedValue({ success: true, messageId: 'wa-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReminderService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: InvoiceRepository, useValue: { findById: jest.fn() } },
        { provide: ParentRepository, useValue: { findById: jest.fn() } },
        { provide: ReminderRepository, useValue: mockReminderRepo },
        { provide: ArrearsService, useValue: { getArrearsReport: jest.fn() } },
        { provide: EmailService, useValue: mockEmailService },
        { provide: WhatsAppProviderService, useValue: mockWhatsAppService },
        // Use the real resolver so we actually exercise placeholder substitution.
        MessageTemplateResolverService,
      ],
    }).compile();

    service = module.get<ReminderService>(ReminderService);
  });

  describe('generateReminderContent — email default template', () => {
    it('renders tenant bank details into {bankName} / {accountNumber} / {branchCode} when the tenant has them set', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        ...baseInvoice,
        tenant: tenantWithBank,
      });

      const content = await service.generateReminderContent(
        invoiceId,
        EscalationLevel.FRIENDLY,
        tenantId,
      );

      // The default FRIENDLY email template says:
      //   Bank: {bankName}
      //   Account Number: {accountNumber}
      //   Branch Code: {branchCode}
      expect(content.body).toContain('Bank: FNB');
      expect(content.body).toContain('Account Number: 62812345678');
      expect(content.body).toContain('Branch Code: 250655');

      // Literal placeholders MUST NOT leak into the rendered body.
      expect(content.body).not.toContain('{bankName}');
      expect(content.body).not.toContain('{accountNumber}');
      expect(content.body).not.toContain('{branchCode}');
    });

    it('renders bank placeholders as empty string (not literal {bankName}) when the tenant has no bank details', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        ...baseInvoice,
        tenant: tenantWithoutBank,
      });

      const content = await service.generateReminderContent(
        invoiceId,
        EscalationLevel.FRIENDLY,
        tenantId,
      );

      // The empty-value branch: substitutions still happen but with '' so the
      // template lines render as "Bank: ", "Account Number: ", "Branch Code: ".
      expect(content.body).toContain('Bank: \n');
      expect(content.body).toContain('Account Number: \n');
      expect(content.body).toContain('Branch Code: \n');

      // Crucially — no literal placeholder tokens survive rendering.
      expect(content.body).not.toContain('{bankName}');
      expect(content.body).not.toContain('{accountNumber}');
      expect(content.body).not.toContain('{branchCode}');
    });
  });

  describe('sendReminders — WhatsApp default template', () => {
    it('renders tenant bank details into the WHATSAPP template body', async () => {
      // sendReminders fetches the invoice itself, so a parent with
      // preferredContact=WHATSAPP routes to the WhatsApp default.
      mockPrisma.invoice.findUnique.mockResolvedValue({
        ...baseInvoice,
        parent: { ...baseInvoice.parent, preferredContact: 'WHATSAPP' },
        tenant: tenantWithBank,
      });

      const result = await service.sendReminders(
        [invoiceId],
        DeliveryChannel.WHATSAPP,
        tenantId,
      );

      expect(result.sent).toBe(1);
      expect(mockWhatsAppService.sendMessage).toHaveBeenCalledTimes(1);
      const [, body] = mockWhatsAppService.sendMessage.mock.calls[0];

      // Default FRIENDLY WhatsApp template contains:
      //   {bankName}
      //   Acc: {accountNumber}
      //   Branch: {branchCode}
      expect(body).toContain('FNB');
      expect(body).toContain('Acc: 62812345678');
      expect(body).toContain('Branch: 250655');
      expect(body).not.toContain('{bankName}');
      expect(body).not.toContain('{accountNumber}');
      expect(body).not.toContain('{branchCode}');
    });

    it('renders empty (not literal placeholders) in the WHATSAPP template when the tenant has no bank details', async () => {
      mockPrisma.invoice.findUnique.mockResolvedValue({
        ...baseInvoice,
        parent: { ...baseInvoice.parent, preferredContact: 'WHATSAPP' },
        tenant: tenantWithoutBank,
      });

      const result = await service.sendReminders(
        [invoiceId],
        DeliveryChannel.WHATSAPP,
        tenantId,
      );

      expect(result.sent).toBe(1);
      const [, body] = mockWhatsAppService.sendMessage.mock.calls[0];
      expect(body).not.toContain('{bankName}');
      expect(body).not.toContain('{accountNumber}');
      expect(body).not.toContain('{branchCode}');
      // The template lines still render (with empty values) so the caller
      // never sees "Acc: {accountNumber}" leaked verbatim.
      expect(body).toContain('Acc: \n');
      expect(body).toContain('Branch: \n');
    });
  });
});
