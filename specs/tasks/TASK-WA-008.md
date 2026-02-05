<task_spec id="TASK-WA-008" version="2.0">

<metadata>
  <title>Rich WhatsApp Template Definitions</title>
  <status>complete</status>
  <phase>26</phase>
  <layer>logic</layer>
  <sequence>268</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-WA-RICH-001</requirement_ref>
    <requirement_ref>REQ-WA-TEMPLATES-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-WA-007</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-02-05</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  - Existing templates are text-only without interactive elements
  - No PDF attachments in invoice/statement notifications
  - No quick action buttons for payments
  - Templates not defined using Content API format

  **Existing Resources:**
  - TwilioContentService (TASK-WA-007) - Content API integration
  - WhatsAppTemplateService - Legacy text templates
  - Template definitions in template.types.ts

  **Gap:**
  - No rich template definitions for Content API
  - No card templates with media headers
  - No quick-reply templates with action buttons
  - No call-to-action templates with URL/phone buttons

  **Files to Create:**
  - `apps/api/src/integrations/whatsapp/templates/content-templates.ts`
  - `apps/api/src/scripts/register-whatsapp-templates.ts`

  **Files to Modify:**
  - `apps/api/src/integrations/whatsapp/services/twilio-whatsapp.service.ts` (add rich send methods)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`.

  ### 2. Tenant Branding Variables - CRITICAL
  All templates MUST include tenant name as a variable, NOT hardcoded:
  ```typescript
  // Template uses {{9}} for tenant/creche name
  body: 'Kind regards,\n{{9}}',  // Renders as "Kind regards,\nLittle Stars Creche"

  // When sending, pass tenant.tradingName
  variables: [
    { key: '9', value: tenant.tradingName },  // "Little Stars Creche"
  ]
  ```

  ### 3. Template Definitions
  ```typescript
  // apps/api/src/integrations/whatsapp/templates/content-templates.ts

  import { ContentTemplateDefinition } from '../types/content.types';

  /**
   * Invoice notification with PDF card and action buttons
   * Category: UTILITY
   * Variables: invoiceNumber, dueDate, parentName, period, amount, childName, pdfUrl, invoiceId, tenantName
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
      '7': 'https://api.example.com/invoices/sample/pdf',
      '8': 'INV-2026-001234',
      '9': 'Little Stars Creche',  // TENANT NAME
    },
    types: {
      'twilio/card': {
        title: 'Invoice Ready: {{1}}',
        subtitle: 'Due: {{2}}',
        body: 'Hi {{3}},\n\nYour invoice for {{4}} is ready.\n\nAmount Due: R{{5}}\nChild: {{6}}\n\nPayment due by {{2}}.\n\nKind regards,\n{{9}}',
        media: ['{{7}}'],
        actions: [
          { type: 'URL', title: 'View Invoice', url: 'https://app.crechebooks.co.za/invoices/{{8}}' },
          { type: 'URL', title: 'Pay Now', url: 'https://app.crechebooks.co.za/pay/{{8}}' },
        ],
      },
    },
  };

  /**
   * Payment reminder with quick reply buttons
   * Category: UTILITY
   * Variables: parentName, amount, childName, daysOverdue, invoiceNumber, dueDate, tenantName, tenantPhone
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
      '7': 'Little Stars Creche',  // TENANT NAME
    },
    types: {
      'twilio/quick-reply': {
        body: 'Hi {{1}},\n\nThis is a friendly reminder from {{7}} that your payment of R{{2}} for {{3}} is {{4}} days overdue.\n\nInvoice: {{5}}\nOriginal Due Date: {{6}}\n\nPlease select an option:',
        actions: [
          { type: 'QUICK_REPLY', title: 'Pay Now', id: 'pay_{{5}}' },
          { type: 'QUICK_REPLY', title: 'Request Extension', id: 'extension_{{5}}' },
          { type: 'QUICK_REPLY', title: 'Contact Us', id: 'contact_{{5}}' },
        ],
      },
    },
  };

  /**
   * Payment confirmation with receipt card
   * Category: UTILITY
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
      '8': 'https://api.example.com/receipts/sample/pdf',
      '9': 'Little Stars Creche',  // TENANT NAME
    },
    types: {
      'twilio/card': {
        title: 'Payment Received',
        subtitle: 'Receipt {{1}}',
        body: 'Thank you, {{2}}!\n\nWe\'ve received your payment of R{{3}}.\n\nReference: {{4}}\nDate: {{5}}\nApplied to: {{6}}\n\nRemaining Balance: R{{7}}\n\nKind regards,\n{{9}}',
        media: ['{{8}}'],
        actions: [
          { type: 'URL', title: 'View Receipt', url: 'https://app.crechebooks.co.za/receipts/{{1}}' },
        ],
      },
    },
  };

  /**
   * Arrears notice with call-to-action buttons
   * Category: UTILITY
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
      '6': 'Little Stars Creche',  // TENANT NAME
      '7': 'parent-123',
      '8': '+27600188230',  // TENANT PHONE
    },
    types: {
      'twilio/call-to-action': {
        body: 'Important Account Notice\n\nDear {{1}},\n\nYour account with {{6}} is {{2}} days in arrears with an outstanding balance of R{{3}}.\n\nOldest unpaid invoice: {{4}}\nNumber of unpaid invoices: {{5}}\n\nPlease contact us to discuss payment arrangements.\n\nKind regards,\n{{6}}',
        actions: [
          { type: 'URL', title: 'View Account', url: 'https://app.crechebooks.co.za/account/{{7}}' },
          { type: 'PHONE_NUMBER', title: 'Call Us', phone: '{{8}}' },
        ],
      },
    },
  };

  /**
   * Welcome message for new enrollments
   * Category: UTILITY
   */
  export const WELCOME_ENROLLMENT: ContentTemplateDefinition = {
    friendlyName: 'cb_welcome_enrollment',
    language: 'en',
    category: 'UTILITY',
    variables: {
      '1': 'Little Stars Creche',  // TENANT NAME
      '2': 'Sarah',
      '3': 'Emma Smith',
      '4': '1 March 2026',
      '5': '2,450.00',
      '6': 'Full Day',
      '7': 'https://cdn.example.com/welcome-banner.jpg',
      '8': 'onboard-token-123',
      '9': '+27600188230',  // TENANT PHONE
    },
    types: {
      'twilio/card': {
        title: 'Welcome to {{1}}!',
        subtitle: 'Enrollment Confirmed',
        body: 'Dear {{2}},\n\nWe\'re delighted that {{3}} is joining our family!\n\nEnrollment Details:\n- Start Date: {{4}}\n- Monthly Fee: R{{5}}\n- Fee Structure: {{6}}\n\nYour parent portal is ready. Set up your account to view and pay invoices.',
        media: ['{{7}}'],
        actions: [
          { type: 'URL', title: 'Set Up Portal', url: 'https://app.crechebooks.co.za/onboard/{{8}}' },
          { type: 'PHONE_NUMBER', title: 'Contact Us', phone: '{{9}}' },
        ],
      },
    },
  };

  /**
   * Monthly statement notification
   * Category: UTILITY
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
      '11': 'Little Stars Creche',  // TENANT NAME
    },
    types: {
      'twilio/card': {
        title: '{{1}} Statement Ready',
        subtitle: 'Period: {{2}} to {{3}}',
        body: 'Hi {{4}},\n\nYour monthly statement from {{11}} is ready.\n\nOpening Balance: R{{5}}\nCharges: R{{6}}\nPayments: R{{7}}\nClosing Balance: R{{8}}\n\nDownload the attached PDF for full details.',
        media: ['{{9}}'],
        actions: [
          { type: 'URL', title: 'View Statement', url: 'https://app.crechebooks.co.za/statements/{{10}}' },
        ],
      },
    },
  };

  /**
   * Friendly reminder (1-7 days overdue)
   * Category: UTILITY
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
      '6': 'Little Stars Creche',  // TENANT NAME
    },
    types: {
      'twilio/quick-reply': {
        body: 'Hi {{1}}, just a quick reminder from {{6}} that your payment of R{{2}} for {{3}} was due on {{4}}. If you\'ve already paid, please ignore this message.',
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
      '5': 'Little Stars Creche',  // TENANT NAME
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
      '5': '+27600188230',  // TENANT PHONE
      '6': 'Little Stars Creche',  // TENANT NAME
    },
    types: {
      'twilio/call-to-action': {
        body: 'URGENT: Final Payment Notice\n\nDear {{1}},\n\nDespite previous reminders, your account with {{6}} remains {{2}} days overdue with R{{3}} outstanding.\n\nThis is your final notice before we escalate to our collections procedure.\n\nPlease contact us immediately.',
        actions: [
          { type: 'URL', title: 'Pay Immediately', url: 'https://app.crechebooks.co.za/pay/{{4}}' },
          { type: 'PHONE_NUMBER', title: 'Call Now', phone: '{{5}}' },
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

  ### 4. Rich Send Methods
  Add to TwilioWhatsAppService:
  ```typescript
  /**
   * Send invoice with rich card and PDF attachment
   */
  async sendRichInvoiceNotification(
    tenantId: string,
    recipientPhone: string,
    data: {
      parentName: string;
      invoiceNumber: string;
      childName: string;
      amount: number;  // In cents
      dueDate: Date;
      pdfUrl: string;
    },
  ): Promise<string> {
    // Get tenant for branding
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    const template = this.contentService.getTemplate('cb_invoice_with_document');
    if (!template) {
      // Fallback to legacy text
      return this.sendInvoiceNotification(/* ... */);
    }

    const variables = [
      { key: '1', value: data.invoiceNumber },
      { key: '2', value: this.formatDate(data.dueDate) },
      { key: '3', value: data.parentName },
      { key: '4', value: this.getBillingPeriod(data.dueDate) },
      { key: '5', value: this.formatAmount(data.amount) },
      { key: '6', value: data.childName },
      { key: '7', value: data.pdfUrl },
      { key: '8', value: data.invoiceNumber },
      { key: '9', value: tenant.tradingName },  // TENANT BRANDING
    ];

    return this.contentService.sendContentMessage(
      recipientPhone,
      template.sid,
      variables,
    );
  }

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
  ```

  ### 5. Registration Script
  ```typescript
  // apps/api/src/scripts/register-whatsapp-templates.ts
  #!/usr/bin/env ts-node

  import Twilio from 'twilio';
  import * as dotenv from 'dotenv';
  import { ALL_TEMPLATES } from '../integrations/whatsapp/templates/content-templates';

  dotenv.config();

  const client = Twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN,
  );

  async function registerTemplates() {
    console.log('Registering WhatsApp templates...\n');

    for (const template of ALL_TEMPLATES) {
      try {
        const existing = await client.content.v1.contents.list({ limit: 100 });
        const found = existing.find(c => c.friendlyName === template.friendlyName);

        if (found) {
          console.log(`✓ ${template.friendlyName} exists (${found.sid})`);
          continue;
        }

        const content = await client.content.v1.contents.create({
          friendlyName: template.friendlyName,
          language: template.language,
          variables: template.variables,
          types: template.types,
        });

        console.log(`✓ Created ${template.friendlyName} (${content.sid})`);

        // Submit for approval
        await client.content.v1.contents(content.sid)
          .approvalRequests.whatsapp.create({
            name: template.friendlyName,
            category: template.category,
          });

        console.log(`  → Submitted for approval`);
      } catch (error) {
        console.error(`✗ Failed: ${template.friendlyName}`, error.message);
      }
    }

    console.log('\nDone!');
  }

  registerTemplates();
  ```
</critical_patterns>

<context>
This task defines the actual template content for rich WhatsApp messages.

**Templates Created (9 total):**
1. cb_invoice_with_document - Card with PDF and Pay Now button
2. cb_payment_reminder_interactive - Quick reply with 3 action buttons
3. cb_payment_confirmation - Card with receipt PDF
4. cb_arrears_notice - CTA with URL + Phone buttons
5. cb_welcome_enrollment - Card with portal setup
6. cb_statement_notification - Card with statement PDF
7. cb_reminder_friendly - Quick reply (1-7 days overdue)
8. cb_reminder_firm - Quick reply (8-14 days overdue)
9. cb_reminder_final - CTA with urgent tone

**Tenant Branding:**
Every template includes tenant name (tradingName) and contact details.
Messages appear to come from the individual creche, not CrecheBooks.

**Approval Process:**
Templates must be submitted to WhatsApp for approval (24-48 hours).
All templates use UTILITY category for lower cost and higher approval rate.
</context>

<scope>
  <in_scope>
    - 9 template definitions using Content API format
    - Template registration script
    - Rich send methods in TwilioWhatsAppService
    - Proper tenant branding in all templates
    - Amount/date formatting helpers
  </in_scope>
  <out_of_scope>
    - TwilioContentService implementation (TASK-WA-007)
    - Button response handlers (TASK-WA-009)
    - Session-only features (TASK-WA-010)
    - Template approval waiting
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Create template definitions
# Create apps/api/src/integrations/whatsapp/templates/content-templates.ts

# 2. Create registration script
# Create apps/api/src/scripts/register-whatsapp-templates.ts

# 3. Update TwilioWhatsAppService with rich methods
# Edit apps/api/src/integrations/whatsapp/services/twilio-whatsapp.service.ts

# 4. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings

# 5. Register templates (after build)
cd apps/api
npx ts-node src/scripts/register-whatsapp-templates.ts
```
</verification_commands>

<definition_of_done>
  - [ ] 9 template definitions created with tenant branding
  - [ ] All templates use {{variable}} for tenant.tradingName
  - [ ] Registration script created and tested
  - [ ] Rich send methods added to TwilioWhatsAppService
  - [ ] Amount formatting: R2,450.00 (comma thousands, 2 decimals)
  - [ ] Date formatting: 28 February 2026
  - [ ] All templates registered in Twilio
  - [ ] Templates submitted for WhatsApp approval
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Hardcode "CrecheBooks" in any template body
  - Use tenant name without variable placeholder
  - Exceed character limits (body: 1024, button: 20)
  - Start/end template body with {{variable}}
  - Use adjacent variables {{1}}{{2}}
  - Skip tenant branding in any template
</anti_patterns>

</task_spec>
