# WhatsApp Template Implementation Plan

> **Status**: Ready for Implementation
> **Estimated Effort**: 3-4 days
> **Dependencies**: Twilio Account configured, templates approved

---

## Implementation Overview

This plan details the code changes required to implement rich WhatsApp templates in CrecheBooks using the Twilio Content API.

---

## Phase 1: Twilio Content API Integration

### 1.1 Install Twilio SDK (if not present)

```bash
cd apps/api
pnpm add twilio
```

### 1.2 Create Content Template Service

**File**: `apps/api/src/integrations/whatsapp/services/twilio-content.service.ts`

```typescript
/**
 * Twilio Content API Service
 * TASK-WA-008: Rich WhatsApp template management via Content API
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Twilio from 'twilio';

export interface ContentTemplate {
  sid: string;
  friendlyName: string;
  language: string;
  variables: Record<string, string>;
  types: Record<string, unknown>;
  approvalStatus?: string;
}

export interface TemplateVariable {
  key: string;
  value: string;
}

@Injectable()
export class TwilioContentService implements OnModuleInit {
  private readonly logger = new Logger(TwilioContentService.name);
  private client: Twilio.Twilio;
  private templateCache: Map<string, ContentTemplate> = new Map();

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

    if (accountSid && authToken) {
      this.client = Twilio(accountSid, authToken);
      await this.loadTemplates();
      this.logger.log('Twilio Content Service initialized');
    } else {
      this.logger.warn('Twilio credentials not configured');
    }
  }

  /**
   * Load all content templates from Twilio
   */
  async loadTemplates(): Promise<void> {
    try {
      const contents = await this.client.content.v1.contents.list({ limit: 100 });

      for (const content of contents) {
        this.templateCache.set(content.friendlyName, {
          sid: content.sid,
          friendlyName: content.friendlyName,
          language: content.language,
          variables: content.variables as Record<string, string>,
          types: content.types as Record<string, unknown>,
        });
      }

      this.logger.log(`Loaded ${this.templateCache.size} content templates`);
    } catch (error) {
      this.logger.error('Failed to load content templates', error);
    }
  }

  /**
   * Get template by friendly name
   */
  getTemplate(friendlyName: string): ContentTemplate | undefined {
    return this.templateCache.get(friendlyName);
  }

  /**
   * Create a new content template
   */
  async createTemplate(
    friendlyName: string,
    language: string,
    variables: Record<string, string>,
    types: Record<string, unknown>,
  ): Promise<ContentTemplate> {
    const content = await this.client.content.v1.contents.create({
      friendlyName,
      language,
      variables,
      types,
    });

    const template: ContentTemplate = {
      sid: content.sid,
      friendlyName: content.friendlyName,
      language: content.language,
      variables: content.variables as Record<string, string>,
      types: content.types as Record<string, unknown>,
    };

    this.templateCache.set(friendlyName, template);
    return template;
  }

  /**
   * Submit template for WhatsApp approval
   */
  async submitForApproval(contentSid: string): Promise<void> {
    await this.client.content.v1
      .contents(contentSid)
      .approvalRequests.whatsapp.create({
        name: 'UTILITY',  // Category
        category: 'UTILITY',
      });

    this.logger.log(`Template ${contentSid} submitted for WhatsApp approval`);
  }

  /**
   * Check approval status
   */
  async getApprovalStatus(contentSid: string): Promise<string> {
    const approval = await this.client.content.v1
      .contents(contentSid)
      .approvalRequests.whatsapp.fetch();

    return approval.status;
  }

  /**
   * Send message using content template
   */
  async sendContentMessage(
    to: string,
    contentSid: string,
    variables: TemplateVariable[],
  ): Promise<string> {
    const fromNumber = this.configService.get<string>('TWILIO_WHATSAPP_NUMBER');
    const statusCallback = this.configService.get<string>('TWILIO_STATUS_CALLBACK_URL');

    // Convert variables array to ContentVariables format
    const contentVariables: Record<string, string> = {};
    variables.forEach((v, index) => {
      contentVariables[(index + 1).toString()] = v.value;
    });

    const message = await this.client.messages.create({
      to: `whatsapp:${to}`,
      from: `whatsapp:${fromNumber}`,
      contentSid,
      contentVariables: JSON.stringify(contentVariables),
      statusCallback,
    });

    this.logger.debug(`Sent content message ${message.sid} to ${to}`);
    return message.sid;
  }

  /**
   * Send session message (during 24h window) with rich content
   */
  async sendSessionMessage(
    to: string,
    body: string,
    mediaUrl?: string,
    actions?: Array<{ type: string; title: string; id?: string; url?: string; phone?: string }>,
  ): Promise<string> {
    const fromNumber = this.configService.get<string>('TWILIO_WHATSAPP_NUMBER');
    const statusCallback = this.configService.get<string>('TWILIO_STATUS_CALLBACK_URL');

    const messageParams: Twilio.MessageListInstanceCreateOptions = {
      to: `whatsapp:${to}`,
      from: `whatsapp:${fromNumber}`,
      body,
      statusCallback,
    };

    if (mediaUrl) {
      messageParams.mediaUrl = [mediaUrl];
    }

    // Note: Interactive elements in session messages require Content API
    // For list pickers and quick replies in session, use persistentAction
    if (actions && actions.length > 0) {
      // Session interactive messages need to be sent via content API
      // even without pre-approval (max 3 quick reply buttons)
      return this.sendSessionInteractiveMessage(to, body, actions);
    }

    const message = await this.client.messages.create(messageParams);
    return message.sid;
  }

  /**
   * Send session interactive message (quick reply or list picker)
   */
  private async sendSessionInteractiveMessage(
    to: string,
    body: string,
    actions: Array<{ type: string; title: string; id?: string; url?: string; phone?: string }>,
  ): Promise<string> {
    const fromNumber = this.configService.get<string>('TWILIO_WHATSAPP_NUMBER');
    const statusCallback = this.configService.get<string>('TWILIO_STATUS_CALLBACK_URL');

    // Build inline content for session message
    const quickReplyActions = actions
      .filter(a => a.type === 'QUICK_REPLY')
      .slice(0, 3) // Max 3 in session without approval
      .map(a => ({
        type: 'QUICK_REPLY',
        title: a.title.substring(0, 20), // Max 20 chars
        id: a.id || a.title.toLowerCase().replace(/\s+/g, '_'),
      }));

    // Create temporary content for this session message
    const tempContent = await this.client.content.v1.contents.create({
      friendlyName: `session_${Date.now()}`,
      language: 'en',
      variables: {},
      types: {
        'twilio/quick-reply': {
          body,
          actions: quickReplyActions,
        },
      },
    });

    // Send using the temporary content
    const message = await this.client.messages.create({
      to: `whatsapp:${to}`,
      from: `whatsapp:${fromNumber}`,
      contentSid: tempContent.sid,
      statusCallback,
    });

    return message.sid;
  }

  /**
   * Send list picker (session only)
   */
  async sendListPicker(
    to: string,
    body: string,
    buttonText: string,
    items: Array<{ item: string; id: string; description?: string }>,
  ): Promise<string> {
    const fromNumber = this.configService.get<string>('TWILIO_WHATSAPP_NUMBER');
    const statusCallback = this.configService.get<string>('TWILIO_STATUS_CALLBACK_URL');

    // List picker content
    const listContent = await this.client.content.v1.contents.create({
      friendlyName: `list_picker_${Date.now()}`,
      language: 'en',
      variables: {},
      types: {
        'twilio/list-picker': {
          body,
          button: buttonText.substring(0, 20),
          items: items.slice(0, 10).map(i => ({
            item: i.item.substring(0, 24),
            id: i.id.substring(0, 200),
            description: i.description?.substring(0, 72),
          })),
        },
      },
    });

    const message = await this.client.messages.create({
      to: `whatsapp:${to}`,
      from: `whatsapp:${fromNumber}`,
      contentSid: listContent.sid,
      statusCallback,
    });

    return message.sid;
  }

  /**
   * List all templates with their approval status
   */
  async listTemplatesWithStatus(): Promise<Array<ContentTemplate & { approvalStatus: string }>> {
    const templates: Array<ContentTemplate & { approvalStatus: string }> = [];

    for (const [, template] of this.templateCache) {
      let approvalStatus = 'unknown';
      try {
        approvalStatus = await this.getApprovalStatus(template.sid);
      } catch {
        approvalStatus = 'not_submitted';
      }

      templates.push({ ...template, approvalStatus });
    }

    return templates;
  }
}
```

### 1.3 Create Template Definitions

**File**: `apps/api/src/integrations/whatsapp/templates/content-templates.ts`

```typescript
/**
 * CrecheBooks WhatsApp Content Template Definitions
 * TASK-WA-008: Rich template definitions for Twilio Content API
 */

export interface ContentTemplateDefinition {
  friendlyName: string;
  language: string;
  category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
  variables: Record<string, string>;
  types: Record<string, unknown>;
}

/**
 * Invoice notification with PDF attachment and action buttons
 */
export const INVOICE_WITH_DOCUMENT: ContentTemplateDefinition = {
  friendlyName: 'cb_invoice_with_document',
  language: 'en',
  category: 'UTILITY',
  variables: {
    '1': 'INV-2026-001234',
    '2': '28 February 2026',
    '3': 'Sarah',
    '4': 'February 2026',
    '5': '2,450.00',
    '6': 'Emma Smith',
    '7': 'https://api.crechebooks.co.za/invoices/sample/pdf',
    '8': 'INV-2026-001234',
  },
  types: {
    'twilio/card': {
      title: 'Invoice Ready: {{1}}',
      subtitle: 'Due: {{2}}',
      body: 'Hi {{3}},\n\nYour invoice for {{4}} is ready.\n\nAmount Due: R{{5}}\nChild: {{6}}\n\nPayment due by {{2}}.',
      media: ['{{7}}'],
      actions: [
        {
          type: 'URL',
          title: 'View Invoice',
          url: 'https://app.crechebooks.co.za/invoices/{{8}}',
        },
        {
          type: 'URL',
          title: 'Pay Now',
          url: 'https://app.crechebooks.co.za/pay/{{8}}',
        },
      ],
    },
  },
};

/**
 * Payment reminder with quick reply actions
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
  },
  types: {
    'twilio/quick-reply': {
      body: 'Hi {{1}},\n\nThis is a friendly reminder that your payment of R{{2}} for {{3}} is {{4}} days overdue.\n\nInvoice: {{5}}\nOriginal Due Date: {{6}}\n\nPlease select an option below:',
      actions: [
        { type: 'QUICK_REPLY', title: 'Pay Now', id: 'pay_{{5}}' },
        { type: 'QUICK_REPLY', title: 'Request Extension', id: 'extension_{{5}}' },
        { type: 'QUICK_REPLY', title: 'Contact Us', id: 'contact_{{5}}' },
      ],
    },
  },
};

/**
 * Payment confirmation with receipt
 */
export const PAYMENT_CONFIRMATION: ContentTemplateDefinition = {
  friendlyName: 'cb_payment_confirmation',
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
    '8': 'https://api.crechebooks.co.za/receipts/sample/pdf',
  },
  types: {
    'twilio/card': {
      title: 'Payment Received',
      subtitle: 'Receipt {{1}}',
      body: 'Thank you, {{2}}!\n\nWe\'ve received your payment of R{{3}}.\n\nReference: {{4}}\nDate: {{5}}\nApplied to: {{6}}\n\nRemaining Balance: R{{7}}',
      media: ['{{8}}'],
      actions: [
        {
          type: 'URL',
          title: 'View Receipt',
          url: 'https://app.crechebooks.co.za/receipts/{{1}}',
        },
      ],
    },
  },
};

/**
 * Arrears notice with contact options
 */
export const ARREARS_NOTICE: ContentTemplateDefinition = {
  friendlyName: 'cb_arrears_notice',
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
    '8': '+27600188230',
  },
  types: {
    'twilio/call-to-action': {
      body: 'Important Account Notice\n\nDear {{1}},\n\nYour account is {{2}} days in arrears with an outstanding balance of R{{3}}.\n\nOldest unpaid invoice: {{4}}\nNumber of unpaid invoices: {{5}}\n\nPlease contact us to discuss payment arrangements.\n\nKind regards,\n{{6}}',
      actions: [
        {
          type: 'URL',
          title: 'View Account',
          url: 'https://app.crechebooks.co.za/account/{{7}}',
        },
        {
          type: 'PHONE_NUMBER',
          title: 'Call Us',
          phone: '{{8}}',
        },
      ],
    },
  },
};

/**
 * Welcome message with portal access
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
    '7': 'https://cdn.crechebooks.co.za/welcome-banner.jpg',
    '8': 'onboard-token-123',
    '9': '+27600188230',
  },
  types: {
    'twilio/card': {
      title: 'Welcome to {{1}}!',
      subtitle: 'Enrollment Confirmed',
      body: 'Dear {{2}},\n\nWe\'re delighted that {{3}} is joining our family!\n\nEnrollment Details:\n- Start Date: {{4}}\n- Monthly Fee: R{{5}}\n- Fee Structure: {{6}}\n\nYour parent portal is ready. Set up your account to:\n- View and pay invoices\n- Track payments\n- Update contact preferences',
      media: ['{{7}}'],
      actions: [
        {
          type: 'URL',
          title: 'Set Up Portal',
          url: 'https://app.crechebooks.co.za/onboard/{{8}}',
        },
        {
          type: 'PHONE_NUMBER',
          title: 'Contact Us',
          phone: '{{9}}',
        },
      ],
    },
  },
};

/**
 * Statement notification with PDF
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
    '9': 'https://api.crechebooks.co.za/statements/sample/pdf',
    '10': 'STM-2026-02-123',
  },
  types: {
    'twilio/card': {
      title: '{{1}} Statement Ready',
      subtitle: 'Period: {{2}} to {{3}}',
      body: 'Hi {{4}},\n\nYour monthly statement is ready.\n\nOpening Balance: R{{5}}\nCharges: R{{6}}\nPayments: R{{7}}\nClosing Balance: R{{8}}\n\nDownload the attached PDF for full details.',
      media: ['{{9}}'],
      actions: [
        {
          type: 'URL',
          title: 'View Statement',
          url: 'https://app.crechebooks.co.za/statements/{{10}}',
        },
      ],
    },
  },
};

/**
 * Friendly reminder (1-7 days overdue)
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
  },
  types: {
    'twilio/quick-reply': {
      body: 'Hi {{1}}, just a quick reminder that your payment of R{{2}} for {{3}} was due on {{4}}. If you\'ve already paid, please ignore this message. Otherwise, please settle at your earliest convenience.',
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
  },
  types: {
    'twilio/quick-reply': {
      body: 'Dear {{1}},\n\nYour account is now {{2}} days overdue. The outstanding amount of R{{3}} requires your immediate attention.\n\nTo avoid service disruption, please settle this amount or contact us to discuss a payment plan.',
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
    '5': '+27600188230',
  },
  types: {
    'twilio/call-to-action': {
      body: 'URGENT: Final Payment Notice\n\nDear {{1}},\n\nDespite previous reminders, your account remains {{2}} days overdue with R{{3}} outstanding.\n\nThis is your final notice before we escalate to our collections procedure.\n\nPlease contact us immediately to resolve this matter.',
      actions: [
        {
          type: 'URL',
          title: 'Pay Immediately',
          url: 'https://app.crechebooks.co.za/pay/{{4}}',
        },
        {
          type: 'PHONE_NUMBER',
          title: 'Call Now',
          phone: '{{5}}',
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
```

---

## Phase 2: Update TwilioWhatsAppService

### 2.1 Add Content Template Methods

**File**: `apps/api/src/integrations/whatsapp/services/twilio-whatsapp.service.ts`

Add the following methods to the existing service:

```typescript
// Add to imports
import { TwilioContentService } from './twilio-content.service';
import * as ContentTemplates from '../templates/content-templates';

// Add to constructor
constructor(
  // ... existing dependencies
  private readonly contentService: TwilioContentService,
) {}

/**
 * Send invoice notification with rich card and PDF
 * TASK-WA-008: Enhanced with Content API
 */
async sendRichInvoiceNotification(
  tenantId: string,
  recipientPhone: string,
  parentName: string,
  invoiceNumber: string,
  childName: string,
  amount: number,
  dueDate: Date,
  organizationName: string,
  pdfUrl: string,
  paymentUrl: string,
): Promise<string> {
  const template = this.contentService.getTemplate('cb_invoice_with_document');

  if (!template) {
    // Fallback to legacy text message if template not available
    this.logger.warn('Rich invoice template not found, falling back to text');
    return this.sendInvoiceNotification(
      tenantId,
      recipientPhone,
      parentName,
      invoiceNumber,
      amount,
      dueDate,
      organizationName,
      pdfUrl,
    );
  }

  const formattedAmount = this.formatAmount(amount);
  const formattedDate = this.formatDate(dueDate);
  const billingPeriod = this.getBillingPeriod(dueDate);

  const variables = [
    { key: '1', value: invoiceNumber },
    { key: '2', value: formattedDate },
    { key: '3', value: parentName },
    { key: '4', value: billingPeriod },
    { key: '5', value: formattedAmount },
    { key: '6', value: childName },
    { key: '7', value: pdfUrl },
    { key: '8', value: invoiceNumber },
  ];

  const messageSid = await this.contentService.sendContentMessage(
    recipientPhone,
    template.sid,
    variables,
  );

  await this.trackMessage(tenantId, recipientPhone, 'cb_invoice_with_document', {
    invoiceNumber,
    amount,
    childName,
  });

  return messageSid;
}

/**
 * Send payment reminder with quick reply buttons
 */
async sendRichPaymentReminder(
  tenantId: string,
  recipientPhone: string,
  parentName: string,
  invoiceNumber: string,
  childName: string,
  amount: number,
  dueDate: Date,
  daysOverdue: number,
): Promise<string> {
  // Select template based on urgency
  let templateName: string;
  if (daysOverdue <= 7) {
    templateName = 'cb_reminder_friendly';
  } else if (daysOverdue <= 14) {
    templateName = 'cb_reminder_firm';
  } else {
    templateName = 'cb_reminder_final';
  }

  const template = this.contentService.getTemplate(templateName);

  if (!template) {
    return this.sendPaymentReminder(
      tenantId,
      recipientPhone,
      parentName,
      amount,
      dueDate,
      daysOverdue,
    );
  }

  const formattedAmount = this.formatAmount(amount);
  const formattedDate = this.formatDate(dueDate);

  const variables = [
    { key: '1', value: parentName },
    { key: '2', value: formattedAmount },
    { key: '3', value: childName },
    { key: '4', value: daysOverdue.toString() },
    { key: '5', value: invoiceNumber },
    { key: '6', value: formattedDate },
  ];

  const messageSid = await this.contentService.sendContentMessage(
    recipientPhone,
    template.sid,
    variables,
  );

  await this.trackMessage(tenantId, recipientPhone, templateName, {
    invoiceNumber,
    amount,
    daysOverdue,
  });

  return messageSid;
}

/**
 * Send payment confirmation with receipt card
 */
async sendRichPaymentConfirmation(
  tenantId: string,
  recipientPhone: string,
  parentName: string,
  receiptNumber: string,
  amount: number,
  paymentDate: Date,
  reference: string,
  invoiceNumber: string,
  remainingBalance: number,
  receiptPdfUrl: string,
): Promise<string> {
  const template = this.contentService.getTemplate('cb_payment_confirmation');

  if (!template) {
    return this.sendPaymentConfirmation(
      tenantId,
      recipientPhone,
      parentName,
      amount,
      reference,
    );
  }

  const variables = [
    { key: '1', value: receiptNumber },
    { key: '2', value: parentName },
    { key: '3', value: this.formatAmount(amount) },
    { key: '4', value: reference },
    { key: '5', value: this.formatDate(paymentDate) },
    { key: '6', value: invoiceNumber },
    { key: '7', value: this.formatAmount(remainingBalance) },
    { key: '8', value: receiptPdfUrl },
  ];

  return this.contentService.sendContentMessage(
    recipientPhone,
    template.sid,
    variables,
  );
}

/**
 * Handle quick reply button response from webhook
 */
async handleQuickReplyResponse(
  from: string,
  buttonPayload: string,
): Promise<void> {
  const [action, ...rest] = buttonPayload.split('_');
  const invoiceId = rest.join('_');

  this.logger.log(`Quick reply: ${action} for ${invoiceId} from ${from}`);

  switch (action) {
    case 'pay':
      // Send payment link via session message
      const paymentUrl = `https://app.crechebooks.co.za/pay/${invoiceId}`;
      await this.contentService.sendSessionMessage(
        from,
        `Here's your secure payment link:\n\n${paymentUrl}`,
      );
      break;

    case 'extension':
      // Log extension request
      this.logger.log(`Extension requested for ${invoiceId}`);
      await this.contentService.sendSessionMessage(
        from,
        'Your payment extension request has been submitted. Our team will contact you within 24 hours to discuss arrangements.',
      );
      // TODO: Create extension request in database, notify admin
      break;

    case 'contact':
    case 'help':
      await this.contentService.sendSessionMessage(
        from,
        "I'm here to help! Please type your question and I'll assist you. Alternatively, you can call us during office hours.",
      );
      break;

    case 'paid':
      await this.contentService.sendSessionMessage(
        from,
        'Thank you for letting us know! If your payment was made recently, it may take 1-2 business days to reflect on your account. If you have a proof of payment, please share it here and we\'ll update your account.',
      );
      break;

    case 'plan':
      await this.contentService.sendSessionMessage(
        from,
        'We\'d be happy to discuss a payment plan with you. Our admin team will contact you within 24 hours to arrange a suitable plan.',
      );
      break;

    case 'callback':
      await this.contentService.sendSessionMessage(
        from,
        'We\'ll call you back during office hours (08:00-17:00, Monday-Friday). If you need immediate assistance, please call us directly.',
      );
      break;

    default:
      this.logger.warn(`Unknown quick reply action: ${action}`);
  }
}

// Helper methods
private formatAmount(cents: number): string {
  return (cents / 100).toLocaleString('en-ZA', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

private formatDate(date: Date): string {
  return date.toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

private getBillingPeriod(dueDate: Date): string {
  return dueDate.toLocaleDateString('en-ZA', {
    month: 'long',
    year: 'numeric',
  });
}
```

---

## Phase 3: Template Registration CLI

### 3.1 Create Registration Script

**File**: `apps/api/src/scripts/register-whatsapp-templates.ts`

```typescript
#!/usr/bin/env ts-node
/**
 * Register WhatsApp templates with Twilio Content API
 * Run: npx ts-node src/scripts/register-whatsapp-templates.ts
 */

import Twilio from 'twilio';
import * as dotenv from 'dotenv';
import { ALL_TEMPLATES } from '../integrations/whatsapp/templates/content-templates';

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  console.error('Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN');
  process.exit(1);
}

const client = Twilio(accountSid, authToken);

async function registerTemplates() {
  console.log('Registering WhatsApp templates...\n');

  for (const template of ALL_TEMPLATES) {
    try {
      // Check if template already exists
      const existing = await client.content.v1.contents.list({ limit: 100 });
      const found = existing.find(c => c.friendlyName === template.friendlyName);

      if (found) {
        console.log(`✓ ${template.friendlyName} already exists (${found.sid})`);
        continue;
      }

      // Create new template
      const content = await client.content.v1.contents.create({
        friendlyName: template.friendlyName,
        language: template.language,
        variables: template.variables,
        types: template.types,
      });

      console.log(`✓ Created ${template.friendlyName} (${content.sid})`);

      // Submit for WhatsApp approval
      await client.content.v1
        .contents(content.sid)
        .approvalRequests.whatsapp.create({
          name: template.friendlyName,
          category: template.category,
        });

      console.log(`  → Submitted for approval`);
    } catch (error) {
      console.error(`✗ Failed to register ${template.friendlyName}:`, error);
    }
  }

  console.log('\nDone! Check Twilio Console for approval status.');
}

registerTemplates().catch(console.error);
```

---

## Phase 4: Webhook Enhancement

### 4.1 Update Webhook Controller

**File**: `apps/api/src/integrations/whatsapp/whatsapp-webhook.controller.ts`

Add handling for interactive message responses:

```typescript
/**
 * Handle incoming WhatsApp webhook events
 */
@Post('twilio/webhook')
async handleTwilioWebhook(
  @Body() body: TwilioWebhookBody,
  @Headers('X-Twilio-Signature') signature: string,
  @Req() req: Request,
): Promise<{ status: string }> {
  // Verify signature
  if (!this.twilioService.verifyWebhookSignature(req, signature)) {
    throw new UnauthorizedException('Invalid webhook signature');
  }

  // Handle different message types
  if (body.ButtonPayload) {
    // Quick reply button was tapped
    await this.twilioService.handleQuickReplyResponse(
      body.From.replace('whatsapp:', ''),
      body.ButtonPayload,
    );
  } else if (body.ListId) {
    // List picker item was selected
    await this.handleListPickerResponse(body);
  } else if (body.Body) {
    // Regular text message
    await this.handleIncomingMessage(body);
  }

  // Handle status callbacks
  if (body.MessageStatus) {
    await this.handleStatusCallback(body);
  }

  return { status: 'ok' };
}

private async handleListPickerResponse(body: TwilioWebhookBody): Promise<void> {
  const from = body.From.replace('whatsapp:', '');
  const listId = body.ListId;
  const listTitle = body.ListTitle;

  this.logger.log(`List selection: ${listId} (${listTitle}) from ${from}`);

  // Handle different list selections
  if (listId.startsWith('statement_')) {
    const period = listId.replace('statement_', '');
    // Generate and send statement
    // TODO: Implement statement generation based on period
    await this.twilioService.contentService.sendSessionMessage(
      from,
      `Generating your ${listTitle} statement. This may take a moment...`,
    );
  } else if (listId.startsWith('inv_')) {
    const invoiceId = listId.replace('inv_', '');
    // Send invoice details
    // TODO: Fetch and send invoice PDF
  }
}
```

---

## Phase 5: Database Schema

### 5.1 Add Content SID Tracking

**File**: `apps/api/prisma/schema.prisma`

```prisma
/// WhatsApp content template registry
model WhatsAppContentTemplate {
  id              String    @id @default(uuid())
  tenantId        String?   @map("tenant_id")
  friendlyName    String    @unique @map("friendly_name")
  contentSid      String    @map("content_sid")
  language        String    @default("en")
  category        String    @default("UTILITY")
  approvalStatus  String?   @map("approval_status")
  variables       Json?
  createdAt       DateTime  @default(now()) @map("created_at")
  updatedAt       DateTime  @updatedAt @map("updated_at")
  approvedAt      DateTime? @map("approved_at")

  tenant Tenant? @relation(fields: [tenantId], references: [id])

  @@map("whatsapp_content_templates")
}
```

Run migration:
```bash
pnpm prisma migrate dev --name add_whatsapp_content_templates
```

---

## Phase 6: Update WhatsApp Module

### 6.1 Register New Services

**File**: `apps/api/src/integrations/whatsapp/whatsapp.module.ts`

```typescript
import { TwilioContentService } from './services/twilio-content.service';

@Module({
  imports: [/* ... */],
  providers: [
    // ... existing providers
    TwilioContentService,
  ],
  exports: [
    // ... existing exports
    TwilioContentService,
  ],
})
export class WhatsAppModule {}
```

---

## Testing Checklist

### Pre-Approval Testing (Sandbox)

- [ ] Templates register successfully in Twilio
- [ ] Content SIDs are stored in database
- [ ] Approval submission completes without errors
- [ ] Status callback URLs are correct

### Post-Approval Testing

- [ ] Invoice notification sends with PDF card
- [ ] Quick reply buttons display correctly
- [ ] Button taps trigger correct responses
- [ ] Payment confirmation shows receipt
- [ ] Reminder escalation selects correct template
- [ ] List picker works in session
- [ ] Webhook handles all response types

### Production Checklist

- [ ] All templates approved by WhatsApp
- [ ] Production credentials configured
- [ ] Status callback URL is HTTPS
- [ ] Error handling is robust
- [ ] Audit logging is complete
- [ ] Opt-in verification works

---

## Rollback Plan

If issues arise:

1. **Immediate**: Fall back to legacy text templates
2. **Check**: Template approval status in Twilio Console
3. **Verify**: Content SIDs are correct
4. **Test**: Send test message via Twilio Console
5. **Review**: Webhook logs for errors

---

## Estimated Timeline

| Phase | Task | Duration |
|-------|------|----------|
| 1 | Content API Integration | 4 hours |
| 2 | Update TwilioWhatsAppService | 4 hours |
| 3 | Template Registration CLI | 2 hours |
| 4 | Webhook Enhancement | 3 hours |
| 5 | Database Schema | 1 hour |
| 6 | Testing | 4 hours |
| | **Total** | **~18 hours** |

Plus waiting for WhatsApp approval: 24-48 hours per template batch.

---

*Implementation plan created: 2026-02-04*
