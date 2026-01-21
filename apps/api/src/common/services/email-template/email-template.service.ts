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
  WELCOME_PACK_EMAIL = 'welcome_pack_email',
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
  // TASK-BILL-043: Bank details for payment instructions in emails
  /** Bank name */
  bankName?: string;
  /** Bank account holder name */
  bankAccountHolder?: string;
  /** Bank account number */
  bankAccountNumber?: string;
  /** Bank branch code */
  bankBranchCode?: string;
  /** Bank account type (e.g., 'Cheque', 'Savings') */
  bankAccountType?: string;
  /** SWIFT code for international transfers */
  bankSwiftCode?: string;
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
  /** Child's full name for payment reference */
  childName: string;
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
  /** Children's names for payment reference (may be multiple) */
  childNames: string;
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
 * Welcome pack email template data (TASK-ENROL-007)
 */
export interface WelcomePackEmailData extends BaseEmailTemplateData {
  /** Child's full name */
  childName: string;
  /** Enrollment start date */
  startDate: Date | string;
  /** Fee tier/structure name */
  feeTierName: string;
  /** Monthly fee in cents */
  monthlyFeeCents: number;
  /** Creche operating hours */
  operatingHours?: string;
  /** Custom welcome message from tenant */
  welcomeMessage?: string;
  /** Link to download welcome pack PDF */
  welcomePackDownloadUrl?: string;
  /** Link to parent portal (if applicable) */
  parentPortalUrl?: string;
}

/**
 * Union type for all template data types
 */
export type EmailTemplateData =
  | InvoiceEmailData
  | StatementEmailData
  | ReminderEmailData
  | PaymentReceiptData
  | WelcomePackEmailData;

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

    // Welcome pack email template (TASK-ENROL-007)
    this.templates.set(
      EmailTemplateName.WELCOME_PACK_EMAIL,
      Handlebars.compile(this.getEmbeddedWelcomePackHtmlTemplate()),
    );
    this.textTemplates.set(
      EmailTemplateName.WELCOME_PACK_EMAIL,
      Handlebars.compile(this.getEmbeddedWelcomePackTextTemplate()),
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
   * Render welcome pack email (TASK-ENROL-007)
   */
  renderWelcomePackEmail(data: WelcomePackEmailData): RenderedEmail {
    return this.render(EmailTemplateName.WELCOME_PACK_EMAIL, data);
  }

  /**
   * Generate email subject based on template type
   */
  private generateSubject(
    templateName: EmailTemplateName,
    data: Record<string, unknown>,
  ): string {
    // Use generic fallback for white-labeling when tenant name not provided
    const tenantName = (data.tenantName as string) || 'Our Organization';

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
      case EmailTemplateName.WELCOME_PACK_EMAIL:
        return `Welcome to ${tenantName} - ${(data as unknown as WelcomePackEmailData).childName || 'Your Child'}'s Enrollment`;
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

    <!-- Bank Details / Payment Instructions -->
    {{#if bankAccountNumber}}
    <div style="background-color: #e8f4fd; padding: 20px; border-radius: 8px; margin: 25px 0; border: 1px solid #b8daff;">
      <h3 style="margin: 0 0 15px 0; color: {{defaultColor primaryColor '#007bff'}}; font-size: 16px;">Payment Instructions</h3>
      <p style="margin: 0 0 15px 0; color: #555; font-size: 14px;">Please use the following banking details to make your payment:</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: #555; width: 45%;">Bank:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #333;">{{bankName}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Account Holder:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #333;">{{bankAccountHolder}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Account Number:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #333;">{{bankAccountNumber}}</td>
        </tr>
        {{#if bankBranchCode}}
        <tr>
          <td style="padding: 8px 0; color: #555;">Branch Code:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #333;">{{bankBranchCode}}</td>
        </tr>
        {{/if}}
        {{#if bankAccountType}}
        <tr>
          <td style="padding: 8px 0; color: #555;">Account Type:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #333;">{{bankAccountType}}</td>
        </tr>
        {{/if}}
        {{#if bankSwiftCode}}
        <tr>
          <td style="padding: 8px 0; color: #555;">SWIFT Code:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #333;">{{bankSwiftCode}}</td>
        </tr>
        {{/if}}
      </table>
      <div style="background-color: #fff3cd; padding: 12px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #ffc107;">
        <p style="margin: 0; font-size: 13px; color: #856404;">
          <strong>Reference:</strong> Please use "{{childName}}" as the payment reference.
        </p>
      </div>
    </div>
    {{/if}}

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

{{#if bankAccountNumber}}
PAYMENT INSTRUCTIONS
--------------------
Please use the following banking details to make your payment:

Bank: {{bankName}}
Account Holder: {{bankAccountHolder}}
Account Number: {{bankAccountNumber}}
{{#if bankBranchCode}}Branch Code: {{bankBranchCode}}{{/if}}
{{#if bankAccountType}}Account Type: {{bankAccountType}}{{/if}}
{{#if bankSwiftCode}}SWIFT Code: {{bankSwiftCode}}{{/if}}

Reference: Please use "{{childName}}" as the payment reference.
{{/if}}

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
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; padding: 0; background-color: #f5f5f5;">
  <!-- Header with branding -->
  <div style="background: linear-gradient(135deg, {{defaultColor primaryColor '#007bff'}} 0%, {{defaultColor secondaryColor '#0056b3'}} 100%); color: white; padding: 30px 25px; text-align: center; border-radius: 0 0 20px 20px;">
    {{#if tenantLogo}}
    <img src="{{tenantLogo}}" alt="{{tenantName}}" style="max-height: 70px; margin-bottom: 15px;">
    {{/if}}
    <h1 style="margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.5px;">{{tenantName}}</h1>
    <p style="margin: 8px 0 0 0; font-size: 16px; opacity: 0.9;">Account Statement</p>
  </div>

  <!-- Main content -->
  <div style="padding: 30px 25px; background-color: #ffffff; margin: 0;">
    <p style="font-size: 16px; margin-bottom: 5px;">Dear <strong>{{recipientName}}</strong>,</p>
    <p style="color: #666; margin-top: 0;">Please find your account statement for the period <strong>{{formatDate periodStart}}</strong> to <strong>{{formatDate periodEnd}}</strong>.</p>
    <p style="color: #666; font-size: 14px;">A detailed PDF statement is attached to this email for your records.</p>

    <!-- Account Summary Card -->
    <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 4px solid {{defaultColor primaryColor '#007bff'}};">
      <h3 style="margin: 0 0 15px 0; color: {{defaultColor primaryColor '#007bff'}}; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px;">Account Summary</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; color: #555;">Statement Date:</td>
          <td style="padding: 10px 0; text-align: right; font-weight: 500;">{{formatDate statementDate}}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #555;">Opening Balance:</td>
          <td style="padding: 10px 0; text-align: right; font-weight: 500;">{{formatCurrency openingBalanceCents}}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #555;">Total Charges:</td>
          <td style="padding: 10px 0; text-align: right; font-weight: 500; color: #dc3545;">{{formatCurrency totalChargesCents}}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #555;">Total Payments:</td>
          <td style="padding: 10px 0; text-align: right; font-weight: 500; color: #28a745;">-{{formatCurrency totalPaymentsCents}}</td>
        </tr>
        <tr style="border-top: 2px solid {{defaultColor primaryColor '#007bff'}};">
          <td style="padding: 15px 0 10px 0; font-size: 18px; font-weight: 600; color: #333;">Amount Due:</td>
          <td style="padding: 15px 0 10px 0; text-align: right; font-size: 22px; font-weight: 700; color: {{defaultColor primaryColor '#007bff'}};">{{formatCurrency closingBalanceCents}}</td>
        </tr>
      </table>
    </div>

    <!-- Recent Transactions -->
    <h3 style="border-bottom: 2px solid {{defaultColor primaryColor '#007bff'}}; padding-bottom: 10px; color: #333; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px;">Recent Transactions</h3>
    <div style="overflow-x: auto;">
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 25px; font-size: 13px;">
        <thead>
          <tr style="background-color: {{defaultColor primaryColor '#007bff'}}; color: white;">
            <th style="padding: 12px 8px; text-align: left; border-radius: 6px 0 0 0;">Date</th>
            <th style="padding: 12px 8px; text-align: left;">Description</th>
            <th style="padding: 12px 8px; text-align: right;">Debit</th>
            <th style="padding: 12px 8px; text-align: right;">Credit</th>
            <th style="padding: 12px 8px; text-align: right; border-radius: 0 6px 0 0;">Balance</th>
          </tr>
        </thead>
        <tbody>
          {{#each transactions}}
          <tr style="{{#if @odd}}background-color: #f8f9fa;{{/if}}">
            <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">{{formatDate date}}</td>
            <td style="padding: 10px 8px; border-bottom: 1px solid #eee;">{{description}}</td>
            <td style="padding: 10px 8px; text-align: right; border-bottom: 1px solid #eee; color: #dc3545;">{{#ifPositive debitCents}}{{formatCurrency debitCents}}{{/ifPositive}}</td>
            <td style="padding: 10px 8px; text-align: right; border-bottom: 1px solid #eee; color: #28a745;">{{#ifPositive creditCents}}{{formatCurrency creditCents}}{{/ifPositive}}</td>
            <td style="padding: 10px 8px; text-align: right; border-bottom: 1px solid #eee; font-weight: 600;">{{formatCurrency balanceCents}}</td>
          </tr>
          {{/each}}
        </tbody>
      </table>
    </div>

    <!-- Bank Details / Payment Instructions (TASK-BILL-043) -->
    {{#if bankAccountNumber}}
    <div style="background-color: #e8f4fd; padding: 20px; border-radius: 12px; margin: 25px 0; border: 1px solid #b8daff;">
      <h3 style="margin: 0 0 15px 0; color: {{defaultColor primaryColor '#007bff'}}; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px;">
        <span style="margin-right: 8px;">&#128179;</span>Payment Instructions
      </h3>
      <p style="margin: 0 0 15px 0; color: #555; font-size: 14px;">Please use the following banking details to make your payment:</p>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr>
          <td style="padding: 8px 0; color: #555; width: 45%;">Bank:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #333;">{{bankName}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Account Holder:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #333;">{{bankAccountHolder}}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #555;">Account Number:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #333;">{{bankAccountNumber}}</td>
        </tr>
        {{#if bankBranchCode}}
        <tr>
          <td style="padding: 8px 0; color: #555;">Branch Code:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #333;">{{bankBranchCode}}</td>
        </tr>
        {{/if}}
        {{#if bankAccountType}}
        <tr>
          <td style="padding: 8px 0; color: #555;">Account Type:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #333;">{{bankAccountType}}</td>
        </tr>
        {{/if}}
        {{#if bankSwiftCode}}
        <tr>
          <td style="padding: 8px 0; color: #555;">SWIFT Code:</td>
          <td style="padding: 8px 0; font-weight: 600; color: #333;">{{bankSwiftCode}}</td>
        </tr>
        {{/if}}
      </table>
      <div style="background-color: #fff3cd; padding: 12px; border-radius: 6px; margin-top: 15px; border-left: 4px solid #ffc107;">
        <p style="margin: 0; font-size: 13px; color: #856404;">
          <strong>Reference:</strong> Please use "{{childNames}}" as the payment reference.
        </p>
      </div>
    </div>
    {{/if}}

    {{#if viewStatementUrl}}
    <div style="text-align: center; margin: 30px 0;">
      <a href="{{viewStatementUrl}}" style="background: linear-gradient(135deg, {{defaultColor primaryColor '#007bff'}} 0%, {{defaultColor secondaryColor '#0056b3'}} 100%); color: white; padding: 14px 35px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600; box-shadow: 0 4px 15px rgba(0,123,255,0.3);">View Full Statement Online</a>
    </div>
    {{/if}}

    <p style="color: #666; font-size: 14px; margin-top: 25px;">If you have any questions about your statement, please don't hesitate to contact us.</p>
    <p style="color: #666; font-size: 14px;">Thank you for choosing us for your childcare needs.</p>
  </div>

  <!-- Footer -->
  <div style="background-color: #2c3e50; color: #bdc3c7; padding: 25px; text-align: center; font-size: 12px;">
    {{#if footerText}}
    <p style="margin: 0 0 10px 0;">{{footerText}}</p>
    {{/if}}
    {{#if supportEmail}}
    <p style="margin: 0 0 10px 0;">Questions? Contact us at <a href="mailto:{{supportEmail}}" style="color: {{defaultColor primaryColor '#007bff'}}; text-decoration: none;">{{supportEmail}}</a>{{#if supportPhone}} | {{supportPhone}}{{/if}}</p>
    {{/if}}
    <p style="margin: 0; opacity: 0.7;">&copy; {{currentYear}} {{tenantName}}. All rights reserved.</p>
  </div>
</body>
</html>`;
  }

  private getEmbeddedStatementTextTemplate(): string {
    return `{{tenantName}}
ACCOUNT STATEMENT
================

Dear {{recipientName}},

Please find your account statement for the period {{formatDate periodStart}} to {{formatDate periodEnd}}.
A detailed PDF statement is attached to this email for your records.

Statement Date: {{formatDate statementDate}}

ACCOUNT SUMMARY
---------------
Opening Balance: {{formatCurrency openingBalanceCents}}
Total Charges: {{formatCurrency totalChargesCents}}
Total Payments: -{{formatCurrency totalPaymentsCents}}
----------------------------------------
AMOUNT DUE: {{formatCurrency closingBalanceCents}}

RECENT TRANSACTIONS
-------------------
{{#each transactions}}
{{formatDate date}} | {{description}}
  Debit: {{formatCurrency debitCents}} | Credit: {{formatCurrency creditCents}} | Balance: {{formatCurrency balanceCents}}
{{/each}}

{{#if bankAccountNumber}}
PAYMENT INSTRUCTIONS
--------------------
Please use the following banking details to make your payment:

Bank: {{bankName}}
Account Holder: {{bankAccountHolder}}
Account Number: {{bankAccountNumber}}
{{#if bankBranchCode}}Branch Code: {{bankBranchCode}}{{/if}}
{{#if bankAccountType}}Account Type: {{bankAccountType}}{{/if}}
{{#if bankSwiftCode}}SWIFT Code: {{bankSwiftCode}}{{/if}}

Reference: Please use "{{childNames}}" as the payment reference.
{{/if}}

If you have any questions about your statement, please don't hesitate to contact us.
Thank you for choosing us for your childcare needs.

{{#if footerText}}
{{footerText}}
{{/if}}
{{#if supportEmail}}
Questions? Contact us at {{supportEmail}}{{#if supportPhone}} | {{supportPhone}}{{/if}}
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

  /**
   * Welcome pack HTML email template (TASK-ENROL-007)
   */
  private getEmbeddedWelcomePackHtmlTemplate(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to {{tenantName}}</title>
</head>
<body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; max-width: 650px; margin: 0 auto; padding: 0; background-color: #f5f5f5;">
  <!-- Header with branding -->
  <div style="background: linear-gradient(135deg, {{defaultColor primaryColor '#007bff'}} 0%, {{defaultColor secondaryColor '#0056b3'}} 100%); color: white; padding: 30px 25px; text-align: center; border-radius: 0 0 20px 20px;">
    {{#if tenantLogo}}
    <img src="{{tenantLogo}}" alt="{{tenantName}}" style="max-height: 70px; margin-bottom: 15px;">
    {{/if}}
    <h1 style="margin: 0; font-size: 28px; font-weight: 600; letter-spacing: -0.5px;">{{tenantName}}</h1>
    <p style="margin: 8px 0 0 0; font-size: 16px; opacity: 0.9;">Welcome to Our Family!</p>
  </div>

  <!-- Main content -->
  <div style="padding: 30px 25px; background-color: #ffffff; margin: 0;">
    <!-- Welcome banner -->
    <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 20px; margin-bottom: 25px; border-radius: 10px; text-align: center;">
      <span style="font-size: 36px;">&#127881;</span>
      <h2 style="margin: 10px 0 5px 0; color: #155724; font-size: 22px;">Welcome, {{recipientName}}!</h2>
      <p style="margin: 0; color: #155724; font-size: 15px;">We are thrilled to have {{childName}} joining us!</p>
    </div>

    {{#if welcomeMessage}}
    <div style="background-color: #f8f9fa; padding: 15px 20px; border-radius: 8px; margin-bottom: 25px; border-left: 4px solid {{defaultColor primaryColor '#007bff'}};">
      <p style="margin: 0; color: #555; font-style: italic;">{{welcomeMessage}}</p>
    </div>
    {{/if}}

    <!-- Enrollment Details Card -->
    <div style="background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); padding: 20px; border-radius: 12px; margin: 25px 0; border-left: 4px solid {{defaultColor primaryColor '#007bff'}};">
      <h3 style="margin: 0 0 15px 0; color: {{defaultColor primaryColor '#007bff'}}; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px;">Enrollment Confirmation</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 10px 0; color: #555;">Child's Name:</td>
          <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #333;">{{childName}}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #555;">Start Date:</td>
          <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #333;">{{formatDate startDate}}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #555;">Fee Structure:</td>
          <td style="padding: 10px 0; text-align: right; font-weight: 600; color: #333;">{{feeTierName}}</td>
        </tr>
        <tr style="border-top: 2px solid {{defaultColor primaryColor '#007bff'}};">
          <td style="padding: 15px 0 10px 0; font-size: 16px; font-weight: 600; color: #333;">Monthly Fee:</td>
          <td style="padding: 15px 0 10px 0; text-align: right; font-size: 20px; font-weight: 700; color: {{defaultColor primaryColor '#007bff'}};">{{formatCurrency monthlyFeeCents}}</td>
        </tr>
      </table>
    </div>

    {{#if operatingHours}}
    <!-- Operating Hours -->
    <div style="background-color: #e7f3ff; padding: 15px 20px; border-radius: 8px; margin-bottom: 25px;">
      <h4 style="margin: 0 0 8px 0; color: {{defaultColor primaryColor '#007bff'}}; font-size: 14px;">
        <span style="margin-right: 8px;">&#128336;</span>Operating Hours
      </h4>
      <p style="margin: 0; color: #333; font-weight: 500;">{{operatingHours}}</p>
    </div>
    {{/if}}

    <!-- Next Steps -->
    <h3 style="border-bottom: 2px solid {{defaultColor primaryColor '#007bff'}}; padding-bottom: 10px; color: #333; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px;">What's Next?</h3>
    <ul style="padding-left: 20px; color: #555;">
      <li style="margin-bottom: 10px;">Review your welcome pack documents for important information about our policies and procedures.</li>
      <li style="margin-bottom: 10px;">Mark <strong>{{formatDate startDate}}</strong> on your calendar - that's when the adventure begins!</li>
      <li style="margin-bottom: 10px;">Prepare {{childName}}'s essentials: change of clothes, water bottle, and any comfort items.</li>
      <li style="margin-bottom: 10px;">Complete any outstanding enrollment forms before the start date.</li>
      {{#if parentPortalUrl}}
      <li style="margin-bottom: 10px;">Set up your parent portal account to stay connected with {{childName}}'s daily activities.</li>
      {{/if}}
    </ul>

    <!-- Action Buttons -->
    <div style="text-align: center; margin: 30px 0;">
      {{#if welcomePackDownloadUrl}}
      <a href="{{welcomePackDownloadUrl}}" style="background: linear-gradient(135deg, {{defaultColor primaryColor '#007bff'}} 0%, {{defaultColor secondaryColor '#0056b3'}} 100%); color: white; padding: 14px 35px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600; box-shadow: 0 4px 15px rgba(0,123,255,0.3); margin: 5px;">
        <span style="margin-right: 8px;">&#128196;</span>Download Welcome Pack
      </a>
      {{/if}}
      {{#if parentPortalUrl}}
      <a href="{{parentPortalUrl}}" style="background: transparent; color: {{defaultColor primaryColor '#007bff'}}; padding: 14px 35px; text-decoration: none; border-radius: 25px; display: inline-block; font-weight: 600; border: 2px solid {{defaultColor primaryColor '#007bff'}}; margin: 5px;">
        <span style="margin-right: 8px;">&#128100;</span>Parent Portal
      </a>
      {{/if}}
    </div>

    <p style="color: #666; font-size: 14px; margin-top: 25px;">We can't wait to see {{childName}} on {{formatDate startDate}}! If you have any questions before then, please don't hesitate to reach out.</p>
    <p style="color: #666; font-size: 14px;">With warm regards,<br><strong>The {{tenantName}} Team</strong></p>
  </div>

  <!-- Footer -->
  <div style="background-color: #2c3e50; color: #bdc3c7; padding: 25px; text-align: center; font-size: 12px;">
    {{#if footerText}}
    <p style="margin: 0 0 10px 0;">{{footerText}}</p>
    {{/if}}
    {{#if supportEmail}}
    <p style="margin: 0 0 10px 0;">Questions? Contact us at <a href="mailto:{{supportEmail}}" style="color: {{defaultColor primaryColor '#007bff'}}; text-decoration: none;">{{supportEmail}}</a>{{#if supportPhone}} | {{supportPhone}}{{/if}}</p>
    {{/if}}
    <p style="margin: 0; opacity: 0.7;">&copy; {{currentYear}} {{tenantName}}. All rights reserved.</p>
  </div>
</body>
</html>`;
  }

  /**
   * Welcome pack text email template (TASK-ENROL-007)
   */
  private getEmbeddedWelcomePackTextTemplate(): string {
    return `{{tenantName}}
WELCOME TO OUR FAMILY!
======================

Dear {{recipientName}},

We are thrilled to have {{childName}} joining us!

{{#if welcomeMessage}}
{{welcomeMessage}}
{{/if}}

ENROLLMENT CONFIRMATION
-----------------------
Child's Name: {{childName}}
Start Date: {{formatDate startDate}}
Fee Structure: {{feeTierName}}
Monthly Fee: {{formatCurrency monthlyFeeCents}}

{{#if operatingHours}}
OPERATING HOURS
---------------
{{operatingHours}}
{{/if}}

WHAT'S NEXT?
------------
1. Review your welcome pack documents for important information about our policies and procedures.
2. Mark {{formatDate startDate}} on your calendar - that's when the adventure begins!
3. Prepare {{childName}}'s essentials: change of clothes, water bottle, and any comfort items.
4. Complete any outstanding enrollment forms before the start date.
{{#if parentPortalUrl}}
5. Set up your parent portal account to stay connected with {{childName}}'s daily activities.
{{/if}}

{{#if welcomePackDownloadUrl}}
Download your welcome pack: {{welcomePackDownloadUrl}}
{{/if}}

{{#if parentPortalUrl}}
Access the parent portal: {{parentPortalUrl}}
{{/if}}

We can't wait to see {{childName}} on {{formatDate startDate}}! If you have any questions before then, please don't hesitate to reach out.

With warm regards,
The {{tenantName}} Team

{{#if footerText}}
{{footerText}}
{{/if}}
{{#if supportEmail}}
Questions? Contact us at {{supportEmail}}{{#if supportPhone}} | {{supportPhone}}{{/if}}
{{/if}}

(c) {{currentYear}} {{tenantName}}`;
  }
}
