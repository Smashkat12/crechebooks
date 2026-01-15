/**
 * Email Template Service
 * TASK-INT-006: Fix Email Template Rendering
 *
 * Provides Handlebars-based template rendering for emails with:
 * - Multi-tenant customization (logo, colors, footer)
 * - XSS prevention through HTML escaping
 * - Currency and date formatting helpers
 * - Support for invoice, statement, reminder, and receipt templates
 *
 * CRITICAL: All user-provided content is HTML-escaped to prevent XSS attacks.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as Handlebars from 'handlebars';
import * as fs from 'fs';
import * as path from 'path';
import { BusinessException } from '../../../shared/exceptions';

/**
 * Template names supported by the email template service
 */
export enum EmailTemplateName {
  INVOICE_EMAIL = 'invoice_email',
  STATEMENT_EMAIL = 'statement_email',
  REMINDER_EMAIL = 'reminder_email',
  PAYMENT_RECEIPT = 'payment_receipt',
}

/**
 * Tenant branding configuration for email templates
 */
export interface TenantBranding {
  /** Tenant display name */
  tenantName: string;
  /** Logo URL (must be HTTPS for email clients) */
  tenantLogo?: string;
  /** Primary brand color (hex format, e.g., '#007bff') */
  primaryColor?: string;
  /** Secondary brand color */
  secondaryColor?: string;
  /** Custom footer text */
  footerText?: string;
  /** Support email address */
  supportEmail?: string;
  /** Support phone number */
  supportPhone?: string;
}

/**
 * Base data interface for all email templates
 */
export interface BaseEmailTemplateData extends TenantBranding {
  /** Recipient's display name */
  recipientName: string;
  /** Current year for footer copyright */
  currentYear?: number;
}

/**
 * Invoice email template data
 */
export interface InvoiceEmailData extends BaseEmailTemplateData {
  invoiceNumber: string;
  invoiceDate: Date | string;
  dueDate: Date | string;
  billingPeriodStart: Date | string;
  billingPeriodEnd: Date | string;
  subtotalCents: number;
  vatCents: number;
  totalCents: number;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }>;
  /** Optional link to view invoice online */
  viewInvoiceUrl?: string;
  /** Optional link to pay invoice */
  paymentUrl?: string;
}

/**
 * Statement email template data
 */
export interface StatementEmailData extends BaseEmailTemplateData {
  statementDate: Date | string;
  periodStart: Date | string;
  periodEnd: Date | string;
  openingBalanceCents: number;
  totalChargesCents: number;
  totalPaymentsCents: number;
  closingBalanceCents: number;
  transactions: Array<{
    date: Date | string;
    description: string;
    debitCents: number;
    creditCents: number;
    balanceCents: number;
  }>;
  /** Optional link to view statement online */
  viewStatementUrl?: string;
}

/**
 * Payment reminder email template data
 */
export interface ReminderEmailData extends BaseEmailTemplateData {
  invoiceNumber: string;
  invoiceDate: Date | string;
  dueDate: Date | string;
  amountDueCents: number;
  daysOverdue: number;
  /** Whether this is a final reminder before escalation */
  isFinalReminder?: boolean;
  /** Optional link to pay */
  paymentUrl?: string;
}

/**
 * Payment receipt email template data
 */
export interface PaymentReceiptData extends BaseEmailTemplateData {
  receiptNumber: string;
  paymentDate: Date | string;
  paymentMethod: string;
  amountPaidCents: number;
  /** Reference number from payment processor */
  referenceNumber?: string;
  /** Invoices this payment was applied to */
  appliedToInvoices: Array<{
    invoiceNumber: string;
    amountAppliedCents: number;
  }>;
  /** Remaining balance after payment */
  remainingBalanceCents: number;
}

/**
 * Union type for all template data types
 */
export type EmailTemplateData =
  | InvoiceEmailData
  | StatementEmailData
  | ReminderEmailData
  | PaymentReceiptData;

/**
 * Rendered email result
 */
export interface RenderedEmail {
  /** Plain text version */
  text: string;
  /** HTML version */
  html: string;
  /** Suggested subject line */
  subject: string;
}

@Injectable()
export class EmailTemplateService implements OnModuleInit {
  private readonly logger = new Logger(EmailTemplateService.name);
  private templates = new Map<string, Handlebars.TemplateDelegate>();
  private textTemplates = new Map<string, Handlebars.TemplateDelegate>();

  /**
   * Path to template files
   */
  private readonly templatesDir = path.join(__dirname, '../../templates');

  onModuleInit(): void {
    this.registerHelpers();
    this.loadTemplates();
  }

  /**
   * Register Handlebars helpers for common formatting tasks
   */
  private registerHelpers(): void {
    // Format cents to South African Rand
    Handlebars.registerHelper('formatCurrency', (cents: number): string => {
      if (typeof cents !== 'number' || isNaN(cents)) {
        return 'R 0.00';
      }
      const amount = cents / 100;
      return `R ${amount.toLocaleString('en-ZA', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
    });

    // Format date to South African format (DD/MM/YYYY)
    Handlebars.registerHelper('formatDate', (date: Date | string): string => {
      if (!date) return '';
      const d = typeof date === 'string' ? new Date(date) : date;
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('en-ZA', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
    });

    // Format date with time
    Handlebars.registerHelper(
      'formatDateTime',
      (date: Date | string): string => {
        if (!date) return '';
        const d = typeof date === 'string' ? new Date(date) : date;
        if (isNaN(d.getTime())) return '';
        return d.toLocaleString('en-ZA', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      },
    );

    // Conditional helper for positive amounts
    Handlebars.registerHelper(
      'ifPositive',
      function (
        this: unknown,
        value: number,
        options: Handlebars.HelperOptions,
      ): string {
        return value > 0 ? options.fn(this) : options.inverse(this);
      },
    );

    // Conditional helper for overdue status
    Handlebars.registerHelper(
      'ifOverdue',
      function (
        this: unknown,
        daysOverdue: number,
        options: Handlebars.HelperOptions,
      ): string {
        return daysOverdue > 0 ? options.fn(this) : options.inverse(this);
      },
    );

    // Math helpers
    Handlebars.registerHelper('multiply', (a: number, b: number): number => {
      return (a || 0) * (b || 0);
    });

    // Color helper with default fallback
    Handlebars.registerHelper(
      'defaultColor',
      (color: string | undefined, defaultValue: string): string => {
        return color || defaultValue;
      },
    );

    // Escape HTML helper (already done by default, but explicit for text)
    Handlebars.registerHelper('escape', (text: string): string => {
      return Handlebars.Utils.escapeExpression(text);
    });

    this.logger.log('Handlebars helpers registered');
  }

  /**
   * Load templates from the templates directory
   */
  private loadTemplates(): void {
    // Check if templates directory exists
    if (!fs.existsSync(this.templatesDir)) {
      this.logger.warn(
        `Templates directory not found at ${this.templatesDir}. Using embedded templates.`,
      );
      this.loadEmbeddedTemplates();
      return;
    }

    const templateNames = Object.values(EmailTemplateName);

    for (const templateName of templateNames) {
      // Load HTML template
      const htmlPath = path.join(this.templatesDir, `${templateName}.html.hbs`);
      if (fs.existsSync(htmlPath)) {
        const htmlContent = fs.readFileSync(htmlPath, 'utf-8');
        this.templates.set(templateName, Handlebars.compile(htmlContent));
        this.logger.log(`Loaded HTML template: ${templateName}`);
      }

      // Load text template
      const textPath = path.join(this.templatesDir, `${templateName}.txt.hbs`);
      if (fs.existsSync(textPath)) {
        const textContent = fs.readFileSync(textPath, 'utf-8');
        this.textTemplates.set(templateName, Handlebars.compile(textContent));
        this.logger.log(`Loaded text template: ${templateName}`);
      }
    }

    // If no templates loaded, use embedded ones
    if (this.templates.size === 0) {
      this.loadEmbeddedTemplates();
    }
  }

  /**
   * Load embedded fallback templates
   */
  private loadEmbeddedTemplates(): void {
    // Invoice email template
    this.templates.set(
      EmailTemplateName.INVOICE_EMAIL,
      Handlebars.compile(this.getEmbeddedInvoiceHtmlTemplate()),
    );
    this.textTemplates.set(
      EmailTemplateName.INVOICE_EMAIL,
      Handlebars.compile(this.getEmbeddedInvoiceTextTemplate()),
    );

    // Statement email template
    this.templates.set(
      EmailTemplateName.STATEMENT_EMAIL,
      Handlebars.compile(this.getEmbeddedStatementHtmlTemplate()),
    );
    this.textTemplates.set(
      EmailTemplateName.STATEMENT_EMAIL,
      Handlebars.compile(this.getEmbeddedStatementTextTemplate()),
    );

    // Reminder email template
    this.templates.set(
      EmailTemplateName.REMINDER_EMAIL,
      Handlebars.compile(this.getEmbeddedReminderHtmlTemplate()),
    );
    this.textTemplates.set(
      EmailTemplateName.REMINDER_EMAIL,
      Handlebars.compile(this.getEmbeddedReminderTextTemplate()),
    );

    // Payment receipt template
    this.templates.set(
      EmailTemplateName.PAYMENT_RECEIPT,
      Handlebars.compile(this.getEmbeddedReceiptHtmlTemplate()),
    );
    this.textTemplates.set(
      EmailTemplateName.PAYMENT_RECEIPT,
      Handlebars.compile(this.getEmbeddedReceiptTextTemplate()),
    );

    this.logger.log('Loaded embedded templates');
  }

  /**
   * Escape user-provided content to prevent XSS
   * @param data - Template data object
   * @returns Data with user content escaped
   */
  private escapeUserContent<T extends Record<string, unknown>>(data: T): T {
    const escaped: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(data)) {
      if (typeof value === 'string') {
        // Escape HTML entities in strings
        escaped[key] = Handlebars.Utils.escapeExpression(value);
      } else if (Array.isArray(value)) {
        // Recursively escape array items
        escaped[key] = value.map((item) => {
          if (typeof item === 'object' && item !== null) {
            return this.escapeUserContent(item as Record<string, unknown>);
          }
          if (typeof item === 'string') {
            return Handlebars.Utils.escapeExpression(item);
          }
          return item;
        });
      } else if (
        typeof value === 'object' &&
        value !== null &&
        !(value instanceof Date)
      ) {
        // Recursively escape nested objects (but not Date objects)
        escaped[key] = this.escapeUserContent(value as Record<string, unknown>);
      } else {
        // Keep non-string values as-is
        escaped[key] = value;
      }
    }

    return escaped as T;
  }

  /**
   * Render an email template
   * @param templateName - Name of the template to render
   * @param data - Template data
   * @returns Rendered email with text, html, and subject
   * @throws BusinessException if template not found
   */
  render(
    templateName: EmailTemplateName,
    data: EmailTemplateData,
  ): RenderedEmail {
    const htmlTemplate = this.templates.get(templateName);
    const textTemplate = this.textTemplates.get(templateName);

    if (!htmlTemplate && !textTemplate) {
      throw new BusinessException(
        `Email template '${templateName}' not found`,
        'TEMPLATE_NOT_FOUND',
        { templateName },
      );
    }

    // Escape user content to prevent XSS
    const safeData = this.escapeUserContent({
      ...data,
      currentYear: data.currentYear ?? new Date().getFullYear(),
    });

    // Render HTML template
    let html = '';
    if (htmlTemplate) {
      try {
        html = htmlTemplate(safeData);
      } catch (error) {
        this.logger.error(
          `Failed to render HTML template ${templateName}: ${error instanceof Error ? error.message : error}`,
        );
        throw new BusinessException(
          `Failed to render email template '${templateName}'`,
          'TEMPLATE_RENDER_ERROR',
          {
            templateName,
            error: error instanceof Error ? error.message : String(error),
          },
        );
      }
    }

    // Render text template
    let text = '';
    if (textTemplate) {
      try {
        text = textTemplate(safeData);
      } catch (error) {
        this.logger.error(
          `Failed to render text template ${templateName}: ${error instanceof Error ? error.message : error}`,
        );
        // Fall back to stripping HTML
        text = this.htmlToText(html);
      }
    } else {
      // Generate text from HTML
      text = this.htmlToText(html);
    }

    // Generate subject based on template type
    const subject = this.generateSubject(templateName, safeData);

    return { text, html, subject };
  }

  /**
   * Render invoice email
   */
  renderInvoiceEmail(data: InvoiceEmailData): RenderedEmail {
    return this.render(EmailTemplateName.INVOICE_EMAIL, data);
  }

  /**
   * Render statement email
   */
  renderStatementEmail(data: StatementEmailData): RenderedEmail {
    return this.render(EmailTemplateName.STATEMENT_EMAIL, data);
  }

  /**
   * Render reminder email
   */
  renderReminderEmail(data: ReminderEmailData): RenderedEmail {
    return this.render(EmailTemplateName.REMINDER_EMAIL, data);
  }

  /**
   * Render payment receipt email
   */
  renderPaymentReceiptEmail(data: PaymentReceiptData): RenderedEmail {
    return this.render(EmailTemplateName.PAYMENT_RECEIPT, data);
  }

  /**
   * Generate email subject based on template type
   */
  private generateSubject(
    templateName: EmailTemplateName,
    data: Record<string, unknown>,
  ): string {
    const tenantName = (data.tenantName as string) || 'CrecheBooks';

    switch (templateName) {
      case EmailTemplateName.INVOICE_EMAIL:
        return `Invoice ${data.invoiceNumber || ''} from ${tenantName}`;
      case EmailTemplateName.STATEMENT_EMAIL:
        return `Account Statement from ${tenantName}`;
      case EmailTemplateName.REMINDER_EMAIL:
        return data.isFinalReminder
          ? `URGENT: Final Payment Reminder - Invoice ${data.invoiceNumber || ''}`
          : `Payment Reminder - Invoice ${data.invoiceNumber || ''}`;
      case EmailTemplateName.PAYMENT_RECEIPT:
        return `Payment Receipt ${data.receiptNumber || ''} from ${tenantName}`;
      default:
        return `Message from ${tenantName}`;
    }
  }

  /**
   * Convert HTML to plain text
   */
  private htmlToText(html: string): string {
    if (!html) return '';

    return (
      html
        // Remove style and script tags with content
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        // Convert line breaks
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/tr>/gi, '\n')
        .replace(/<\/td>/gi, '\t')
        // Remove all other HTML tags
        .replace(/<[^>]+>/g, '')
        // Decode HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // Clean up whitespace
        .replace(/\n{3,}/g, '\n\n')
        .trim()
    );
  }

  /**
   * Check if a template exists
   */
  hasTemplate(templateName: EmailTemplateName): boolean {
    return (
      this.templates.has(templateName) || this.textTemplates.has(templateName)
    );
  }

  /**
   * Get list of available templates
   */
  getAvailableTemplates(): EmailTemplateName[] {
    return Object.values(EmailTemplateName).filter((name) =>
      this.hasTemplate(name),
    );
  }

  // =====================================================
  // Embedded Template Definitions
  // =====================================================

  private getEmbeddedInvoiceHtmlTemplate(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice {{invoiceNumber}}</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: {{defaultColor primaryColor '#007bff'}}; color: white; padding: 20px; text-align: center;">
    {{#if tenantLogo}}
    <img src="{{tenantLogo}}" alt="{{tenantName}}" style="max-height: 60px; margin-bottom: 10px;">
    {{/if}}
    <h1 style="margin: 0; font-size: 24px;">{{tenantName}}</h1>
  </div>

  <div style="padding: 20px; background-color: #f9f9f9;">
    <p>Dear {{recipientName}},</p>
    <p>Please find your invoice details below:</p>

    <div style="background-color: white; padding: 15px; border: 1px solid #ddd; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0;"><strong>Invoice Number:</strong></td>
          <td style="padding: 8px 0; text-align: right;">{{invoiceNumber}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Invoice Date:</strong></td>
          <td style="padding: 8px 0; text-align: right;">{{formatDate invoiceDate}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Due Date:</strong></td>
          <td style="padding: 8px 0; text-align: right;">{{formatDate dueDate}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Billing Period:</strong></td>
          <td style="padding: 8px 0; text-align: right;">{{formatDate billingPeriodStart}} - {{formatDate billingPeriodEnd}}</td>
        </tr>
      </table>
    </div>

    <h3 style="border-bottom: 2px solid {{defaultColor primaryColor '#007bff'}}; padding-bottom: 10px;">Line Items</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="background-color: #f0f0f0;">
          <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Description</th>
          <th style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd;">Qty</th>
          <th style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd;">Unit Price</th>
          <th style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd;">Total</th>
        </tr>
      </thead>
      <tbody>
        {{#each lineItems}}
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">{{description}}</td>
          <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">{{quantity}}</td>
          <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">{{formatCurrency unitPriceCents}}</td>
          <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">{{formatCurrency totalCents}}</td>
        </tr>
        {{/each}}
      </tbody>
    </table>

    <div style="background-color: white; padding: 15px; border: 1px solid #ddd;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0;"><strong>Subtotal:</strong></td>
          <td style="padding: 8px 0; text-align: right;">{{formatCurrency subtotalCents}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>VAT (15%):</strong></td>
          <td style="padding: 8px 0; text-align: right;">{{formatCurrency vatCents}}</td>
        </tr>
        <tr style="font-size: 18px; color: {{defaultColor primaryColor '#007bff'}};">
          <td style="padding: 12px 0; border-top: 2px solid #ddd;"><strong>Total Due:</strong></td>
          <td style="padding: 12px 0; text-align: right; border-top: 2px solid #ddd;"><strong>{{formatCurrency totalCents}}</strong></td>
        </tr>
      </table>
    </div>

    {{#if paymentUrl}}
    <div style="text-align: center; margin: 20px 0;">
      <a href="{{paymentUrl}}" style="background-color: {{defaultColor primaryColor '#007bff'}}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Pay Now</a>
    </div>
    {{/if}}

    <p style="margin-top: 20px;">Please ensure payment is made by the due date.</p>
    <p>Thank you for your business.</p>
  </div>

  <div style="background-color: #333; color: #999; padding: 20px; text-align: center; font-size: 12px;">
    {{#if footerText}}
    <p>{{footerText}}</p>
    {{/if}}
    {{#if supportEmail}}
    <p>Questions? Contact us at <a href="mailto:{{supportEmail}}" style="color: #007bff;">{{supportEmail}}</a></p>
    {{/if}}
    <p>&copy; {{currentYear}} {{tenantName}}. All rights reserved.</p>
  </div>
</body>
</html>`;
  }

  private getEmbeddedInvoiceTextTemplate(): string {
    return `{{tenantName}}
================

Dear {{recipientName}},

Please find your invoice details below:

Invoice Number: {{invoiceNumber}}
Invoice Date: {{formatDate invoiceDate}}
Due Date: {{formatDate dueDate}}
Billing Period: {{formatDate billingPeriodStart}} - {{formatDate billingPeriodEnd}}

Line Items:
{{#each lineItems}}
- {{description}}: {{quantity}} x {{formatCurrency unitPriceCents}} = {{formatCurrency totalCents}}
{{/each}}

----------------------------------------
Subtotal: {{formatCurrency subtotalCents}}
VAT (15%): {{formatCurrency vatCents}}
TOTAL DUE: {{formatCurrency totalCents}}
----------------------------------------

Please ensure payment is made by the due date.

Thank you for your business.

{{#if footerText}}
{{footerText}}
{{/if}}
{{#if supportEmail}}
Questions? Contact us at {{supportEmail}}
{{/if}}

(c) {{currentYear}} {{tenantName}}`;
  }

  private getEmbeddedStatementHtmlTemplate(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Statement</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: {{defaultColor primaryColor '#007bff'}}; color: white; padding: 20px; text-align: center;">
    {{#if tenantLogo}}
    <img src="{{tenantLogo}}" alt="{{tenantName}}" style="max-height: 60px; margin-bottom: 10px;">
    {{/if}}
    <h1 style="margin: 0; font-size: 24px;">{{tenantName}}</h1>
    <p style="margin: 5px 0 0 0;">Account Statement</p>
  </div>

  <div style="padding: 20px; background-color: #f9f9f9;">
    <p>Dear {{recipientName}},</p>
    <p>Please find your account statement for the period {{formatDate periodStart}} to {{formatDate periodEnd}}.</p>

    <div style="background-color: white; padding: 15px; border: 1px solid #ddd; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0;"><strong>Statement Date:</strong></td>
          <td style="padding: 8px 0; text-align: right;">{{formatDate statementDate}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Opening Balance:</strong></td>
          <td style="padding: 8px 0; text-align: right;">{{formatCurrency openingBalanceCents}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Total Charges:</strong></td>
          <td style="padding: 8px 0; text-align: right;">{{formatCurrency totalChargesCents}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Total Payments:</strong></td>
          <td style="padding: 8px 0; text-align: right; color: green;">-{{formatCurrency totalPaymentsCents}}</td>
        </tr>
        <tr style="font-size: 18px; color: {{defaultColor primaryColor '#007bff'}};">
          <td style="padding: 12px 0; border-top: 2px solid #ddd;"><strong>Closing Balance:</strong></td>
          <td style="padding: 12px 0; text-align: right; border-top: 2px solid #ddd;"><strong>{{formatCurrency closingBalanceCents}}</strong></td>
        </tr>
      </table>
    </div>

    <h3 style="border-bottom: 2px solid {{defaultColor primaryColor '#007bff'}}; padding-bottom: 10px;">Transaction History</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 14px;">
      <thead>
        <tr style="background-color: #f0f0f0;">
          <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Date</th>
          <th style="padding: 8px; text-align: left; border-bottom: 1px solid #ddd;">Description</th>
          <th style="padding: 8px; text-align: right; border-bottom: 1px solid #ddd;">Debit</th>
          <th style="padding: 8px; text-align: right; border-bottom: 1px solid #ddd;">Credit</th>
          <th style="padding: 8px; text-align: right; border-bottom: 1px solid #ddd;">Balance</th>
        </tr>
      </thead>
      <tbody>
        {{#each transactions}}
        <tr>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">{{formatDate date}}</td>
          <td style="padding: 8px; border-bottom: 1px solid #eee;">{{description}}</td>
          <td style="padding: 8px; text-align: right; border-bottom: 1px solid #eee;">{{#ifPositive debitCents}}{{formatCurrency debitCents}}{{/ifPositive}}</td>
          <td style="padding: 8px; text-align: right; border-bottom: 1px solid #eee; color: green;">{{#ifPositive creditCents}}{{formatCurrency creditCents}}{{/ifPositive}}</td>
          <td style="padding: 8px; text-align: right; border-bottom: 1px solid #eee;">{{formatCurrency balanceCents}}</td>
        </tr>
        {{/each}}
      </tbody>
    </table>

    {{#if viewStatementUrl}}
    <div style="text-align: center; margin: 20px 0;">
      <a href="{{viewStatementUrl}}" style="background-color: {{defaultColor primaryColor '#007bff'}}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">View Full Statement</a>
    </div>
    {{/if}}
  </div>

  <div style="background-color: #333; color: #999; padding: 20px; text-align: center; font-size: 12px;">
    {{#if footerText}}
    <p>{{footerText}}</p>
    {{/if}}
    {{#if supportEmail}}
    <p>Questions? Contact us at <a href="mailto:{{supportEmail}}" style="color: #007bff;">{{supportEmail}}</a></p>
    {{/if}}
    <p>&copy; {{currentYear}} {{tenantName}}. All rights reserved.</p>
  </div>
</body>
</html>`;
  }

  private getEmbeddedStatementTextTemplate(): string {
    return `{{tenantName}}
ACCOUNT STATEMENT
================

Dear {{recipientName}},

Statement for period {{formatDate periodStart}} to {{formatDate periodEnd}}.

Statement Date: {{formatDate statementDate}}

SUMMARY
-------
Opening Balance: {{formatCurrency openingBalanceCents}}
Total Charges: {{formatCurrency totalChargesCents}}
Total Payments: -{{formatCurrency totalPaymentsCents}}
CLOSING BALANCE: {{formatCurrency closingBalanceCents}}

TRANSACTIONS
------------
{{#each transactions}}
{{formatDate date}} | {{description}}
  Debit: {{formatCurrency debitCents}} | Credit: {{formatCurrency creditCents}} | Balance: {{formatCurrency balanceCents}}
{{/each}}

{{#if footerText}}
{{footerText}}
{{/if}}
{{#if supportEmail}}
Questions? Contact us at {{supportEmail}}
{{/if}}

(c) {{currentYear}} {{tenantName}}`;
  }

  private getEmbeddedReminderHtmlTemplate(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Reminder</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: {{#if isFinalReminder}}#dc3545{{else}}{{defaultColor primaryColor '#007bff'}}{{/if}}; color: white; padding: 20px; text-align: center;">
    {{#if tenantLogo}}
    <img src="{{tenantLogo}}" alt="{{tenantName}}" style="max-height: 60px; margin-bottom: 10px;">
    {{/if}}
    <h1 style="margin: 0; font-size: 24px;">{{tenantName}}</h1>
    <p style="margin: 5px 0 0 0;">{{#if isFinalReminder}}URGENT: Final Payment Reminder{{else}}Payment Reminder{{/if}}</p>
  </div>

  <div style="padding: 20px; background-color: #f9f9f9;">
    <p>Dear {{recipientName}},</p>

    {{#if isFinalReminder}}
    <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 15px 0; border-radius: 5px;">
      <strong>URGENT:</strong> This is a final reminder. Please settle your account immediately to avoid service disruption.
    </div>
    {{/if}}

    <p>This is a friendly reminder that payment is {{#ifOverdue daysOverdue}}overdue{{else}}due soon{{/ifOverdue}} for the following invoice:</p>

    <div style="background-color: white; padding: 15px; border: 1px solid #ddd; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0;"><strong>Invoice Number:</strong></td>
          <td style="padding: 8px 0; text-align: right;">{{invoiceNumber}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Invoice Date:</strong></td>
          <td style="padding: 8px 0; text-align: right;">{{formatDate invoiceDate}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Due Date:</strong></td>
          <td style="padding: 8px 0; text-align: right; {{#ifOverdue daysOverdue}}color: #dc3545;{{/ifOverdue}}">{{formatDate dueDate}}</td>
        </tr>
        {{#ifOverdue daysOverdue}}
        <tr>
          <td style="padding: 8px 0;"><strong>Days Overdue:</strong></td>
          <td style="padding: 8px 0; text-align: right; color: #dc3545;">{{daysOverdue}} days</td>
        </tr>
        {{/ifOverdue}}
        <tr style="font-size: 18px; color: {{#if isFinalReminder}}#dc3545{{else}}{{defaultColor primaryColor '#007bff'}}{{/if}};">
          <td style="padding: 12px 0; border-top: 2px solid #ddd;"><strong>Amount Due:</strong></td>
          <td style="padding: 12px 0; text-align: right; border-top: 2px solid #ddd;"><strong>{{formatCurrency amountDueCents}}</strong></td>
        </tr>
      </table>
    </div>

    {{#if paymentUrl}}
    <div style="text-align: center; margin: 20px 0;">
      <a href="{{paymentUrl}}" style="background-color: {{#if isFinalReminder}}#dc3545{{else}}{{defaultColor primaryColor '#007bff'}}{{/if}}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Pay Now</a>
    </div>
    {{/if}}

    <p>If you have already made payment, please disregard this reminder.</p>
    <p>Thank you for your prompt attention to this matter.</p>
  </div>

  <div style="background-color: #333; color: #999; padding: 20px; text-align: center; font-size: 12px;">
    {{#if footerText}}
    <p>{{footerText}}</p>
    {{/if}}
    {{#if supportEmail}}
    <p>Questions? Contact us at <a href="mailto:{{supportEmail}}" style="color: #007bff;">{{supportEmail}}</a></p>
    {{/if}}
    <p>&copy; {{currentYear}} {{tenantName}}. All rights reserved.</p>
  </div>
</body>
</html>`;
  }

  private getEmbeddedReminderTextTemplate(): string {
    return `{{tenantName}}
{{#if isFinalReminder}}URGENT: FINAL PAYMENT REMINDER{{else}}PAYMENT REMINDER{{/if}}
================

Dear {{recipientName}},

{{#if isFinalReminder}}
URGENT: This is a final reminder. Please settle your account immediately to avoid service disruption.
{{/if}}

This is a friendly reminder that payment is {{#ifOverdue daysOverdue}}overdue{{else}}due soon{{/ifOverdue}} for the following invoice:

Invoice Number: {{invoiceNumber}}
Invoice Date: {{formatDate invoiceDate}}
Due Date: {{formatDate dueDate}}
{{#ifOverdue daysOverdue}}
Days Overdue: {{daysOverdue}} days
{{/ifOverdue}}

AMOUNT DUE: {{formatCurrency amountDueCents}}

If you have already made payment, please disregard this reminder.

Thank you for your prompt attention to this matter.

{{#if footerText}}
{{footerText}}
{{/if}}
{{#if supportEmail}}
Questions? Contact us at {{supportEmail}}
{{/if}}

(c) {{currentYear}} {{tenantName}}`;
  }

  private getEmbeddedReceiptHtmlTemplate(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Receipt</title>
</head>
<body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background-color: {{defaultColor primaryColor '#007bff'}}; color: white; padding: 20px; text-align: center;">
    {{#if tenantLogo}}
    <img src="{{tenantLogo}}" alt="{{tenantName}}" style="max-height: 60px; margin-bottom: 10px;">
    {{/if}}
    <h1 style="margin: 0; font-size: 24px;">{{tenantName}}</h1>
    <p style="margin: 5px 0 0 0;">Payment Receipt</p>
  </div>

  <div style="padding: 20px; background-color: #f9f9f9;">
    <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; margin-bottom: 20px; border-radius: 5px; text-align: center;">
      <span style="font-size: 24px; color: #155724;">&#10004;</span>
      <p style="margin: 10px 0 0 0; color: #155724; font-weight: bold;">Payment Received - Thank You!</p>
    </div>

    <p>Dear {{recipientName}},</p>
    <p>We have received your payment. Please keep this receipt for your records.</p>

    <div style="background-color: white; padding: 15px; border: 1px solid #ddd; margin: 20px 0;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0;"><strong>Receipt Number:</strong></td>
          <td style="padding: 8px 0; text-align: right;">{{receiptNumber}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Payment Date:</strong></td>
          <td style="padding: 8px 0; text-align: right;">{{formatDate paymentDate}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0;"><strong>Payment Method:</strong></td>
          <td style="padding: 8px 0; text-align: right;">{{paymentMethod}}</td>
        </tr>
        {{#if referenceNumber}}
        <tr>
          <td style="padding: 8px 0;"><strong>Reference:</strong></td>
          <td style="padding: 8px 0; text-align: right;">{{referenceNumber}}</td>
        </tr>
        {{/if}}
        <tr style="font-size: 18px; color: #28a745;">
          <td style="padding: 12px 0; border-top: 2px solid #ddd;"><strong>Amount Paid:</strong></td>
          <td style="padding: 12px 0; text-align: right; border-top: 2px solid #ddd;"><strong>{{formatCurrency amountPaidCents}}</strong></td>
        </tr>
      </table>
    </div>

    {{#if appliedToInvoices.length}}
    <h3 style="border-bottom: 2px solid {{defaultColor primaryColor '#007bff'}}; padding-bottom: 10px;">Applied To</h3>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="background-color: #f0f0f0;">
          <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Invoice</th>
          <th style="padding: 10px; text-align: right; border-bottom: 1px solid #ddd;">Amount Applied</th>
        </tr>
      </thead>
      <tbody>
        {{#each appliedToInvoices}}
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">{{invoiceNumber}}</td>
          <td style="padding: 10px; text-align: right; border-bottom: 1px solid #eee;">{{formatCurrency amountAppliedCents}}</td>
        </tr>
        {{/each}}
      </tbody>
    </table>
    {{/if}}

    <div style="background-color: white; padding: 15px; border: 1px solid #ddd;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0;"><strong>Remaining Balance:</strong></td>
          <td style="padding: 8px 0; text-align: right;">{{formatCurrency remainingBalanceCents}}</td>
        </tr>
      </table>
    </div>

    <p style="margin-top: 20px;">Thank you for your payment!</p>
  </div>

  <div style="background-color: #333; color: #999; padding: 20px; text-align: center; font-size: 12px;">
    {{#if footerText}}
    <p>{{footerText}}</p>
    {{/if}}
    {{#if supportEmail}}
    <p>Questions? Contact us at <a href="mailto:{{supportEmail}}" style="color: #007bff;">{{supportEmail}}</a></p>
    {{/if}}
    <p>&copy; {{currentYear}} {{tenantName}}. All rights reserved.</p>
  </div>
</body>
</html>`;
  }

  private getEmbeddedReceiptTextTemplate(): string {
    return `{{tenantName}}
PAYMENT RECEIPT
================

Payment Received - Thank You!

Dear {{recipientName}},

We have received your payment. Please keep this receipt for your records.

Receipt Number: {{receiptNumber}}
Payment Date: {{formatDate paymentDate}}
Payment Method: {{paymentMethod}}
{{#if referenceNumber}}
Reference: {{referenceNumber}}
{{/if}}

AMOUNT PAID: {{formatCurrency amountPaidCents}}

{{#if appliedToInvoices.length}}
Applied To:
{{#each appliedToInvoices}}
- Invoice {{invoiceNumber}}: {{formatCurrency amountAppliedCents}}
{{/each}}
{{/if}}

Remaining Balance: {{formatCurrency remainingBalanceCents}}

Thank you for your payment!

{{#if footerText}}
{{footerText}}
{{/if}}
{{#if supportEmail}}
Questions? Contact us at {{supportEmail}}
{{/if}}

(c) {{currentYear}} {{tenantName}}`;
  }
}
