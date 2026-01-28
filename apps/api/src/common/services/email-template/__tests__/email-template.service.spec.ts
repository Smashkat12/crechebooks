/**
 * Email Template Service Tests
 * TASK-INT-006: Fix Email Template Rendering
 */

import {
  EmailTemplateService,
  EmailTemplateName,
  InvoiceEmailData,
  StatementEmailData,
  ReminderEmailData,
  PaymentReceiptData,
} from '../email-template.service';
import { BusinessException } from '../../../../shared/exceptions';

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;

  beforeEach(() => {
    service = new EmailTemplateService();
    // Manually trigger onModuleInit since we're not using NestJS DI
    service.onModuleInit();
  });

  describe('Template Registration', () => {
    it('should register all default templates', () => {
      expect(service.hasTemplate(EmailTemplateName.INVOICE_EMAIL)).toBe(true);
      expect(service.hasTemplate(EmailTemplateName.STATEMENT_EMAIL)).toBe(true);
      expect(service.hasTemplate(EmailTemplateName.REMINDER_EMAIL)).toBe(true);
      expect(service.hasTemplate(EmailTemplateName.PAYMENT_RECEIPT)).toBe(true);
    });

    it('should return list of available templates', () => {
      const templates = service.getAvailableTemplates();
      expect(templates).toContain(EmailTemplateName.INVOICE_EMAIL);
      expect(templates).toContain(EmailTemplateName.STATEMENT_EMAIL);
      expect(templates).toContain(EmailTemplateName.REMINDER_EMAIL);
      expect(templates).toContain(EmailTemplateName.PAYMENT_RECEIPT);
    });
  });

  describe('Invoice Email Template', () => {
    const invoiceData: InvoiceEmailData = {
      tenantName: 'Test Creche',
      tenantLogo: 'https://example.com/logo.png',
      primaryColor: '#ff5722',
      recipientName: 'John Parent',
      supportEmail: 'support@testcreche.co.za',
      footerText: 'Thank you for choosing Test Creche!',
      invoiceNumber: 'INV-2026-001',
      invoiceDate: new Date('2026-01-15'),
      dueDate: new Date('2026-01-22'),
      billingPeriodStart: new Date('2026-01-01'),
      billingPeriodEnd: new Date('2026-01-31'),
      subtotalCents: 500000,
      vatCents: 75000,
      totalCents: 575000,
      childName: 'Emma Smith',
      lineItems: [
        {
          description: 'Monthly Tuition Fee',
          quantity: 1,
          unitPriceCents: 450000,
          totalCents: 450000,
        },
        {
          description: 'Extra Activities',
          quantity: 2,
          unitPriceCents: 25000,
          totalCents: 50000,
        },
      ],
      paymentUrl: 'https://pay.example.com/inv-001',
    };

    it('should render invoice email with all data', () => {
      const result = service.renderInvoiceEmail(invoiceData);

      expect(result.subject).toContain('Invoice INV-2026-001');
      expect(result.subject).toContain('Test Creche');
      expect(result.html).toContain('INV-2026-001');
      expect(result.html).toContain('John Parent');
      expect(result.html).toContain('Monthly Tuition Fee');
      expect(result.text).toContain('INV-2026-001');
      expect(result.text).toMatch(/R\s*5[\s,]?750[.,]00/);
    });

    it('should format currency correctly', () => {
      const result = service.renderInvoiceEmail(invoiceData);

      // Check for South African Rand formatting (R X XXX,XX or R X,XXX.XX)
      expect(result.html).toMatch(/R\s*5[\s,]?750[.,]00/);
      expect(result.text).toMatch(/R\s*5[\s,]?750[.,]00/);
    });

    it('should format dates correctly', () => {
      const result = service.renderInvoiceEmail(invoiceData);

      // South African date format: YYYY/MM/DD
      expect(result.html).toContain('2026/01/15');
      expect(result.html).toContain('2026/01/22');
    });

    it('should include payment URL when provided', () => {
      const result = service.renderInvoiceEmail(invoiceData);

      expect(result.html).toContain('https://pay.example.com/inv-001');
      expect(result.html).toContain('Pay Now');
    });

    it('should include tenant branding', () => {
      const result = service.renderInvoiceEmail(invoiceData);

      expect(result.html).toContain('https://example.com/logo.png');
      expect(result.html).toContain('#ff5722');
      expect(result.html).toContain('support@testcreche.co.za');
      expect(result.html).toContain('Thank you for choosing Test Creche!');
    });
  });

  describe('Statement Email Template', () => {
    const statementData: StatementEmailData = {
      tenantName: 'Sunshine Daycare',
      recipientName: 'Jane Parent',
      statementDate: new Date('2026-01-31'),
      periodStart: new Date('2026-01-01'),
      periodEnd: new Date('2026-01-31'),
      openingBalanceCents: 100000,
      totalChargesCents: 575000,
      totalPaymentsCents: 500000,
      closingBalanceCents: 175000,
      childNames: 'Emma Smith, Jack Smith',
      transactions: [
        {
          date: new Date('2026-01-01'),
          description: 'Opening Balance',
          debitCents: 0,
          creditCents: 0,
          balanceCents: 100000,
        },
        {
          date: new Date('2026-01-05'),
          description: 'Invoice INV-2026-001',
          debitCents: 575000,
          creditCents: 0,
          balanceCents: 675000,
        },
        {
          date: new Date('2026-01-15'),
          description: 'Payment Received - Thank you',
          debitCents: 0,
          creditCents: 500000,
          balanceCents: 175000,
        },
      ],
    };

    it('should render statement email with all data', () => {
      const result = service.renderStatementEmail(statementData);

      expect(result.subject).toContain('Account Statement');
      expect(result.subject).toContain('Sunshine Daycare');
      expect(result.html).toContain('Jane Parent');
      expect(result.html).toContain('Opening Balance');
      expect(result.text).toContain('AMOUNT DUE');
    });

    it('should show transaction history', () => {
      const result = service.renderStatementEmail(statementData);

      expect(result.html).toContain('Invoice INV-2026-001');
      expect(result.html).toContain('Payment Received');
    });

    it('should calculate totals correctly', () => {
      const result = service.renderStatementEmail(statementData);

      expect(result.html).toMatch(/R\s*1[\s,]?750[.,]00/); // Closing balance
      expect(result.text).toMatch(/R\s*1[\s,]?750[.,]00/);
    });
  });

  describe('Reminder Email Template', () => {
    const reminderData: ReminderEmailData = {
      tenantName: 'Kids Academy',
      recipientName: 'Late Payer',
      invoiceNumber: 'INV-2026-005',
      invoiceDate: new Date('2025-12-01'),
      dueDate: new Date('2025-12-08'),
      amountDueCents: 350000,
      daysOverdue: 38,
      isFinalReminder: false,
      paymentUrl: 'https://pay.example.com/inv-005',
    };

    it('should render reminder email', () => {
      const result = service.renderReminderEmail(reminderData);

      expect(result.subject).toContain('Payment Reminder');
      expect(result.subject).toContain('INV-2026-005');
      expect(result.html).toContain('Late Payer');
      expect(result.html).toContain('38 days');
      expect(result.text).toContain('overdue');
    });

    it('should show urgent styling for final reminder', () => {
      const finalReminder: ReminderEmailData = {
        ...reminderData,
        isFinalReminder: true,
      };

      const result = service.renderReminderEmail(finalReminder);

      expect(result.subject).toContain('URGENT');
      expect(result.subject).toContain('Final Payment Reminder');
      expect(result.html).toContain('#dc3545'); // Red color for urgency
    });

    it('should include payment URL', () => {
      const result = service.renderReminderEmail(reminderData);

      expect(result.html).toContain('https://pay.example.com/inv-005');
    });
  });

  describe('Payment Receipt Template', () => {
    const receiptData: PaymentReceiptData = {
      tenantName: 'Happy Kids',
      recipientName: 'Good Parent',
      receiptNumber: 'RCP-2026-001',
      paymentDate: new Date('2026-01-15'),
      paymentMethod: 'EFT Bank Transfer',
      amountPaidCents: 575000,
      referenceNumber: 'REF123456',
      appliedToInvoices: [
        { invoiceNumber: 'INV-2026-001', amountAppliedCents: 575000 },
      ],
      remainingBalanceCents: 0,
    };

    it('should render payment receipt', () => {
      const result = service.renderPaymentReceiptEmail(receiptData);

      expect(result.subject).toContain('Payment Receipt');
      expect(result.subject).toContain('RCP-2026-001');
      expect(result.html).toContain('Good Parent');
      expect(result.html).toContain('Payment Received');
      expect(result.text).toContain('RCP-2026-001');
    });

    it('should show payment details', () => {
      const result = service.renderPaymentReceiptEmail(receiptData);

      expect(result.html).toContain('EFT Bank Transfer');
      expect(result.html).toContain('REF123456');
      expect(result.html).toMatch(/R\s*5[\s,]?750[.,]00/);
    });

    it('should show applied invoices', () => {
      const result = service.renderPaymentReceiptEmail(receiptData);

      expect(result.html).toContain('INV-2026-001');
      expect(result.html).toContain('Applied To');
    });

    it('should show remaining balance', () => {
      const result = service.renderPaymentReceiptEmail(receiptData);

      expect(result.html).toContain('Remaining Balance');
      expect(result.html).toMatch(/R\s*0[.,]00/);
    });
  });

  describe('XSS Prevention', () => {
    it('should escape HTML in recipient name', () => {
      const maliciousData: InvoiceEmailData = {
        ...{
          tenantName: 'Test',
          recipientName: '<script>alert("xss")</script>',
          invoiceNumber: 'INV-001',
          invoiceDate: new Date(),
          dueDate: new Date(),
          billingPeriodStart: new Date(),
          billingPeriodEnd: new Date(),
          subtotalCents: 100,
          vatCents: 15,
          totalCents: 115,
          childName: 'Test Child',
          lineItems: [],
        },
      };

      const result = service.renderInvoiceEmail(maliciousData);

      expect(result.html).not.toContain('<script>');
      // Handlebars double-escapes: < becomes &lt; then & becomes &amp;lt;
      expect(result.html).toMatch(/&(?:amp;)?lt;script/);

    });

    it('should escape HTML in line item descriptions', () => {
      const maliciousData: InvoiceEmailData = {
        tenantName: 'Test',
        recipientName: 'John',
        invoiceNumber: 'INV-001',
        invoiceDate: new Date(),
        dueDate: new Date(),
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
        subtotalCents: 100,
        vatCents: 15,
        totalCents: 115,
        childName: 'Test Child',
        lineItems: [
          {
            description: '<img src="x" onerror="alert(1)">',
            quantity: 1,
            unitPriceCents: 100,
            totalCents: 100,
          },
        ],
      };

      const result = service.renderInvoiceEmail(maliciousData);

      expect(result.html).not.toContain('onerror=');
      // Handlebars double-escapes: < becomes &lt; then & becomes &amp;lt;
      expect(result.html).toMatch(/&(?:amp;)?lt;img/);
    });

    it('should escape HTML in tenant name', () => {
      const maliciousData: InvoiceEmailData = {
        tenantName: '<div onclick="hack()">Evil Corp</div>',
        recipientName: 'John',
        invoiceNumber: 'INV-001',
        invoiceDate: new Date(),
        dueDate: new Date(),
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
        subtotalCents: 100,
        vatCents: 15,
        totalCents: 115,
        childName: 'Test Child',
        lineItems: [],
      };

      const result = service.renderInvoiceEmail(maliciousData);

      expect(result.html).not.toContain('onclick=');
      // Handlebars double-escapes: < becomes &lt; then & becomes &amp;lt;
      expect(result.html).toMatch(/&(?:amp;)?lt;div/);
    });
  });

  describe('Error Handling', () => {
    it('should throw BusinessException for unknown template', () => {
      expect(() => {
        service.render(
          'unknown_template' as EmailTemplateName,
          {
            tenantName: 'Test',
            recipientName: 'Test',
          } as any,
        );
      }).toThrow(BusinessException);
    });

    it('should handle null/undefined values gracefully', () => {
      const minimalData: InvoiceEmailData = {
        tenantName: 'Test',
        recipientName: 'Test',
        invoiceNumber: 'INV-001',
        invoiceDate: new Date(),
        dueDate: new Date(),
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
        subtotalCents: 0,
        vatCents: 0,
        totalCents: 0,
        childName: 'Test Child',
        lineItems: [],
      };

      expect(() => service.renderInvoiceEmail(minimalData)).not.toThrow();
    });

    it('should handle invalid dates', () => {
      const invalidData: InvoiceEmailData = {
        tenantName: 'Test',
        recipientName: 'Test',
        invoiceNumber: 'INV-001',
        invoiceDate: 'not-a-date' as any,
        dueDate: new Date(),
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
        subtotalCents: 0,
        vatCents: 0,
        totalCents: 0,
        childName: 'Test Child',
        lineItems: [],
      };

      // Should not throw, just render with empty date
      expect(() => service.renderInvoiceEmail(invalidData)).not.toThrow();
    });
  });

  describe('Text Generation', () => {
    it('should generate text version from HTML', () => {
      const data: InvoiceEmailData = {
        tenantName: 'Test Creche',
        recipientName: 'John',
        invoiceNumber: 'INV-001',
        invoiceDate: new Date('2026-01-15'),
        dueDate: new Date('2026-01-22'),
        billingPeriodStart: new Date('2026-01-01'),
        billingPeriodEnd: new Date('2026-01-31'),
        subtotalCents: 100000,
        vatCents: 15000,
        totalCents: 115000,
        childName: 'Test Child',
        lineItems: [
          {
            description: 'Test Item',
            quantity: 1,
            unitPriceCents: 100000,
            totalCents: 100000,
          },
        ],
      };

      const result = service.renderInvoiceEmail(data);

      expect(result.text).toBeTruthy();
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.text).toContain('INV-001');
      expect(result.text).not.toContain('<');
      expect(result.text).not.toContain('>');
    });
  });

  describe('Current Year Helper', () => {
    it('should include current year in footer', () => {
      const data: InvoiceEmailData = {
        tenantName: 'Test',
        recipientName: 'Test',
        invoiceNumber: 'INV-001',
        invoiceDate: new Date(),
        dueDate: new Date(),
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
        subtotalCents: 0,
        vatCents: 0,
        totalCents: 0,
        childName: 'Test Child',
        lineItems: [],
      };

      const result = service.renderInvoiceEmail(data);

      expect(result.html).toContain(new Date().getFullYear().toString());
    });

    it('should allow custom year override', () => {
      const data: InvoiceEmailData = {
        tenantName: 'Test',
        recipientName: 'Test',
        currentYear: 2030,
        invoiceNumber: 'INV-001',
        invoiceDate: new Date(),
        dueDate: new Date(),
        billingPeriodStart: new Date(),
        billingPeriodEnd: new Date(),
        subtotalCents: 0,
        vatCents: 0,
        totalCents: 0,
        childName: 'Test Child',
        lineItems: [],
      };

      const result = service.renderInvoiceEmail(data);

      expect(result.html).toContain('2030');
    });
  });
});
