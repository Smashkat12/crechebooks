/**
 * InvoiceDeliveryService Integration Tests
 * TASK-BILL-013: Invoice Delivery Service
 *
 * CRITICAL: Uses REAL database, no mocks for database operations
 * Only external services (Email, WhatsApp) are mocked as they require real API credentials
 */
import 'dotenv/config';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../src/database/prisma/prisma.service';
import { InvoiceDeliveryService } from '../../../src/database/services/invoice-delivery.service';
import { InvoiceRepository } from '../../../src/database/repositories/invoice.repository';
import { InvoiceLineRepository } from '../../../src/database/repositories/invoice-line.repository';
import { ParentRepository } from '../../../src/database/repositories/parent.repository';
import { ChildRepository } from '../../../src/database/repositories/child.repository';
import { TenantRepository } from '../../../src/database/repositories/tenant.repository';
import { AuditLogService } from '../../../src/database/services/audit-log.service';
import { EmailService } from '../../../src/integrations/email/email.service';
import { WhatsAppService } from '../../../src/integrations/whatsapp/whatsapp.service';
import { EmailTemplateService } from '../../../src/common/services/email-template/email-template.service';
import { InvoicePdfService } from '../../../src/database/services/invoice-pdf.service';
import {
  NotFoundException,
  BusinessException,
} from '../../../src/shared/exceptions';
import {
  DeliveryStatus,
  DeliveryMethod,
  InvoiceStatus,
} from '../../../src/database/entities/invoice.entity';
import { PreferredContact } from '../../../src/database/entities/parent.entity';
import { TaxStatus } from '../../../src/database/entities/tenant.entity';
import { Tenant, Parent, Child, Invoice } from '@prisma/client';
import { cleanDatabase } from '../../helpers/clean-database';

/**
 * Mock EmailService - external SMTP integration
 * NOTE: This is a SERVICE mock for external API, not a DATA mock.
 * The SMTP server requires real credentials which are not available in tests.
 */
const createMockEmailService = () => ({
  sendEmail: jest
    .fn()
    .mockResolvedValue({ messageId: 'test-msg-123', status: 'sent' }),
  sendEmailWithOptions: jest
    .fn()
    .mockResolvedValue({ messageId: 'test-msg-123', status: 'sent' }),
  isValidEmail: jest.fn().mockReturnValue(true),
  isConfigured: jest.fn().mockReturnValue(true),
});

/**
 * Mock EmailTemplateService - template rendering requires filesystem templates
 * that are not available in the test environment.
 * NOTE: This is a SERVICE mock for infrastructure dependency, not a DATA mock.
 */
const createMockEmailTemplateService = () => ({
  renderInvoiceEmail: jest.fn().mockImplementation((data: any) => {
    const lineDescriptions = (data.lineItems || [])
      .map((li: any) => li.description)
      .join(', ');
    const totalRands = (data.totalCents / 100).toFixed(2);
    const formattedAmount = `R ${Number(totalRands).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
    return {
      text: `Invoice ${data.invoiceNumber}\n${lineDescriptions}\nTotal: ${formattedAmount}`,
      html: `<p>Invoice ${data.invoiceNumber}</p><p>${lineDescriptions}</p><p>Total: ${formattedAmount}</p>`,
      subject: `Invoice ${data.invoiceNumber} from ${data.tenantName}`,
    };
  }),
  renderStatementEmail: jest.fn().mockReturnValue({
    text: 'Statement',
    html: '<p>Statement</p>',
    subject: 'Statement',
  }),
  onModuleInit: jest.fn(),
});

/**
 * Mock WhatsAppService - external WhatsApp API integration
 * NOTE: This is a SERVICE mock for external API, not a DATA mock.
 */
const createMockWhatsAppService = () => ({
  sendMessage: jest
    .fn()
    .mockResolvedValue({ messageId: 'wa-msg-123', status: 'sent' }),
  sanitizePhoneNumber: jest.fn().mockImplementation((phone: string) => {
    let digits = phone.replace(/\D/g, '');
    if (digits.length === 10 && digits.startsWith('0')) {
      digits = '27' + digits.substring(1);
    }
    return digits;
  }),
  isValidPhoneNumber: jest.fn().mockReturnValue(true),
});

describe('InvoiceDeliveryService', () => {
  let service: InvoiceDeliveryService;
  let prisma: PrismaService;
  let invoiceRepo: InvoiceRepository;
  let mockEmailService: ReturnType<typeof createMockEmailService>;
  let mockWhatsAppService: ReturnType<typeof createMockWhatsAppService>;
  let mockEmailTemplateService: ReturnType<typeof createMockEmailTemplateService>;

  // Test data
  let testTenant: Tenant;
  let testParentEmail: Parent;
  let testParentWhatsApp: Parent;
  let testParentBoth: Parent;
  let testParentNone: Parent;
  let testChild1: Child;
  let testChild2: Child;
  let testChild3: Child;
  let testChild4: Child;
  let testInvoice1: Invoice;
  let testInvoice2: Invoice;
  let testInvoice3: Invoice;
  let testInvoiceFailed: Invoice;

  beforeAll(async () => {
    mockEmailService = createMockEmailService();
    mockWhatsAppService = createMockWhatsAppService();
    mockEmailTemplateService = createMockEmailTemplateService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PrismaService,
        InvoiceDeliveryService,
        InvoiceRepository,
        InvoiceLineRepository,
        ParentRepository,
        TenantRepository,
        ChildRepository,
        AuditLogService,
        // Mock EmailTemplateService - requires filesystem templates not available in tests
        { provide: EmailTemplateService, useValue: mockEmailTemplateService },
        // Mock external services that require real API credentials
        { provide: EmailService, useValue: mockEmailService },
        { provide: WhatsAppService, useValue: mockWhatsAppService },
        { provide: InvoicePdfService, useValue: { generatePdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')), generateInvoicePdf: jest.fn().mockResolvedValue(Buffer.from('mock-pdf')) } },
      ],
    }).compile();

    service = module.get<InvoiceDeliveryService>(InvoiceDeliveryService);
    prisma = module.get<PrismaService>(PrismaService);
    invoiceRepo = module.get<InvoiceRepository>(InvoiceRepository);

    await prisma.onModuleInit();
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });

  beforeEach(async () => {
    // Reset mocks
    jest.clearAllMocks();
    mockEmailService.sendEmail.mockResolvedValue({
      messageId: 'test-msg-123',
      status: 'sent',
    });
    mockEmailService.sendEmailWithOptions.mockResolvedValue({
      messageId: 'test-msg-123',
      status: 'sent',
    });
    mockWhatsAppService.sendMessage.mockResolvedValue({
      messageId: 'wa-msg-123',
      status: 'sent',
    });

    await cleanDatabase(prisma);

    const timestamp = Date.now();

    // Create test tenant
    testTenant = await prisma.tenant.create({
      data: {
        name: 'Delivery Test Creche',
        addressLine1: '123 Test Street',
        city: 'Johannesburg',
        province: 'Gauteng',
        postalCode: '2196',
        phone: '+27115551234',
        email: `delivery${timestamp}@test.co.za`,
        taxStatus: TaxStatus.NOT_REGISTERED,
        invoiceDayOfMonth: 1,
        invoiceDueDays: 7,
      },
    });

    // Create test parents with different contact preferences
    testParentEmail = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'Email',
        lastName: 'Parent',
        email: `emailparent${timestamp}@test.com`,
        phone: '0821234567',
        preferredContact: PreferredContact.EMAIL,
      },
    });

    testParentWhatsApp = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'WhatsApp',
        lastName: 'Parent',
        phone: '0829876543',
        whatsapp: '0829876543',
        preferredContact: PreferredContact.WHATSAPP,
      },
    });

    testParentBoth = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'Both',
        lastName: 'Parent',
        email: `bothparent${timestamp}@test.com`,
        phone: '0825555555',
        whatsapp: '0825555555',
        preferredContact: PreferredContact.BOTH,
      },
    });

    testParentNone = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'No',
        lastName: 'Contact',
        phone: '0820000000',
        preferredContact: PreferredContact.EMAIL, // but no email set
      },
    });

    // Create test children
    testChild1 = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParentEmail.id,
        firstName: 'Email',
        lastName: 'Child',
        dateOfBirth: new Date('2020-01-15'),
      },
    });

    testChild2 = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParentWhatsApp.id,
        firstName: 'WhatsApp',
        lastName: 'Child',
        dateOfBirth: new Date('2020-02-20'),
      },
    });

    testChild3 = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParentBoth.id,
        firstName: 'Both',
        lastName: 'Child',
        dateOfBirth: new Date('2020-03-25'),
      },
    });

    testChild4 = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParentNone.id,
        firstName: 'NoContact',
        lastName: 'Child',
        dateOfBirth: new Date('2020-04-30'),
      },
    });

    // Create test invoices
    const billingStart = new Date('2025-01-01');
    const billingEnd = new Date('2025-01-31');
    const issueDate = new Date('2025-01-01');
    const dueDate = new Date('2025-01-08');

    testInvoice1 = await prisma.invoice.create({
      data: {
        tenantId: testTenant.id,
        invoiceNumber: 'INV-2025-001',
        parentId: testParentEmail.id,
        childId: testChild1.id,
        billingPeriodStart: billingStart,
        billingPeriodEnd: billingEnd,
        issueDate,
        dueDate,
        subtotalCents: 500000,
        vatCents: 0,
        totalCents: 500000,
        status: InvoiceStatus.DRAFT,
      },
    });

    // Add invoice line
    await prisma.invoiceLine.create({
      data: {
        invoiceId: testInvoice1.id,
        description: 'Monthly School Fee',
        quantity: 1,
        unitPriceCents: 500000,
        discountCents: 0,
        subtotalCents: 500000,
        vatCents: 0,
        totalCents: 500000,
        lineType: 'MONTHLY_FEE',
        sortOrder: 0,
      },
    });

    testInvoice2 = await prisma.invoice.create({
      data: {
        tenantId: testTenant.id,
        invoiceNumber: 'INV-2025-002',
        parentId: testParentWhatsApp.id,
        childId: testChild2.id,
        billingPeriodStart: billingStart,
        billingPeriodEnd: billingEnd,
        issueDate,
        dueDate,
        subtotalCents: 450000,
        vatCents: 0,
        totalCents: 450000,
        status: InvoiceStatus.DRAFT,
      },
    });

    await prisma.invoiceLine.create({
      data: {
        invoiceId: testInvoice2.id,
        description: 'Monthly School Fee',
        quantity: 1,
        unitPriceCents: 450000,
        discountCents: 0,
        subtotalCents: 450000,
        vatCents: 0,
        totalCents: 450000,
        lineType: 'MONTHLY_FEE',
        sortOrder: 0,
      },
    });

    testInvoice3 = await prisma.invoice.create({
      data: {
        tenantId: testTenant.id,
        invoiceNumber: 'INV-2025-003',
        parentId: testParentBoth.id,
        childId: testChild3.id,
        billingPeriodStart: billingStart,
        billingPeriodEnd: billingEnd,
        issueDate,
        dueDate,
        subtotalCents: 400000,
        vatCents: 0,
        totalCents: 400000,
        status: InvoiceStatus.DRAFT,
      },
    });

    await prisma.invoiceLine.create({
      data: {
        invoiceId: testInvoice3.id,
        description: 'Monthly School Fee',
        quantity: 1,
        unitPriceCents: 400000,
        discountCents: 0,
        subtotalCents: 400000,
        vatCents: 0,
        totalCents: 400000,
        lineType: 'MONTHLY_FEE',
        sortOrder: 0,
      },
    });

    // Create failed invoice for retry tests
    testInvoiceFailed = await prisma.invoice.create({
      data: {
        tenantId: testTenant.id,
        invoiceNumber: 'INV-2025-004',
        parentId: testParentEmail.id,
        childId: testChild1.id,
        billingPeriodStart: new Date('2025-02-01'),
        billingPeriodEnd: new Date('2025-02-28'),
        issueDate: new Date('2025-02-01'),
        dueDate: new Date('2025-02-08'),
        subtotalCents: 500000,
        vatCents: 0,
        totalCents: 500000,
        status: InvoiceStatus.DRAFT,
        deliveryStatus: DeliveryStatus.FAILED,
        deliveryRetryCount: 0,
      },
    });

    await prisma.invoiceLine.create({
      data: {
        invoiceId: testInvoiceFailed.id,
        description: 'Monthly School Fee',
        quantity: 1,
        unitPriceCents: 500000,
        discountCents: 0,
        subtotalCents: 500000,
        vatCents: 0,
        totalCents: 500000,
        lineType: 'MONTHLY_FEE',
        sortOrder: 0,
      },
    });
  });

  describe('sendInvoices', () => {
    it('should send invoice via email when parent prefers email', async () => {
      const result = await service.sendInvoices({
        tenantId: testTenant.id,
        invoiceIds: [testInvoice1.id],
      });

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.failures).toHaveLength(0);

      expect(mockEmailService.sendEmailWithOptions).toHaveBeenCalledTimes(1);
      expect(mockEmailService.sendEmailWithOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          to: testParentEmail.email,
          subject: expect.stringContaining('INV-2025-001'),
        }),
      );

      // Verify invoice was updated
      const updatedInvoice = await invoiceRepo.findById(
        testInvoice1.id,
        testTenant.id,
      );
      expect(updatedInvoice?.deliveryStatus).toBe(DeliveryStatus.SENT);
      expect(updatedInvoice?.deliveredAt).toBeTruthy();
    });

    it('should send invoice via WhatsApp when parent prefers WhatsApp', async () => {
      const result = await service.sendInvoices({
        tenantId: testTenant.id,
        invoiceIds: [testInvoice2.id],
      });

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);

      expect(mockWhatsAppService.sendMessage).toHaveBeenCalledTimes(1);
      expect(mockWhatsAppService.sendMessage).toHaveBeenCalledWith(
        testParentWhatsApp.whatsapp,
        expect.stringContaining('INV-2025-002'),
      );

      const updatedInvoice = await invoiceRepo.findById(
        testInvoice2.id,
        testTenant.id,
      );
      expect(updatedInvoice?.deliveryStatus).toBe(DeliveryStatus.SENT);
    });

    it('should send invoice via both channels when parent prefers both', async () => {
      const result = await service.sendInvoices({
        tenantId: testTenant.id,
        invoiceIds: [testInvoice3.id],
      });

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);

      expect(mockEmailService.sendEmailWithOptions).toHaveBeenCalledTimes(1);
      expect(mockWhatsAppService.sendMessage).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple invoices in batch', async () => {
      const result = await service.sendInvoices({
        tenantId: testTenant.id,
        invoiceIds: [testInvoice1.id, testInvoice2.id, testInvoice3.id],
      });

      expect(result.sent).toBe(3);
      expect(result.failed).toBe(0);
    });

    it('should return empty result for empty invoice list', async () => {
      const result = await service.sendInvoices({
        tenantId: testTenant.id,
        invoiceIds: [],
      });

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.failures).toHaveLength(0);
    });

    it('should override delivery method when specified', async () => {
      const result = await service.sendInvoices({
        tenantId: testTenant.id,
        invoiceIds: [testInvoice1.id],
        method: DeliveryMethod.WHATSAPP,
      });

      // Should fail because testParentEmail has no whatsapp
      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.failures[0].code).toBe('NO_WHATSAPP_NUMBER');
    });
  });

  describe('deliverInvoice', () => {
    it('should throw NotFoundException for non-existent invoice', async () => {
      await expect(
        service.deliverInvoice(testTenant.id, 'non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException for invoice from different tenant', async () => {
      // Create invoice in different tenant
      const otherTenant = await prisma.tenant.create({
        data: {
          name: 'Other Creche',
          addressLine1: '999 Other Street',
          city: 'Other City',
          province: 'Other Province',
          postalCode: '9999',
          phone: '+27999999999',
          email: `other${Date.now()}@test.co.za`,
          taxStatus: TaxStatus.NOT_REGISTERED,
        },
      });

      // Try to access testInvoice1 with wrong tenant
      await expect(
        service.deliverInvoice(otherTenant.id, testInvoice1.id),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BusinessException when parent has no email but prefers email', async () => {
      // Create invoice for parent with no email
      const invoice = await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-2025-099',
          parentId: testParentNone.id,
          childId: testChild4.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-01'),
          dueDate: new Date('2025-01-08'),
          subtotalCents: 100000,
          vatCents: 0,
          totalCents: 100000,
          status: InvoiceStatus.DRAFT,
        },
      });

      await prisma.invoiceLine.create({
        data: {
          invoiceId: invoice.id,
          description: 'Test Fee',
          quantity: 1,
          unitPriceCents: 100000,
          discountCents: 0,
          subtotalCents: 100000,
          vatCents: 0,
          totalCents: 100000,
          lineType: 'MONTHLY_FEE',
          sortOrder: 0,
        },
      });

      await expect(
        service.deliverInvoice(testTenant.id, invoice.id),
      ).rejects.toThrow(BusinessException);
    });

    it('should track delivery failure when email service fails', async () => {
      mockEmailService.sendEmailWithOptions.mockRejectedValueOnce(
        new BusinessException('SMTP connection failed', 'EMAIL_SEND_FAILED'),
      );

      await expect(
        service.deliverInvoice(testTenant.id, testInvoice1.id),
      ).rejects.toThrow(BusinessException);

      const updatedInvoice = await invoiceRepo.findById(
        testInvoice1.id,
        testTenant.id,
      );
      expect(updatedInvoice?.deliveryStatus).toBe(DeliveryStatus.FAILED);
    });

    it('should succeed if at least one channel works for BOTH preference', async () => {
      // WhatsApp fails but email succeeds
      mockWhatsAppService.sendMessage.mockRejectedValueOnce(
        new BusinessException('WhatsApp failed', 'WHATSAPP_SEND_FAILED'),
      );

      await service.deliverInvoice(testTenant.id, testInvoice3.id);

      const updatedInvoice = await invoiceRepo.findById(
        testInvoice3.id,
        testTenant.id,
      );
      expect(updatedInvoice?.deliveryStatus).toBe(DeliveryStatus.SENT);
    });
  });

  describe('retryFailed', () => {
    it('should retry failed invoices', async () => {
      const result = await service.retryFailed({
        tenantId: testTenant.id,
        maxAgeHours: 24,
      });

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);

      const updatedInvoice = await invoiceRepo.findById(
        testInvoiceFailed.id,
        testTenant.id,
      );
      expect(updatedInvoice?.deliveryStatus).toBe(DeliveryStatus.SENT);
      expect(updatedInvoice?.deliveryRetryCount).toBe(1);
    });

    it('should skip invoices that exceed max retry count', async () => {
      // Set retry count to max
      await prisma.invoice.update({
        where: { id: testInvoiceFailed.id },
        data: { deliveryRetryCount: 3 },
      });

      const result = await service.retryFailed({
        tenantId: testTenant.id,
      });

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.failures[0].code).toBe('MAX_RETRIES_EXCEEDED');
    });

    it('should increment retry count on each attempt', async () => {
      await service.retryFailed({ tenantId: testTenant.id });

      let updatedInvoice = await invoiceRepo.findById(
        testInvoiceFailed.id,
        testTenant.id,
      );
      expect(updatedInvoice?.deliveryRetryCount).toBe(1);

      // Fail the invoice again
      await prisma.invoice.update({
        where: { id: testInvoiceFailed.id },
        data: { deliveryStatus: DeliveryStatus.FAILED },
      });

      await service.retryFailed({ tenantId: testTenant.id });

      updatedInvoice = await invoiceRepo.findById(
        testInvoiceFailed.id,
        testTenant.id,
      );
      expect(updatedInvoice?.deliveryRetryCount).toBe(2);
    });

    it('should respect maxAgeHours filter', async () => {
      // Set invoice to be too old
      await prisma.invoice.update({
        where: { id: testInvoiceFailed.id },
        data: { updatedAt: new Date('2025-01-01') },
      });

      const result = await service.retryFailed({
        tenantId: testTenant.id,
        maxAgeHours: 1, // Only 1 hour
      });

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
    });

    it('should use default max age of 24 hours', async () => {
      const result = await service.retryFailed({
        tenantId: testTenant.id,
      });

      // Invoice is recent, should be processed
      expect(result.sent).toBe(1);
    });
  });

  describe('audit logging', () => {
    it('should create audit log on successful delivery', async () => {
      await service.sendInvoices({
        tenantId: testTenant.id,
        invoiceIds: [testInvoice1.id],
      });

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          entityType: 'Invoice',
          entityId: testInvoice1.id,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
      const latestLog = auditLogs[0];
      expect(latestLog.changeSummary).toContain('delivered');
      expect(latestLog.changeSummary).toContain('EMAIL');
    });

    it('should create audit log on failed delivery', async () => {
      mockEmailService.sendEmailWithOptions.mockRejectedValueOnce(
        new BusinessException('Send failed', 'EMAIL_SEND_FAILED'),
      );

      try {
        await service.sendInvoices({
          tenantId: testTenant.id,
          invoiceIds: [testInvoice1.id],
        });
      } catch {
        // Expected to fail
      }

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          tenantId: testTenant.id,
          entityType: 'Invoice',
          entityId: testInvoice1.id,
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
      const failLog = auditLogs.find((l) =>
        l.changeSummary?.includes('failed'),
      );
      expect(failLog).toBeTruthy();
    });
  });

  describe('message content', () => {
    it('should include invoice number in email subject', async () => {
      await service.sendInvoices({
        tenantId: testTenant.id,
        invoiceIds: [testInvoice1.id],
      });

      expect(mockEmailService.sendEmailWithOptions).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: expect.stringContaining('INV-2025-001'),
        }),
      );
    });

    it('should include total amount in message body', async () => {
      await service.sendInvoices({
        tenantId: testTenant.id,
        invoiceIds: [testInvoice1.id],
      });

      const callArgs = mockEmailService.sendEmailWithOptions.mock.calls[0][0];
      // Check both plain text body and HTML for the amount
      const body = callArgs.body || '';
      const html = callArgs.html || '';
      const content = body + html;
      // R5000 formatted as South African Rand
      expect(content).toMatch(/5[\s,.]?000/);
    });

    it('should include line items in message body', async () => {
      await service.sendInvoices({
        tenantId: testTenant.id,
        invoiceIds: [testInvoice1.id],
      });

      const callArgs = mockEmailService.sendEmailWithOptions.mock.calls[0][0];
      const body = callArgs.body || '';
      const html = callArgs.html || '';
      const content = body + html;
      expect(content).toContain('Monthly School Fee');
    });
  });
});
