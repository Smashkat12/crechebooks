/**
 * WhatsApp Template Types
 * TASK-WA-002: WhatsApp Template Management Service
 *
 * Defines template structures, configurations, and parameter schemas
 * for Meta Cloud API WhatsApp Business templates.
 */

import { WhatsAppTemplateName, TemplateComponent } from './whatsapp.types';

/**
 * Template parameter definition for validation
 */
export interface TemplateParameterDef {
  name: string;
  type: 'text' | 'currency' | 'date_time' | 'document' | 'image';
  required: boolean;
  maxLength?: number;
  format?: string;
  description?: string;
}

/**
 * Template header type
 */
export type TemplateHeaderType = 'none' | 'text' | 'document' | 'image';

/**
 * Template button definition
 */
export interface TemplateButtonDef {
  type: 'url' | 'quick_reply' | 'phone_number';
  text: string;
  /** For URL buttons - can include {{1}} placeholder */
  url?: string;
  /** For phone number buttons */
  phoneNumber?: string;
}

/**
 * Complete template definition
 */
export interface TemplateDefinition {
  /** Unique template name registered with Meta */
  name: WhatsAppTemplateName;
  /** Human-readable description */
  description: string;
  /** Language code (e.g., 'en', 'en_ZA') */
  language: string;
  /** Template category */
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  /** Header configuration */
  header?: {
    type: TemplateHeaderType;
    text?: string;
    parameters?: TemplateParameterDef[];
  };
  /** Body text with {{1}}, {{2}} placeholders */
  body: {
    text: string;
    parameters: TemplateParameterDef[];
  };
  /** Footer text (optional, no parameters) */
  footer?: string;
  /** Button definitions */
  buttons?: TemplateButtonDef[];
  /** POPIA compliance metadata */
  compliance: {
    requiresOptIn: boolean;
    dataRetentionDays: number;
    purpose: string;
  };
}

/**
 * Template parameter values for sending
 */
export interface TemplateParameterValues {
  [key: string]: string | number | Date | DocumentParam | ImageParam;
}

/**
 * Document parameter for template
 */
export interface DocumentParam {
  link: string;
  filename: string;
}

/**
 * Image parameter for template
 */
export interface ImageParam {
  link: string;
}

/**
 * Built template ready for API
 */
export interface BuiltTemplate {
  name: WhatsAppTemplateName;
  language: { code: string };
  components: TemplateComponent[];
}

/**
 * Template validation result
 */
export interface TemplateValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Template usage context for audit
 */
export interface TemplateUsageContext {
  tenantId: string;
  parentId?: string;
  contextType: 'INVOICE' | 'REMINDER' | 'STATEMENT' | 'WELCOME' | 'ARREARS';
  contextId?: string;
  recipientPhone: string;
}

/**
 * Pre-defined CrecheBooks templates
 * These must be registered and approved in Meta Business Manager
 */
export const CRECHEBOOKS_TEMPLATES: Record<
  WhatsAppTemplateName,
  TemplateDefinition
> = {
  invoice_notification: {
    name: 'invoice_notification',
    description: 'New invoice notification with amount and due date',
    language: 'en',
    category: 'UTILITY',
    header: {
      type: 'document',
      parameters: [
        {
          name: 'document',
          type: 'document',
          required: true,
          description: 'Invoice PDF',
        },
      ],
    },
    body: {
      text: 'Hello {{1}},\n\nYour invoice {{2}} for {{3}} is now available.\n\nAmount Due: {{4}}\nDue Date: {{5}}\n\nPlease find the invoice attached.',
      parameters: [
        {
          name: 'parentName',
          type: 'text',
          required: true,
          maxLength: 50,
          description: 'Parent first name',
        },
        {
          name: 'invoiceNumber',
          type: 'text',
          required: true,
          maxLength: 20,
          description: 'Invoice number',
        },
        {
          name: 'childName',
          type: 'text',
          required: true,
          maxLength: 50,
          description: 'Child name',
        },
        {
          name: 'amount',
          type: 'currency',
          required: true,
          description: 'Invoice amount (e.g., R1,500.00)',
        },
        {
          name: 'dueDate',
          type: 'date_time',
          required: true,
          format: 'DD MMM YYYY',
          description: 'Due date',
        },
      ],
    },
    footer: 'CrecheBooks - Childcare Management',
    buttons: [
      {
        type: 'url',
        text: 'View Invoice',
        url: 'https://app.crechebooks.co.za/invoices/{{1}}',
      },
    ],
    compliance: {
      requiresOptIn: true,
      dataRetentionDays: 365,
      purpose: 'Invoice delivery as part of childcare service agreement',
    },
  },

  invoice_reminder: {
    name: 'invoice_reminder',
    description: 'Payment reminder for overdue invoice',
    language: 'en',
    category: 'UTILITY',
    body: {
      text: 'Hello {{1}},\n\nThis is a friendly reminder that invoice {{2}} for {{3}} is {{4}} overdue.\n\nAmount Due: {{5}}\nOriginal Due Date: {{6}}\n\nPlease arrange payment at your earliest convenience.',
      parameters: [
        { name: 'parentName', type: 'text', required: true, maxLength: 50 },
        { name: 'invoiceNumber', type: 'text', required: true, maxLength: 20 },
        { name: 'amount', type: 'currency', required: true },
        { name: 'daysOverdue', type: 'text', required: true, maxLength: 10 },
        { name: 'amountDue', type: 'currency', required: true },
        {
          name: 'dueDate',
          type: 'date_time',
          required: true,
          format: 'DD MMM YYYY',
        },
      ],
    },
    footer: 'CrecheBooks - Childcare Management',
    buttons: [
      {
        type: 'url',
        text: 'Pay Now',
        url: 'https://app.crechebooks.co.za/pay/{{1}}',
      },
    ],
    compliance: {
      requiresOptIn: true,
      dataRetentionDays: 365,
      purpose: 'Payment reminder as part of billing service',
    },
  },

  payment_received: {
    name: 'payment_received',
    description: 'Payment confirmation notification',
    language: 'en',
    category: 'UTILITY',
    body: {
      text: 'Hello {{1}},\n\nThank you! We have received your payment of {{2}} for invoice {{3}}.\n\nPayment Reference: {{4}}\nDate: {{5}}\n\nYour account balance is now: {{6}}',
      parameters: [
        { name: 'parentName', type: 'text', required: true, maxLength: 50 },
        { name: 'amount', type: 'currency', required: true },
        { name: 'invoiceNumber', type: 'text', required: true, maxLength: 20 },
        { name: 'reference', type: 'text', required: true, maxLength: 50 },
        {
          name: 'paymentDate',
          type: 'date_time',
          required: true,
          format: 'DD MMM YYYY',
        },
        { name: 'balance', type: 'currency', required: true },
      ],
    },
    footer: 'CrecheBooks - Childcare Management',
    compliance: {
      requiresOptIn: true,
      dataRetentionDays: 365,
      purpose: 'Payment confirmation notification',
    },
  },

  arrears_notice: {
    name: 'arrears_notice',
    description: 'Formal arrears notice for significantly overdue accounts',
    language: 'en',
    category: 'UTILITY',
    body: {
      text: 'Dear {{1}},\n\nIMPORTANT: Your account is {{2}} days in arrears.\n\nTotal Outstanding: {{3}}\nOldest Invoice: {{4}}\n\nPlease contact us urgently to discuss payment arrangements.\n\nFailure to respond may result in service suspension.',
      parameters: [
        { name: 'parentName', type: 'text', required: true, maxLength: 50 },
        { name: 'daysInArrears', type: 'text', required: true, maxLength: 10 },
        { name: 'totalOutstanding', type: 'currency', required: true },
        { name: 'oldestInvoice', type: 'text', required: true, maxLength: 20 },
      ],
    },
    footer: 'CrecheBooks - Childcare Management',
    buttons: [
      { type: 'phone_number', text: 'Call Us', phoneNumber: '+27000000000' },
    ],
    compliance: {
      requiresOptIn: true,
      dataRetentionDays: 730,
      purpose: 'Formal arrears notification as required by service agreement',
    },
  },

  registration_welcome: {
    name: 'registration_welcome',
    description: 'Welcome message after registration',
    language: 'en',
    category: 'UTILITY',
    body: {
      text: 'Welcome to {{1}}, {{2}}!\n\nThank you for registering {{3}} with us.\n\nYou will receive invoices and important updates via WhatsApp.\n\nTo manage your notification preferences, visit your parent portal.',
      parameters: [
        { name: 'crecheName', type: 'text', required: true, maxLength: 100 },
        { name: 'parentName', type: 'text', required: true, maxLength: 50 },
        { name: 'childName', type: 'text', required: true, maxLength: 50 },
      ],
    },
    footer: 'CrecheBooks - Childcare Management',
    buttons: [
      {
        type: 'url',
        text: 'Parent Portal',
        url: 'https://app.crechebooks.co.za/portal',
      },
    ],
    compliance: {
      requiresOptIn: false, // Welcome is sent on registration which is implicit opt-in
      dataRetentionDays: 365,
      purpose: 'Registration confirmation and onboarding',
    },
  },

  // TASK-WA-003: Statement Delivery via WhatsApp
  statement_notification: {
    name: 'statement_notification',
    description: 'Monthly account statement notification with PDF attachment',
    language: 'en',
    category: 'UTILITY',
    header: {
      type: 'document',
      parameters: [
        {
          name: 'document',
          type: 'document',
          required: true,
          description: 'Statement PDF',
        },
      ],
    },
    body: {
      text: 'Hello {{1}},\n\nYour account statement for {{2}} to {{3}} is now available.\n\nOpening Balance: {{4}}\nCharges: {{5}}\nPayments: {{6}}\nClosing Balance: {{7}}\n\nPlease find the statement attached.',
      parameters: [
        {
          name: 'parentName',
          type: 'text',
          required: true,
          maxLength: 50,
          description: 'Parent first name',
        },
        {
          name: 'periodStart',
          type: 'date_time',
          required: true,
          format: 'DD MMM YYYY',
          description: 'Statement period start',
        },
        {
          name: 'periodEnd',
          type: 'date_time',
          required: true,
          format: 'DD MMM YYYY',
          description: 'Statement period end',
        },
        {
          name: 'openingBalance',
          type: 'currency',
          required: true,
          description: 'Opening balance',
        },
        {
          name: 'charges',
          type: 'currency',
          required: true,
          description: 'Total charges',
        },
        {
          name: 'payments',
          type: 'currency',
          required: true,
          description: 'Total payments',
        },
        {
          name: 'closingBalance',
          type: 'currency',
          required: true,
          description: 'Closing balance',
        },
      ],
    },
    footer: 'CrecheBooks - Childcare Management',
    buttons: [
      {
        type: 'url',
        text: 'View Statement',
        url: 'https://app.crechebooks.co.za/statements/{{1}}',
      },
    ],
    compliance: {
      requiresOptIn: true,
      dataRetentionDays: 365,
      purpose: 'Monthly account statement delivery as part of billing service',
    },
  },
};

/**
 * Get template definition by name
 */
export function getTemplateDefinition(
  name: WhatsAppTemplateName,
): TemplateDefinition | undefined {
  return CRECHEBOOKS_TEMPLATES[name];
}

/**
 * Check if template requires opt-in
 */
export function templateRequiresOptIn(name: WhatsAppTemplateName): boolean {
  const template = CRECHEBOOKS_TEMPLATES[name];
  return template?.compliance.requiresOptIn ?? true;
}
