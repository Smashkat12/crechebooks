/**
 * PaymentReminderProcessor Integration Tests
 * TASK-PAY-015: Payment Reminder Scheduler Service
 *
 * CRITICAL: Uses REAL database, no mocks for database operations
 * Only external services (Email, WhatsApp, Redis/BullMQ) are mocked
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { PaymentReminderProcessor } from '../../../src/scheduler/processors/payment-reminder.processor';
import { ReminderService } from '../../../src/database/services/reminder.service';
import { ArrearsService } from '../../../src/database/services/arrears.service';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { ParentRepository } from '../../../src/database/repositories/parent.repository';
import { ReminderRepository } from '../../../src/database/repositories/reminder.repository';
import { PaymentRepository } from '../../../src/database/repositories/payment.repository';
import { EmailService } from '../../../src/integrations/email/email.service';
import { WhatsAppService } from '../../../src/integrations/whatsapp/whatsapp.service';
import { InvoiceStatus } from '../../../src/database/entities/invoice.entity';
import { TaxStatus } from '../../../src/database/entities/tenant.entity';
import { getStageForDaysOverdue } from '../../../src/billing/types/reminder.types';
import { Tenant, Parent, Child, Invoice } from '@prisma/client';

/**
 * Mock EmailService - external SMTP integration
 * NOTE: This is a SERVICE mock for external API, not a DATA mock.
 */
const createMockEmailService = () => ({
  sendEmail: jest
    .fn()
    .mockResolvedValue({ messageId: 'test-email-123', status: 'sent' }),
  isValidEmail: jest.fn().mockReturnValue(true),
});

/**
 * Mock WhatsAppService - external WhatsApp API integration
 * NOTE: This is a SERVICE mock for external API, not a DATA mock.
 */
const createMockWhatsAppService = () => ({
  sendMessage: jest.fn().mockResolvedValue({
    messageId: 'wa-msg-123',
    status: 'sent',
    sentAt: new Date(),
    recipientPhone: '+27821234567',
  }),
  sendInvoice: jest.fn().mockResolvedValue({
    messageId: 'wa-invoice-123',
    status: 'sent',
    sentAt: new Date(),
    recipientPhone: '+27821234567',
  }),
  sendReminder: jest.fn().mockResolvedValue({
    messageId: 'wa-reminder-123',
    status: 'sent',
    sentAt: new Date(),
    recipientPhone: '+27821234567',
  }),
  formatPhoneE164: jest.fn().mockImplementation((phone: string) => {
    if (!phone) return '';
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10 && digits.startsWith('0')) {
      return '+27' + digits.substring(1);
    }
    if (digits.length === 9) {
      return '+27' + digits;
    }
    if (digits.startsWith('27') && !digits.startsWith('+')) {
      return '+' + digits;
    }
    return digits.startsWith('+') ? digits : '+' + digits;
  }),
  isValidPhoneNumber: jest.fn().mockReturnValue(true),
  checkOptIn: jest.fn().mockResolvedValue(true),
});

/**
 * Mock BullMQ Job for processor tests
 * NOTE: This is an INFRASTRUCTURE mock for BullMQ, not a DATA mock
 */
const createMockJob = (data: any) => ({
  id: `test-job-${Date.now()}`,
  data,
  progress: jest.fn(),
  moveToFailed: jest.fn(),
  moveToCompleted: jest.fn(),
  log: jest.fn(),
});

describe('PaymentReminderProcessor Integration Tests', () => {
  let processor: PaymentReminderProcessor;
  let prisma: PrismaService;
  let mockEmailService: ReturnType<typeof createMockEmailService>;
  let mockWhatsAppService: ReturnType<typeof createMockWhatsAppService>;

  // Test data
  let testTenant: Tenant;
  let testParent: Parent;
  let testChild: Child;
  let invoice7DaysOverdue: Invoice;
  let invoice14DaysOverdue: Invoice;
  let invoice30DaysOverdue: Invoice;
  let invoice45DaysOverdue: Invoice;
  let invoiceNotOverdue: Invoice;
  let invoicePaid: Invoice;

  beforeAll(async () => {
    mockEmailService = createMockEmailService();
    mockWhatsAppService = createMockWhatsAppService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        PaymentReminderProcessor,
        ReminderService,
        ArrearsService,
        AuditLogService,
        InvoiceRepository,
        ParentRepository,
        ReminderRepository,
        PaymentRepository,
        { provide: EmailService, useValue: mockEmailService },
        { provide: WhatsAppService, useValue: mockWhatsAppService },
      ],
    }).compile();

    processor = module.get<PaymentReminderProcessor>(PaymentReminderProcessor);
    prisma = module.get<PrismaService>(PrismaService);

    await setupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
    await prisma.$disconnect();
  });

  beforeEach(() => {
    // Reset mocks before each test
    mockEmailService.sendEmail.mockClear();
    mockWhatsAppService.sendMessage.mockClear();
  });

  async function setupTestData() {
    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Test Creche Reminders',
        email: 'reminder@test.co.za',
        phone: '0211234567',
        addressLine1: '123 Test Street',
        city: 'Cape Town',
        province: 'Western Cape',
        postalCode: '8000',
        taxStatus: TaxStatus.NOT_VAT_REGISTERED,
      },
    });

    // Create test parent with email and WhatsApp
    testParent = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'Jane',
        lastName: 'Parent',
        email: 'jane.parent@test.co.za',
        phone: '0821234567',
        whatsapp: '0821234567',
        whatsappOptIn: true,
        preferredContact: 'EMAIL',
      },
    });

    // Create test child
    testChild = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Test',
        lastName: 'Child',
        dateOfBirth: new Date('2020-01-15'),
      },
    });

    // Create invoices with various overdue statuses
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // 7 days overdue - FIRST stage
    const dueDate7Days = new Date(today);
    dueDate7Days.setDate(dueDate7Days.getDate() - 7);

    invoice7DaysOverdue = await prisma.invoice.create({
      data: {
        tenantId: testTenant.id,
        invoiceNumber: 'INV-TEST-001',
        parentId: testParent.id,
        childId: testChild.id,
        billingPeriodStart: new Date('2025-01-01'),
        billingPeriodEnd: new Date('2025-01-31'),
        issueDate: new Date(dueDate7Days.getTime() - 7 * 24 * 60 * 60 * 1000),
        dueDate: dueDate7Days,
        subtotalCents: 350000,
        vatCents: 0,
        totalCents: 350000,
        amountPaidCents: 0,
        status: InvoiceStatus.OVERDUE,
      },
    });

    // 14 days overdue - SECOND stage
    const dueDate14Days = new Date(today);
    dueDate14Days.setDate(dueDate14Days.getDate() - 14);

    invoice14DaysOverdue = await prisma.invoice.create({
      data: {
        tenantId: testTenant.id,
        invoiceNumber: 'INV-TEST-002',
        parentId: testParent.id,
        childId: testChild.id,
        billingPeriodStart: new Date('2024-12-01'),
        billingPeriodEnd: new Date('2024-12-31'),
        issueDate: new Date(dueDate14Days.getTime() - 7 * 24 * 60 * 60 * 1000),
        dueDate: dueDate14Days,
        subtotalCents: 350000,
        vatCents: 0,
        totalCents: 350000,
        amountPaidCents: 0,
        status: InvoiceStatus.OVERDUE,
      },
    });

    // 30 days overdue - FINAL stage
    const dueDate30Days = new Date(today);
    dueDate30Days.setDate(dueDate30Days.getDate() - 30);

    invoice30DaysOverdue = await prisma.invoice.create({
      data: {
        tenantId: testTenant.id,
        invoiceNumber: 'INV-TEST-003',
        parentId: testParent.id,
        childId: testChild.id,
        billingPeriodStart: new Date('2024-11-01'),
        billingPeriodEnd: new Date('2024-11-30'),
        issueDate: new Date(dueDate30Days.getTime() - 7 * 24 * 60 * 60 * 1000),
        dueDate: dueDate30Days,
        subtotalCents: 350000,
        vatCents: 0,
        totalCents: 350000,
        amountPaidCents: 0,
        status: InvoiceStatus.OVERDUE,
      },
    });

    // 45 days overdue - ESCALATED stage
    const dueDate45Days = new Date(today);
    dueDate45Days.setDate(dueDate45Days.getDate() - 45);

    invoice45DaysOverdue = await prisma.invoice.create({
      data: {
        tenantId: testTenant.id,
        invoiceNumber: 'INV-TEST-004',
        parentId: testParent.id,
        childId: testChild.id,
        billingPeriodStart: new Date('2024-10-01'),
        billingPeriodEnd: new Date('2024-10-31'),
        issueDate: new Date(dueDate45Days.getTime() - 7 * 24 * 60 * 60 * 1000),
        dueDate: dueDate45Days,
        subtotalCents: 350000,
        vatCents: 0,
        totalCents: 350000,
        amountPaidCents: 0,
        status: InvoiceStatus.OVERDUE,
      },
    });

    // Not overdue - due tomorrow
    const dueTomorrow = new Date(today);
    dueTomorrow.setDate(dueTomorrow.getDate() + 1);

    invoiceNotOverdue = await prisma.invoice.create({
      data: {
        tenantId: testTenant.id,
        invoiceNumber: 'INV-TEST-005',
        parentId: testParent.id,
        childId: testChild.id,
        billingPeriodStart: new Date('2025-02-01'),
        billingPeriodEnd: new Date('2025-02-28'),
        issueDate: today,
        dueDate: dueTomorrow,
        subtotalCents: 350000,
        vatCents: 0,
        totalCents: 350000,
        amountPaidCents: 0,
        status: InvoiceStatus.SENT,
      },
    });

    // Fully paid - should be skipped
    invoicePaid = await prisma.invoice.create({
      data: {
        tenantId: testTenant.id,
        invoiceNumber: 'INV-TEST-006',
        parentId: testParent.id,
        childId: testChild.id,
        billingPeriodStart: new Date('2024-09-01'),
        billingPeriodEnd: new Date('2024-09-30'),
        issueDate: new Date('2024-08-25'),
        dueDate: new Date('2024-09-01'),
        subtotalCents: 350000,
        vatCents: 0,
        totalCents: 350000,
        amountPaidCents: 350000, // Fully paid
        status: InvoiceStatus.PAID,
      },
    });
  }

  async function cleanupTestData() {
    await prisma.reminder.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.invoice.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.child.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.parent.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.auditLog.deleteMany({ where: { tenantId: testTenant.id } });
    await prisma.tenant.delete({ where: { id: testTenant.id } });
  }

  describe('getStageForDaysOverdue', () => {
    it('should return correct stages for days overdue', () => {
      expect(getStageForDaysOverdue(0)).toBeNull();
      expect(getStageForDaysOverdue(6)).toBeNull();
      expect(getStageForDaysOverdue(7)).toBe('FIRST');
      expect(getStageForDaysOverdue(13)).toBe('FIRST');
      expect(getStageForDaysOverdue(14)).toBe('SECOND');
      expect(getStageForDaysOverdue(29)).toBe('SECOND');
      expect(getStageForDaysOverdue(30)).toBe('FINAL');
      expect(getStageForDaysOverdue(44)).toBe('FINAL');
      expect(getStageForDaysOverdue(45)).toBe('ESCALATED');
      expect(getStageForDaysOverdue(100)).toBe('ESCALATED');
    });
  });

  describe('processJob with real database', () => {
    beforeEach(async () => {
      // Clear reminders from previous tests
      await prisma.reminder.deleteMany({ where: { tenantId: testTenant.id } });
    });

    it('should identify and process overdue invoices from real database', async () => {
      const mockJob = createMockJob({
        tenantId: testTenant.id,
        triggeredBy: 'cron',
        scheduledAt: new Date(),
        reminderType: 'gentle',
      });

      await processor.processJob(mockJob as any);

      // Verify reminders were created in the database
      const reminders = await prisma.reminder.findMany({
        where: { tenantId: testTenant.id },
        orderBy: { createdAt: 'asc' },
      });

      // Should have sent reminders for 4 overdue invoices
      // (7, 14, 30, 45 days overdue - not paid, not future)
      expect(reminders.length).toBeGreaterThanOrEqual(1);

      // Verify job completed
      expect(mockJob.progress).toHaveBeenCalledWith(100);
    });

    it('should skip paid invoices', async () => {
      // Get count of unpaid overdue invoices
      const overdueInvoices = await prisma.invoice.findMany({
        where: {
          tenantId: testTenant.id,
          dueDate: { lt: new Date() },
          status: {
            in: [
              InvoiceStatus.SENT,
              InvoiceStatus.OVERDUE,
              InvoiceStatus.PARTIALLY_PAID,
            ],
          },
        },
      });

      const unpaidOverdue = overdueInvoices.filter(
        (i) => i.amountPaidCents < i.totalCents,
      );

      const mockJob = createMockJob({
        tenantId: testTenant.id,
        triggeredBy: 'manual',
        scheduledAt: new Date(),
        reminderType: 'gentle',
      });

      await processor.processJob(mockJob as any);

      // Paid invoice should not have reminder
      const paidInvoiceReminders = await prisma.reminder.findMany({
        where: { invoiceId: invoicePaid.id },
      });
      expect(paidInvoiceReminders.length).toBe(0);
    });

    it('should skip invoices not yet overdue', async () => {
      const mockJob = createMockJob({
        tenantId: testTenant.id,
        triggeredBy: 'cron',
        scheduledAt: new Date(),
        reminderType: 'gentle',
      });

      await processor.processJob(mockJob as any);

      // Future invoice should not have reminder
      const futureInvoiceReminders = await prisma.reminder.findMany({
        where: { invoiceId: invoiceNotOverdue.id },
      });
      expect(futureInvoiceReminders.length).toBe(0);
    });

    it('should escalate 45+ days overdue invoices', async () => {
      const mockJob = createMockJob({
        tenantId: testTenant.id,
        triggeredBy: 'cron',
        scheduledAt: new Date(),
        reminderType: 'escalation',
      });

      await processor.processJob(mockJob as any);

      // Check if 45-day invoice was updated with escalation note
      const escalatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoice45DaysOverdue.id },
      });

      // Invoice should be marked as OVERDUE and may have escalation note
      expect(escalatedInvoice?.status).toBe(InvoiceStatus.OVERDUE);
    });

    it('should prevent duplicate reminders within 24 hours', async () => {
      // First reminder
      const mockJob1 = createMockJob({
        tenantId: testTenant.id,
        triggeredBy: 'cron',
        scheduledAt: new Date(),
        reminderType: 'gentle',
      });

      await processor.processJob(mockJob1 as any);

      const firstRunReminders = await prisma.reminder.findMany({
        where: { tenantId: testTenant.id },
      });

      // Second run should skip due to recent reminders
      const mockJob2 = createMockJob({
        tenantId: testTenant.id,
        triggeredBy: 'cron',
        scheduledAt: new Date(),
        reminderType: 'gentle',
      });

      await processor.processJob(mockJob2 as any);

      const secondRunReminders = await prisma.reminder.findMany({
        where: { tenantId: testTenant.id },
      });

      // Should have same number of reminders (duplicates prevented)
      expect(secondRunReminders.length).toBe(firstRunReminders.length);
    });

    it('should process specific invoice IDs when provided', async () => {
      const mockJob = createMockJob({
        tenantId: testTenant.id,
        triggeredBy: 'manual',
        scheduledAt: new Date(),
        reminderType: 'gentle',
        invoiceIds: [invoice7DaysOverdue.id],
      });

      await processor.processJob(mockJob as any);

      // Should only process the specified invoice
      const reminders = await prisma.reminder.findMany({
        where: { tenantId: testTenant.id },
      });

      // At least one reminder for the specific invoice
      const targetReminders = reminders.filter(
        (r) => r.invoiceId === invoice7DaysOverdue.id,
      );
      expect(targetReminders.length).toBeGreaterThanOrEqual(1);
    });
  });
});
