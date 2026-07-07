/**
 * ReminderService.sendManualParentReminders Tests
 *
 * Backs POST /arrears/reminder (manual, user-initiated sends).
 * ALL delivery paths are mocked — no real email/WhatsApp calls.
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
import { DeliveryChannel, ReminderStatus } from '../../dto/reminder.dto';

describe('ReminderService.sendManualParentReminders', () => {
  let service: ReminderService;
  let mockPrisma: any;
  let mockParentRepo: any;
  let mockReminderRepo: any;
  let mockEmailService: any;
  let mockWhatsAppService: any;

  const tenantId = 'tenant-123';
  const parentId = 'parent-1';

  const parent = {
    id: parentId,
    firstName: 'Jane',
    lastName: 'Doe',
    email: 'jane@example.com',
    whatsapp: '+27821234567',
    preferredContact: 'EMAIL',
    isActive: true,
  };

  const overdueDate = new Date();
  overdueDate.setDate(overdueDate.getDate() - 14);

  const overdueInvoice = {
    id: 'inv-1',
    invoiceNumber: 'INV-2026-001',
    tenantId,
    parentId,
    dueDate: overdueDate,
    totalCents: 150000,
    amountPaidCents: 0,
    status: 'OVERDUE',
  };

  beforeEach(async () => {
    mockPrisma = {
      tenant: {
        findUnique: jest.fn().mockResolvedValue({
          name: 'Elle Elephant',
          tradingName: 'Elle Elephant ECD',
        }),
      },
      invoice: {
        findMany: jest.fn().mockResolvedValue([overdueInvoice]),
        findUnique: jest.fn(),
      },
      reminder: { findMany: jest.fn() },
    };

    mockParentRepo = {
      findById: jest.fn().mockResolvedValue(parent),
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
        { provide: ParentRepository, useValue: mockParentRepo },
        { provide: ReminderRepository, useValue: mockReminderRepo },
        { provide: ArrearsService, useValue: { getArrearsReport: jest.fn() } },
        { provide: EmailService, useValue: mockEmailService },
        { provide: WhatsAppProviderService, useValue: mockWhatsAppService },
      ],
    }).compile();

    service = module.get<ReminderService>(ReminderService);
  });

  it('sends the caller template via email with placeholder substitution re-applied', async () => {
    const result = await service.sendManualParentReminders({
      tenantId,
      parentIds: [parentId],
      channel: DeliveryChannel.EMAIL,
      template: 'Dear [Parent Name], please pay. Regards, [Creche Name]',
    });

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.byChannel.email).toEqual({ sent: 1, failed: 0 });
    expect(result.byChannel.whatsapp).toEqual({ sent: 0, failed: 0 });

    // Placeholders resolved server-side (robustness even if frontend missed them)
    expect(mockEmailService.sendEmail).toHaveBeenCalledWith(
      'jane@example.com',
      expect.stringContaining('Elle Elephant ECD'),
      'Dear Jane Doe, please pay. Regards, Elle Elephant ECD',
    );
    expect(mockWhatsAppService.sendMessage).not.toHaveBeenCalled();

    // Reminder recorded against the anchor (oldest overdue) invoice
    expect(mockReminderRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        invoiceId: 'inv-1',
        parentId,
        deliveryMethod: DeliveryChannel.EMAIL,
        reminderStatus: ReminderStatus.SENT,
      }),
    );
  });

  it('sends the resolved message verbatim via WhatsApp for the whatsapp channel', async () => {
    const result = await service.sendManualParentReminders({
      tenantId,
      parentIds: [parentId],
      channel: DeliveryChannel.WHATSAPP,
      template: 'Hi [Parent Name], outstanding fees are due.',
    });

    expect(result.sent).toBe(1);
    expect(result.byChannel.whatsapp).toEqual({ sent: 1, failed: 0 });
    expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    expect(mockWhatsAppService.sendMessage).toHaveBeenCalledWith(
      '+27821234567',
      'Hi Jane Doe, outstanding fees are due.',
    );
  });

  it('attempts both channels for BOTH and reports true per-channel counts', async () => {
    mockWhatsAppService.sendMessage.mockResolvedValue({
      success: false,
      error: 'Twilio 63016',
    });

    const result = await service.sendManualParentReminders({
      tenantId,
      parentIds: [parentId],
      channel: DeliveryChannel.BOTH,
      template: 'Reminder',
    });

    // Email succeeded, WhatsApp failed — parent counts as SENT (any success)
    expect(result.sent).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.byChannel.email).toEqual({ sent: 1, failed: 0 });
    expect(result.byChannel.whatsapp).toEqual({ sent: 0, failed: 1 });
  });

  it('marks the parent FAILED when all attempted channels fail', async () => {
    mockEmailService.sendEmail.mockRejectedValue(new Error('SMTP down'));

    const result = await service.sendManualParentReminders({
      tenantId,
      parentIds: [parentId],
      channel: DeliveryChannel.EMAIL,
      template: 'Reminder',
    });

    expect(result.sent).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.byChannel.email).toEqual({ sent: 0, failed: 1 });
    expect(mockReminderRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        reminderStatus: ReminderStatus.FAILED,
        failureReason: 'SMTP down',
      }),
    );
  });

  it('skips parents that are not found', async () => {
    mockParentRepo.findById.mockResolvedValue(null);

    const result = await service.sendManualParentReminders({
      tenantId,
      parentIds: [parentId],
      channel: DeliveryChannel.EMAIL,
      template: 'Reminder',
    });

    expect(result.skipped).toBe(1);
    expect(result.sent).toBe(0);
    expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    expect(mockReminderRepo.create).not.toHaveBeenCalled();
  });

  it('skips parents with no overdue unpaid invoices', async () => {
    mockPrisma.invoice.findMany.mockResolvedValue([
      { ...overdueInvoice, amountPaidCents: 150000 }, // fully paid
    ]);

    const result = await service.sendManualParentReminders({
      tenantId,
      parentIds: [parentId],
      channel: DeliveryChannel.EMAIL,
      template: 'Reminder',
    });

    expect(result.skipped).toBe(1);
    expect(result.details[0]).toEqual(
      expect.objectContaining({ status: 'SKIPPED', error: 'No overdue invoices' }),
    );
    expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
  });

  it('falls back to the escalation-level template when no template is provided', async () => {
    mockPrisma.invoice.findUnique.mockResolvedValue({
      ...overdueInvoice,
      parent,
      child: { firstName: 'Tommy', lastName: 'Doe' },
      tenant: {
        name: 'Elle Elephant',
        phone: '+27110000000',
        email: 'admin@elle.co.za',
      },
    });

    const result = await service.sendManualParentReminders({
      tenantId,
      parentIds: [parentId],
      channel: DeliveryChannel.EMAIL,
    });

    expect(result.sent).toBe(1);
    // Default templates reference the invoice number
    const [, subject, body] = mockEmailService.sendEmail.mock.calls[0];
    expect(`${subject} ${body}`).toContain('INV-2026-001');
  });

  it('processes remaining parents when one throws', async () => {
    mockParentRepo.findById
      .mockRejectedValueOnce(new Error('DB error'))
      .mockResolvedValueOnce(parent);

    const result = await service.sendManualParentReminders({
      tenantId,
      parentIds: ['parent-broken', parentId],
      channel: DeliveryChannel.EMAIL,
      template: 'Reminder',
    });

    expect(result.failed).toBe(1);
    expect(result.sent).toBe(1);
  });
});
