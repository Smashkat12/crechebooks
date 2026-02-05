/**
 * Rich WhatsApp Content Template Definitions
 * TASK-WA-008: Rich WhatsApp Template Definitions
 *
 * Defines all 9 rich templates for WhatsApp messaging via Twilio Content API.
 * Each template uses tenant.tradingName for branding (variable {{9}} or similar).
 *
 * Templates:
 * 1. INVOICE_WITH_DOCUMENT - Card with PDF and Pay Now button
 * 2. PAYMENT_REMINDER_INTERACTIVE - Quick reply with 3 action buttons
 * 3. PAYMENT_CONFIRMATION - Card with receipt PDF
 * 4. ARREARS_NOTICE - CTA with URL + Phone buttons
 * 5. WELCOME_ENROLLMENT - Card with portal setup
 * 6. STATEMENT_NOTIFICATION - Card with statement PDF
 * 7. REMINDER_FRIENDLY - Quick reply (1-7 days overdue)
 * 8. REMINDER_FIRM - Quick reply (8-14 days overdue)
 * 9. REMINDER_FINAL - CTA with urgent tone
 *
 * IMPORTANT: All templates use tenant branding, NOT "CrecheBooks"
 */

import { ContentTemplateDefinition } from '../types/content.types';

/**
 * Invoice notification with PDF card and action buttons
 * Category: UTILITY
 *
 * Variables:
 * - {{1}} invoiceNumber (e.g., "INV-2026-001234")
 * - {{2}} dueDate (e.g., "28 February 2026")
 * - {{3}} parentName (e.g., "Sarah")
 * - {{4}} period (e.g., "February 2026")
 * - {{5}} amount (e.g., "2,450.00")
 * - {{6}} childName (e.g., "Emma Smith")
 * - {{7}} pdfUrl (e.g., "https://api.example.com/invoices/sample/pdf")
 * - {{8}} invoiceId (e.g., "INV-2026-001234")
 * - {{9}} tenantName (e.g., "Little Stars Creche")
 */
export const INVOICE_WITH_DOCUMENT: ContentTemplateDefinition = {
  friendlyName: 'cb_invoice_with_document_v2',
  language: 'en',
  category: 'UTILITY',
  variables: {
    '1': 'INV-2026-001234',
    '2': '28 February 2026',
    '3': 'Sarah',
    '4': 'February 2026',
    '5': '2,450.00',
    '6': 'Emma Smith',
    '7': 'https://api.example.com/invoices/sample/pdf',
    '8': 'INV-2026-001234',
    '9': 'Little Stars Creche',
  },
  types: {
    'twilio/card': {
      title: 'Invoice Ready: {{1}}',
      subtitle: 'New invoice available',
      body: 'Hi {{3}},\n\nYour invoice for {{4}} is ready.\n\nAmount Due: R{{5}}\nChild: {{6}}\nDue Date: {{2}}\n\nKind regards,\n{{9}} Team',
      media: ['{{7}}'],
      actions: [
        {
          type: 'URL',
          title: 'View Invoice',
          url: 'https://app.elleelephant.co.za/invoices/{{8}}',
        },
        {
          type: 'URL',
          title: 'Pay Now',
          url: 'https://app.elleelephant.co.za/pay/{{8}}',
        },
      ],
    },
  },
};

/**
 * Payment reminder with quick reply buttons
 * Category: UTILITY
 *
 * Variables:
 * - {{1}} parentName (e.g., "Sarah")
 * - {{2}} amount (e.g., "2,450.00")
 * - {{3}} childName (e.g., "Emma")
 * - {{4}} daysOverdue (e.g., "7")
 * - {{5}} invoiceNumber (e.g., "INV-2026-001234")
 * - {{6}} dueDate (e.g., "21 February 2026")
 * - {{7}} tenantName (e.g., "Little Stars Creche")
 */
export const PAYMENT_REMINDER_INTERACTIVE: ContentTemplateDefinition = {
  friendlyName: 'cb_payment_reminder_interactive',
  language: 'en',
  category: 'UTILITY',
  variables: {
    '1': 'Sarah',
    '2': '2,450.00',
    '3': 'Emma',
    '4': '7',
    '5': 'INV-2026-001234',
    '6': '21 February 2026',
    '7': 'Little Stars Creche',
  },
  types: {
    'twilio/quick-reply': {
      body: 'Hi {{1}},\n\nThis is a friendly reminder from {{7}} that your payment of R{{2}} for {{3}} is {{4}} days overdue.\n\nInvoice: {{5}}\nOriginal Due Date: {{6}}\n\nPlease select an option:',
      actions: [
        { type: 'QUICK_REPLY', title: 'Pay Now', id: 'pay_{{5}}' },
        {
          type: 'QUICK_REPLY',
          title: 'Request Extension',
          id: 'extension_{{5}}',
        },
        { type: 'QUICK_REPLY', title: 'Contact Us', id: 'contact_{{5}}' },
      ],
    },
  },
};

/**
 * Payment confirmation with receipt card
 * Category: UTILITY
 *
 * Variables:
 * - {{1}} receiptNumber (e.g., "REC-2026-00456")
 * - {{2}} parentName (e.g., "Sarah")
 * - {{3}} amount (e.g., "2,450.00")
 * - {{4}} reference (e.g., "SMITH-FEB-2026")
 * - {{5}} paymentDate (e.g., "15 February 2026")
 * - {{6}} invoiceNumber (e.g., "INV-2026-001234")
 * - {{7}} remainingBalance (e.g., "0.00")
 * - {{8}} receiptPdfUrl (e.g., "https://api.example.com/receipts/sample/pdf")
 * - {{9}} tenantName (e.g., "Little Stars Creche")
 */
export const PAYMENT_CONFIRMATION: ContentTemplateDefinition = {
  friendlyName: 'cb_payment_confirmation_v2',
  language: 'en',
  category: 'UTILITY',
  variables: {
    '1': 'REC-2026-00456',
    '2': 'Sarah',
    '3': '2,450.00',
    '4': 'SMITH-FEB-2026',
    '5': '15 February 2026',
    '6': 'INV-2026-001234',
    '7': '0.00',
    '8': 'https://api.example.com/receipts/sample/pdf',
    '9': 'Little Stars Creche',
  },
  types: {
    'twilio/card': {
      title: 'Payment Received',
      subtitle: 'Thank you for your payment',
      body: "Thank you, {{2}}!\n\nWe've received your payment of R{{3}}.\n\nReceipt: {{1}}\nReference: {{4}}\nDate: {{5}}\nApplied to: {{6}}\n\nRemaining Balance: R{{7}}\n\nKind regards,\n{{9}} Team",
      media: ['{{8}}'],
      actions: [
        {
          type: 'URL',
          title: 'View Receipt',
          url: 'https://app.elleelephant.co.za/receipts/{{1}}',
        },
      ],
    },
  },
};

/**
 * Arrears notice with call-to-action buttons
 * Category: UTILITY
 *
 * Variables:
 * - {{1}} parentFullName (e.g., "Sarah Smith")
 * - {{2}} daysOverdue (e.g., "45")
 * - {{3}} totalAmount (e.g., "4,900.00")
 * - {{4}} oldestInvoice (e.g., "INV-2026-000123")
 * - {{5}} unpaidCount (e.g., "2")
 * - {{6}} tenantName (e.g., "Little Stars Creche")
 * - {{7}} parentId (e.g., "parent-123")
 */
export const ARREARS_NOTICE: ContentTemplateDefinition = {
  friendlyName: 'cb_arrears_notice_v2',
  language: 'en',
  category: 'UTILITY',
  variables: {
    '1': 'Sarah Smith',
    '2': '45',
    '3': '4,900.00',
    '4': 'INV-2026-000123',
    '5': '2',
    '6': 'Little Stars Creche',
    '7': 'parent-123',
  },
  types: {
    'twilio/call-to-action': {
      body: 'Important Account Notice\n\nDear {{1}},\n\nYour account with {{6}} is {{2}} days in arrears with an outstanding balance of R{{3}}.\n\nOldest unpaid invoice: {{4}}\nNumber of unpaid invoices: {{5}}\n\nPlease contact us to discuss payment arrangements.\n\nKind regards,\n{{6}} Team',
      actions: [
        {
          type: 'URL',
          title: 'View Account',
          url: 'https://app.elleelephant.co.za/account/{{7}}',
        },
        {
          type: 'URL',
          title: 'Contact Us',
          url: 'https://app.elleelephant.co.za/contact/{{7}}',
        },
      ],
    },
  },
};

/**
 * Welcome message for new enrollments
 * Category: UTILITY
 *
 * Variables:
 * - {{1}} tenantName (e.g., "Little Stars Creche")
 * - {{2}} parentName (e.g., "Sarah")
 * - {{3}} childName (e.g., "Emma Smith")
 * - {{4}} startDate (e.g., "1 March 2026")
 * - {{5}} monthlyFee (e.g., "2,450.00")
 * - {{6}} feeStructure (e.g., "Full Day")
 * - {{7}} bannerImageUrl (e.g., "https://cdn.example.com/welcome-banner.jpg")
 * - {{8}} onboardToken (e.g., "onboard-token-123")
 */
export const WELCOME_ENROLLMENT: ContentTemplateDefinition = {
  friendlyName: 'cb_welcome_enrollment',
  language: 'en',
  category: 'UTILITY',
  variables: {
    '1': 'Little Stars Creche',
    '2': 'Sarah',
    '3': 'Emma Smith',
    '4': '1 March 2026',
    '5': '2,450.00',
    '6': 'Full Day',
    '7': 'https://cdn.example.com/welcome-banner.jpg',
    '8': 'onboard-token-123',
  },
  types: {
    'twilio/card': {
      title: 'Welcome to {{1}}!',
      subtitle: 'Enrollment Confirmed',
      body: "Dear {{2}},\n\nWe're delighted that {{3}} is joining our family!\n\nEnrollment Details:\n- Start Date: {{4}}\n- Monthly Fee: R{{5}}\n- Fee Structure: {{6}}\n\nYour parent portal is ready. Set up your account to view and pay invoices.",
      media: ['{{7}}'],
      actions: [
        {
          type: 'URL',
          title: 'Set Up Portal',
          url: 'https://app.elleelephant.co.za/onboard/{{8}}',
        },
        {
          type: 'URL',
          title: 'Get Help',
          url: 'https://app.elleelephant.co.za/help/{{8}}',
        },
      ],
    },
  },
};

/**
 * Monthly statement notification
 * Category: UTILITY
 *
 * Variables:
 * - {{1}} period (e.g., "February 2026")
 * - {{2}} periodStart (e.g., "1 February 2026")
 * - {{3}} periodEnd (e.g., "28 February 2026")
 * - {{4}} parentName (e.g., "Sarah")
 * - {{5}} openingBalance (e.g., "0.00")
 * - {{6}} charges (e.g., "2,450.00")
 * - {{7}} payments (e.g., "2,450.00")
 * - {{8}} closingBalance (e.g., "0.00")
 * - {{9}} statementPdfUrl (e.g., "https://api.example.com/statements/sample/pdf")
 * - {{10}} statementId (e.g., "STM-2026-02-123")
 * - {{11}} tenantName (e.g., "Little Stars Creche")
 */
export const STATEMENT_NOTIFICATION: ContentTemplateDefinition = {
  friendlyName: 'cb_statement_notification',
  language: 'en',
  category: 'UTILITY',
  variables: {
    '1': 'February 2026',
    '2': '1 February 2026',
    '3': '28 February 2026',
    '4': 'Sarah',
    '5': '0.00',
    '6': '2,450.00',
    '7': '2,450.00',
    '8': '0.00',
    '9': 'https://api.example.com/statements/sample/pdf',
    '10': 'STM-2026-02-123',
    '11': 'Little Stars Creche',
  },
  types: {
    'twilio/card': {
      title: '{{1}} Statement Ready',
      subtitle: 'Monthly account statement',
      body: 'Hi {{4}},\n\nYour monthly statement from {{11}} is ready.\n\nPeriod: {{2}} to {{3}}\nOpening Balance: R{{5}}\nCharges: R{{6}}\nPayments: R{{7}}\nClosing Balance: R{{8}}\n\nDownload the attached PDF for full details.',
      media: ['{{9}}'],
      actions: [
        {
          type: 'URL',
          title: 'View Statement',
          url: 'https://app.elleelephant.co.za/statements/{{10}}',
        },
      ],
    },
  },
};

/**
 * Friendly reminder (1-7 days overdue)
 * Category: UTILITY
 *
 * Variables:
 * - {{1}} parentName (e.g., "Sarah")
 * - {{2}} amount (e.g., "2,450.00")
 * - {{3}} childName (e.g., "Emma")
 * - {{4}} dueDate (e.g., "21 February 2026")
 * - {{5}} invoiceNumber (e.g., "INV-2026-001234")
 * - {{6}} tenantName (e.g., "Little Stars Creche")
 */
export const REMINDER_FRIENDLY: ContentTemplateDefinition = {
  friendlyName: 'cb_reminder_friendly',
  language: 'en',
  category: 'UTILITY',
  variables: {
    '1': 'Sarah',
    '2': '2,450.00',
    '3': 'Emma',
    '4': '21 February 2026',
    '5': 'INV-2026-001234',
    '6': 'Little Stars Creche',
  },
  types: {
    'twilio/quick-reply': {
      body: "Hi {{1}}, just a quick reminder from {{6}} that your payment of R{{2}} for {{3}} was due on {{4}}. If you've already paid, please ignore this message.",
      actions: [
        { type: 'QUICK_REPLY', title: 'Pay Now', id: 'pay_{{5}}' },
        { type: 'QUICK_REPLY', title: 'Already Paid', id: 'paid_{{5}}' },
        { type: 'QUICK_REPLY', title: 'Need Help', id: 'help_{{5}}' },
      ],
    },
  },
};

/**
 * Firm reminder (8-14 days overdue)
 * Category: UTILITY
 *
 * Variables:
 * - {{1}} parentName (e.g., "Sarah")
 * - {{2}} daysOverdue (e.g., "10")
 * - {{3}} amount (e.g., "2,450.00")
 * - {{4}} invoiceNumber (e.g., "INV-2026-001234")
 * - {{5}} tenantName (e.g., "Little Stars Creche")
 */
export const REMINDER_FIRM: ContentTemplateDefinition = {
  friendlyName: 'cb_reminder_firm',
  language: 'en',
  category: 'UTILITY',
  variables: {
    '1': 'Sarah',
    '2': '10',
    '3': '2,450.00',
    '4': 'INV-2026-001234',
    '5': 'Little Stars Creche',
  },
  types: {
    'twilio/quick-reply': {
      body: 'Dear {{1}},\n\nYour account with {{5}} is now {{2}} days overdue. The outstanding amount of R{{3}} requires your immediate attention.\n\nTo avoid service disruption, please settle or contact us.',
      actions: [
        { type: 'QUICK_REPLY', title: 'Pay Now', id: 'pay_{{4}}' },
        { type: 'QUICK_REPLY', title: 'Payment Plan', id: 'plan_{{4}}' },
        { type: 'QUICK_REPLY', title: 'Call Me', id: 'callback_{{4}}' },
      ],
    },
  },
};

/**
 * Final notice (15+ days overdue)
 * Category: UTILITY
 *
 * Variables:
 * - {{1}} parentFullName (e.g., "Sarah Smith")
 * - {{2}} daysOverdue (e.g., "20")
 * - {{3}} amount (e.g., "2,450.00")
 * - {{4}} invoiceNumber (e.g., "INV-2026-001234")
 * - {{5}} tenantName (e.g., "Little Stars Creche")
 */
export const REMINDER_FINAL: ContentTemplateDefinition = {
  friendlyName: 'cb_reminder_final',
  language: 'en',
  category: 'UTILITY',
  variables: {
    '1': 'Sarah Smith',
    '2': '20',
    '3': '2,450.00',
    '4': 'INV-2026-001234',
    '5': 'Little Stars Creche',
  },
  types: {
    'twilio/call-to-action': {
      body: 'URGENT: Final Payment Notice\n\nDear {{1}},\n\nDespite previous reminders, your account with {{5}} remains {{2}} days overdue with R{{3}} outstanding.\n\nThis is your final notice before we escalate to our collections procedure.\n\nPlease contact us immediately.',
      actions: [
        {
          type: 'URL',
          title: 'Pay Immediately',
          url: 'https://app.elleelephant.co.za/pay/{{4}}',
        },
        {
          type: 'URL',
          title: 'Request Callback',
          url: 'https://app.elleelephant.co.za/callback/{{4}}',
        },
      ],
    },
  },
};

/**
 * All template definitions for batch registration
 */
export const ALL_TEMPLATES: ContentTemplateDefinition[] = [
  INVOICE_WITH_DOCUMENT,
  PAYMENT_REMINDER_INTERACTIVE,
  PAYMENT_CONFIRMATION,
  ARREARS_NOTICE,
  WELCOME_ENROLLMENT,
  STATEMENT_NOTIFICATION,
  REMINDER_FRIENDLY,
  REMINDER_FIRM,
  REMINDER_FINAL,
];

/**
 * Template names for reference
 */
export const TEMPLATE_NAMES = {
  INVOICE_WITH_DOCUMENT: 'cb_invoice_with_document_v2',
  PAYMENT_REMINDER_INTERACTIVE: 'cb_payment_reminder_interactive',
  PAYMENT_CONFIRMATION: 'cb_payment_confirmation_v2',
  ARREARS_NOTICE: 'cb_arrears_notice_v2',
  WELCOME_ENROLLMENT: 'cb_welcome_enrollment',
  STATEMENT_NOTIFICATION: 'cb_statement_notification',
  REMINDER_FRIENDLY: 'cb_reminder_friendly',
  REMINDER_FIRM: 'cb_reminder_firm',
  REMINDER_FINAL: 'cb_reminder_final',
} as const;

export type TemplateName = (typeof TEMPLATE_NAMES)[keyof typeof TEMPLATE_NAMES];
