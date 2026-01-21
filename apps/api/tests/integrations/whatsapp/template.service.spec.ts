/**
 * WhatsAppTemplateService Unit Tests
 * TASK-WA-002: WhatsApp Template Management Service
 *
 * Tests template validation, building, and compliance checking.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { WhatsAppTemplateService } from '../../../src/integrations/whatsapp/services/template.service';
import { WhatsAppTemplateName } from '../../../src/integrations/whatsapp/types/whatsapp.types';

describe('WhatsAppTemplateService', () => {
  let service: WhatsAppTemplateService;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WhatsAppTemplateService],
    }).compile();

    service = module.get<WhatsAppTemplateService>(WhatsAppTemplateService);
  });

  describe('getAvailableTemplates', () => {
    it('should return all available template names', () => {
      const templates = service.getAvailableTemplates();

      expect(templates).toContain('invoice_notification');
      expect(templates).toContain('invoice_reminder');
      expect(templates).toContain('payment_received');
      expect(templates).toContain('arrears_notice');
      expect(templates).toContain('registration_welcome');
      expect(templates).toContain('statement_notification');
      expect(templates.length).toBe(6);
    });
  });

  describe('getTemplate', () => {
    it('should return template definition by name', () => {
      const template = service.getTemplate('invoice_notification');

      expect(template).toBeDefined();
      expect(template?.name).toBe('invoice_notification');
      expect(template?.category).toBe('UTILITY');
      expect(template?.language).toBe('en');
    });

    it('should return undefined for unknown template', () => {
      const template = service.getTemplate(
        'unknown_template' as WhatsAppTemplateName,
      );
      expect(template).toBeUndefined();
    });
  });

  describe('validateParameters', () => {
    it('should validate valid invoice notification parameters', () => {
      const result = service.validateParameters('invoice_notification', {
        parentName: 'John',
        invoiceNumber: 'INV-001',
        childName: 'Jane',
        amount: 'R1,500.00',
        dueDate: new Date(),
        document: {
          link: 'https://example.com/invoice.pdf',
          filename: 'invoice.pdf',
        },
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should fail validation for missing required parameters', () => {
      const result = service.validateParameters('invoice_notification', {
        parentName: 'John',
        // Missing: invoiceNumber, childName, amount, dueDate
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some((e) => e.includes('invoiceNumber'))).toBe(true);
    });

    it('should fail validation for parameter exceeding max length', () => {
      const result = service.validateParameters('invoice_notification', {
        parentName: 'A'.repeat(100), // Exceeds maxLength of 50
        invoiceNumber: 'INV-001',
        childName: 'Jane',
        amount: 'R1,500.00',
        dueDate: new Date(),
      });

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('max length'))).toBe(true);
    });

    it('should warn for incorrect currency format', () => {
      const result = service.validateParameters('invoice_notification', {
        parentName: 'John',
        invoiceNumber: 'INV-001',
        childName: 'Jane',
        amount: 'invalid-amount',
        dueDate: new Date(),
      });

      expect(result.warnings.some((w) => w.includes('currency format'))).toBe(
        true,
      );
    });

    it('should fail for unknown template', () => {
      const result = service.validateParameters(
        'unknown' as WhatsAppTemplateName,
        {},
      );

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('not found'))).toBe(true);
    });
  });

  describe('checkOptInCompliance', () => {
    it('should allow sending when user has opted in', () => {
      const result = service.checkOptInCompliance('invoice_notification', true);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should deny sending when user has not opted in and template requires it', () => {
      const result = service.checkOptInCompliance(
        'invoice_notification',
        false,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('requires WhatsApp opt-in');
    });

    it('should allow welcome message without explicit opt-in', () => {
      const result = service.checkOptInCompliance(
        'registration_welcome',
        false,
      );

      expect(result.allowed).toBe(true);
    });
  });

  describe('buildTemplate', () => {
    it('should build invoice notification template', () => {
      const built = service.buildTemplate('invoice_notification', {
        parentName: 'John',
        invoiceNumber: 'INV-001',
        childName: 'Jane',
        amount: 'R1,500.00',
        dueDate: new Date('2026-01-31'),
        document: {
          link: 'https://example.com/invoice.pdf',
          filename: 'invoice.pdf',
        },
      });

      expect(built).toBeDefined();
      expect(built?.name).toBe('invoice_notification');
      expect(built?.language.code).toBe('en');
      expect(built?.components.length).toBeGreaterThan(0);

      // Check header component with document
      const headerComponent = built?.components.find(
        (c) => c.type === 'header',
      );
      expect(headerComponent).toBeDefined();
      expect(headerComponent?.parameters?.[0].type).toBe('document');

      // Check body component
      const bodyComponent = built?.components.find((c) => c.type === 'body');
      expect(bodyComponent).toBeDefined();
      expect(bodyComponent?.parameters?.length).toBe(5);
    });

    it('should build payment reminder template', () => {
      const built = service.buildTemplate('invoice_reminder', {
        parentName: 'John',
        invoiceNumber: 'INV-001',
        amount: 'R1,500.00',
        daysOverdue: '7 days',
        amountDue: 'R1,500.00',
        dueDate: new Date('2026-01-15'),
      });

      expect(built).toBeDefined();
      expect(built?.name).toBe('invoice_reminder');
    });

    it('should return null for unknown template', () => {
      const built = service.buildTemplate(
        'unknown' as WhatsAppTemplateName,
        {},
      );
      expect(built).toBeNull();
    });
  });

  describe('buildInvoiceNotification', () => {
    it('should build invoice notification with helper method', () => {
      const built = service.buildInvoiceNotification({
        parentName: 'John',
        invoiceNumber: 'INV-001',
        childName: 'Jane',
        amount: 'R1,500.00',
        dueDate: new Date('2026-01-31'),
        documentLink: 'https://example.com/invoice.pdf',
        documentFilename: 'invoice.pdf',
      });

      expect(built).toBeDefined();
      expect(built?.name).toBe('invoice_notification');
    });

    it('should build invoice notification without document', () => {
      const built = service.buildInvoiceNotification({
        parentName: 'John',
        invoiceNumber: 'INV-001',
        childName: 'Jane',
        amount: 'R1,500.00',
        dueDate: '2026-01-31',
      });

      expect(built).toBeDefined();
    });
  });

  describe('buildPaymentReminder', () => {
    it('should build payment reminder with helper method', () => {
      const built = service.buildPaymentReminder({
        parentName: 'John',
        invoiceNumber: 'INV-001',
        amount: 'R1,500.00',
        daysOverdue: 7,
        amountDue: 'R1,500.00',
        dueDate: new Date('2026-01-15'),
      });

      expect(built).toBeDefined();
      expect(built?.name).toBe('invoice_reminder');
    });
  });

  describe('buildPaymentReceived', () => {
    it('should build payment received confirmation', () => {
      const built = service.buildPaymentReceived({
        parentName: 'John',
        amount: 'R1,500.00',
        invoiceNumber: 'INV-001',
        reference: 'PAY-123',
        paymentDate: new Date(),
        balance: 'R0.00',
      });

      expect(built).toBeDefined();
      expect(built?.name).toBe('payment_received');
    });
  });

  describe('buildArrearsNotice', () => {
    it('should build arrears notice', () => {
      const built = service.buildArrearsNotice({
        parentName: 'John',
        daysInArrears: 30,
        totalOutstanding: 'R3,000.00',
        oldestInvoice: 'INV-001',
      });

      expect(built).toBeDefined();
      expect(built?.name).toBe('arrears_notice');
    });
  });

  describe('buildWelcomeMessage', () => {
    it('should build welcome message', () => {
      const built = service.buildWelcomeMessage({
        crecheName: 'Happy Kids Daycare',
        parentName: 'John',
        childName: 'Jane',
      });

      expect(built).toBeDefined();
      expect(built?.name).toBe('registration_welcome');
    });
  });

  describe('getComplianceInfo', () => {
    it('should return compliance info for template', () => {
      const info = service.getComplianceInfo('invoice_notification');

      expect(info).toBeDefined();
      expect(info?.requiresOptIn).toBe(true);
      expect(info?.dataRetentionDays).toBe(365);
      expect(info?.purpose).toContain('Invoice delivery');
    });

    it('should return null for unknown template', () => {
      const info = service.getComplianceInfo('unknown' as WhatsAppTemplateName);
      expect(info).toBeNull();
    });
  });

  // TASK-WA-003: Statement notification template tests
  describe('buildStatementNotification', () => {
    it('should build statement notification with all parameters', () => {
      const built = service.buildStatementNotification({
        parentName: 'John',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
        openingBalance: 'R500.00',
        charges: 'R1,500.00',
        payments: 'R1,000.00',
        closingBalance: 'R1,000.00',
        documentLink: 'https://example.com/statement.pdf',
        documentFilename: 'Statement_STM-001.pdf',
        statementId: 'stmt-123',
      });

      expect(built).toBeDefined();
      expect(built?.name).toBe('statement_notification');
      expect(built?.language.code).toBe('en');
      expect(built?.components.length).toBeGreaterThan(0);

      // Check header component with document
      const headerComponent = built?.components.find(
        (c) => c.type === 'header',
      );
      expect(headerComponent).toBeDefined();
      expect(headerComponent?.parameters?.[0].type).toBe('document');

      // Check body component
      const bodyComponent = built?.components.find((c) => c.type === 'body');
      expect(bodyComponent).toBeDefined();
      expect(bodyComponent?.parameters?.length).toBe(7);
    });

    it('should build statement notification without document', () => {
      const built = service.buildStatementNotification({
        parentName: 'John',
        periodStart: '2026-01-01',
        periodEnd: '2026-01-31',
        openingBalance: 'R500.00',
        charges: 'R1,500.00',
        payments: 'R1,000.00',
        closingBalance: 'R1,000.00',
      });

      expect(built).toBeDefined();
      expect(built?.name).toBe('statement_notification');
    });

    it('should format dates correctly in statement notification', () => {
      const built = service.buildStatementNotification({
        parentName: 'John',
        periodStart: new Date('2026-01-01'),
        periodEnd: new Date('2026-01-31'),
        openingBalance: 'R0.00',
        charges: 'R2,000.00',
        payments: 'R500.00',
        closingBalance: 'R1,500.00',
      });

      const bodyComponent = built?.components.find((c) => c.type === 'body');
      const params = bodyComponent?.parameters;

      // periodStart should be formatted as "01 Jan 2026"
      expect(params?.[1].text).toBe('01 Jan 2026');
      // periodEnd should be formatted as "31 Jan 2026"
      expect(params?.[2].text).toBe('31 Jan 2026');
    });
  });

  describe('statement_notification template compliance', () => {
    it('should require opt-in for statement notification', () => {
      const result = service.checkOptInCompliance(
        'statement_notification',
        false,
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('requires WhatsApp opt-in');
    });

    it('should allow statement notification when opted in', () => {
      const result = service.checkOptInCompliance(
        'statement_notification',
        true,
      );

      expect(result.allowed).toBe(true);
    });

    it('should have correct compliance info for statement notification', () => {
      const info = service.getComplianceInfo('statement_notification');

      expect(info).toBeDefined();
      expect(info?.requiresOptIn).toBe(true);
      expect(info?.dataRetentionDays).toBe(365);
      expect(info?.purpose).toContain('statement delivery');
    });
  });

  describe('logTemplateUsage', () => {
    it('should log template usage without throwing', () => {
      expect(() => {
        service.logTemplateUsage('invoice_notification', {
          tenantId: 'tenant-123',
          parentId: 'parent-456',
          contextType: 'INVOICE',
          contextId: 'invoice-789',
          recipientPhone: '+27821234567',
        });
      }).not.toThrow();
    });
  });
});
