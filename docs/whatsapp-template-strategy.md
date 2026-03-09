# CrecheBooks WhatsApp Template Strategy

> **Document Version**: 1.1
> **Created**: 2026-02-04
> **Updated**: 2026-02-05
> **Status**: Planning Phase
> **Provider**: Twilio WhatsApp Business API

---

## Executive Summary

This document defines a comprehensive WhatsApp template strategy for CrecheBooks that utilizes the full range of Twilio Content API features to deliver a rich, interactive experience for parent communications. The strategy prioritizes UTILITY category templates for billing operations while designing for maximum engagement through interactive elements.

**CRITICAL**: All WhatsApp communications are sent on behalf of individual **tenants (creches)**, not "CrecheBooks". Parents receive messages branded with their creche's name (e.g., "Little Stars Creche"). This is achieved by using `tenant.tradingName` as a template variable.

---

## Table of Contents

1. [Template Architecture Overview](#1-template-architecture-overview)
2. [Core Templates (Priority 1)](#2-core-templates-priority-1)
3. [Enhanced Templates (Priority 2)](#3-enhanced-templates-priority-2)
4. [Session-Based Interactive Features](#4-session-based-interactive-features)
5. [Content Type Usage Matrix](#5-content-type-usage-matrix)
6. [Variable Standards](#6-variable-standards)
7. [Implementation Roadmap](#7-implementation-roadmap)
8. [Template Specifications](#8-template-specifications)
9. [Compliance Requirements](#9-compliance-requirements)

---

## 1. Template Architecture Overview

### Content Type Selection Strategy

| Content Type | Use Case | Approval Required | Priority |
|--------------|----------|-------------------|----------|
| `twilio/text` | Simple notifications | Yes (out of session) | High |
| `twilio/media` | PDF invoices, receipts | Yes (out of session) | High |
| `twilio/quick-reply` | Action prompts (3-10 buttons) | Yes (>3 buttons) | High |
| `twilio/call-to-action` | View Invoice, Pay Now, Call Us | Yes | High |
| `twilio/card` | Rich invoice summaries | Yes | Medium |
| `twilio/list-picker` | Statement period selection | No (session-only) | Medium |
| `twilio/carousel` | Multiple invoice display | Yes | Low |
| `twilio/location` | Creche directions | Yes | Low |

### Template Categories

All CrecheBooks templates will be **UTILITY** category unless explicitly noted:
- Lower cost per message
- Higher approval rate
- Must relate to specific transactions/accounts

---

## 2. Core Templates (Priority 1)

### 2.1 Invoice Notification with PDF

**Template Name**: `cb_invoice_with_document`
**Content Type**: `twilio/card` with document header
**Category**: UTILITY

```json
{
  "friendly_name": "CrecheBooks Invoice Notification",
  "language": "en",
  "types": {
    "twilio/card": {
      "title": "Invoice Ready: {{1}}",
      "subtitle": "Due: {{2}}",
      "body": "Hi {{3}},\n\nYour invoice for {{4}} is ready.\n\nAmount Due: R{{5}}\nChild: {{6}}\n\nPayment due by {{2}}.",
      "media": ["{{7}}"],
      "actions": [
        {
          "type": "URL",
          "title": "View Invoice",
          "url": "https://app.crechebooks.co.za/invoices/{{8}}"
        },
        {
          "type": "URL",
          "title": "Pay Now",
          "url": "https://app.crechebooks.co.za/pay/{{8}}"
        }
      ]
    }
  },
  "variables": {
    "1": "INV-2026-001234",
    "2": "28 February 2026",
    "3": "Sarah",
    "4": "February 2026",
    "5": "2,450.00",
    "6": "Emma Smith",
    "7": "https://api.crechebooks.co.za/invoices/INV-2026-001234/pdf",
    "8": "INV-2026-001234"
  }
}
```

**Rich Features**:
- PDF document as media header (downloadable)
- Card format with clear visual hierarchy
- Two CTA buttons: View + Pay
- Invoice number in title for quick reference

---

### 2.2 Payment Reminder with Quick Actions

**Template Name**: `cb_payment_reminder_interactive`
**Content Type**: `twilio/quick-reply`
**Category**: UTILITY

```json
{
  "friendly_name": "CrecheBooks Payment Reminder",
  "language": "en",
  "types": {
    "twilio/quick-reply": {
      "body": "Hi {{1}},\n\nThis is a friendly reminder that your payment of R{{2}} for {{3}} is {{4}} days overdue.\n\nInvoice: {{5}}\nOriginal Due Date: {{6}}\n\nPlease select an option below:",
      "actions": [
        {
          "type": "QUICK_REPLY",
          "title": "Pay Now",
          "id": "pay_{{5}}"
        },
        {
          "type": "QUICK_REPLY",
          "title": "Request Extension",
          "id": "extension_{{5}}"
        },
        {
          "type": "QUICK_REPLY",
          "title": "Contact Us",
          "id": "contact_{{5}}"
        }
      ]
    }
  },
  "variables": {
    "1": "Sarah",
    "2": "2,450.00",
    "3": "Emma",
    "4": "7",
    "5": "INV-2026-001234",
    "6": "21 February 2026"
  }
}
```

**Rich Features**:
- 3 quick reply buttons for immediate action
- Button responses trigger automated workflows
- Personalized with parent name and child name
- Clear overdue amount and days

**Button Response Handling**:
| Button | Response Action |
|--------|-----------------|
| "Pay Now" | Send payment link via session message |
| "Request Extension" | Log request, notify admin, send confirmation |
| "Contact Us" | Open 24h session for conversation |

---

### 2.3 Payment Confirmation with Receipt

**Template Name**: `cb_payment_confirmation`
**Content Type**: `twilio/card` with media
**Category**: UTILITY

```json
{
  "friendly_name": "CrecheBooks Payment Confirmation",
  "language": "en",
  "types": {
    "twilio/card": {
      "title": "Payment Received",
      "subtitle": "Receipt {{1}}",
      "body": "Thank you, {{2}}!\n\nWe've received your payment of R{{3}}.\n\nReference: {{4}}\nDate: {{5}}\nApplied to: {{6}}\n\nRemaining Balance: R{{7}}",
      "media": ["{{8}}"],
      "actions": [
        {
          "type": "URL",
          "title": "View Receipt",
          "url": "https://app.crechebooks.co.za/receipts/{{1}}"
        }
      ]
    }
  },
  "variables": {
    "1": "REC-2026-00456",
    "2": "Sarah",
    "3": "2,450.00",
    "4": "SMITH-FEB-2026",
    "5": "15 February 2026",
    "6": "INV-2026-001234",
    "7": "0.00",
    "8": "https://api.crechebooks.co.za/receipts/REC-2026-00456/pdf"
  }
}
```

**Rich Features**:
- PDF receipt attachment
- Clear payment breakdown
- View Receipt CTA button
- Shows remaining balance

---

### 2.4 Arrears Notice with Contact Options

**Template Name**: `cb_arrears_notice`
**Content Type**: `twilio/call-to-action`
**Category**: UTILITY

```json
{
  "friendly_name": "CrecheBooks Arrears Notice",
  "language": "en",
  "types": {
    "twilio/call-to-action": {
      "body": "Important Account Notice\n\nDear {{1}},\n\nYour account is {{2}} days in arrears with an outstanding balance of R{{3}}.\n\nOldest unpaid invoice: {{4}}\nNumber of unpaid invoices: {{5}}\n\nPlease contact us to discuss payment arrangements.\n\nKind regards,\n{{6}}",
      "actions": [
        {
          "type": "URL",
          "title": "View Account",
          "url": "https://app.crechebooks.co.za/account/{{7}}"
        },
        {
          "type": "PHONE_NUMBER",
          "title": "Call Us",
          "phone": "{{8}}"
        }
      ]
    }
  },
  "variables": {
    "1": "Sarah Smith",
    "2": "45",
    "3": "4,900.00",
    "4": "INV-2026-000123",
    "5": "2",
    "6": "Little Stars Creche",
    "7": "parent-123",
    "8": "+27600188230"
  }
}
```

**Rich Features**:
- URL button to view account summary
- Phone number button for direct call
- Professional escalation tone
- Full arrears details

---

### 2.5 Welcome Message with Portal Access

**Template Name**: `cb_welcome_enrollment`
**Content Type**: `twilio/card`
**Category**: UTILITY

```json
{
  "friendly_name": "CrecheBooks Welcome Message",
  "language": "en",
  "types": {
    "twilio/card": {
      "title": "Welcome to {{1}}!",
      "subtitle": "Enrollment Confirmed",
      "body": "Dear {{2}},\n\nWe're delighted that {{3}} is joining our family!\n\nEnrollment Details:\n- Start Date: {{4}}\n- Monthly Fee: R{{5}}\n- Fee Structure: {{6}}\n\nYour parent portal is ready. Set up your account to:\n- View and pay invoices\n- Track payments\n- Update contact preferences",
      "media": ["{{7}}"],
      "actions": [
        {
          "type": "URL",
          "title": "Set Up Portal",
          "url": "https://app.crechebooks.co.za/onboard/{{8}}"
        },
        {
          "type": "PHONE_NUMBER",
          "title": "Contact Us",
          "phone": "{{9}}"
        }
      ]
    }
  },
  "variables": {
    "1": "Little Stars Creche",
    "2": "Sarah",
    "3": "Emma Smith",
    "4": "1 March 2026",
    "5": "2,450.00",
    "6": "Full Day",
    "7": "https://cdn.crechebooks.co.za/welcome-banner.jpg",
    "8": "onboard-token-123",
    "9": "+27600188230"
  }
}
```

**Rich Features**:
- Welcoming card with creche branding image
- Portal setup CTA button
- Phone number for questions
- Complete enrollment summary

---

### 2.6 Monthly Statement Notification

**Template Name**: `cb_statement_notification`
**Content Type**: `twilio/card` with document
**Category**: UTILITY

```json
{
  "friendly_name": "CrecheBooks Statement Notification",
  "language": "en",
  "types": {
    "twilio/card": {
      "title": "{{1}} Statement Ready",
      "subtitle": "Period: {{2}} to {{3}}",
      "body": "Hi {{4}},\n\nYour monthly statement is ready.\n\nOpening Balance: R{{5}}\nCharges: R{{6}}\nPayments: R{{7}}\nClosing Balance: R{{8}}\n\nDownload the attached PDF for full details.",
      "media": ["{{9}}"],
      "actions": [
        {
          "type": "URL",
          "title": "View Statement",
          "url": "https://app.crechebooks.co.za/statements/{{10}}"
        }
      ]
    }
  },
  "variables": {
    "1": "February 2026",
    "2": "1 February 2026",
    "3": "28 February 2026",
    "4": "Sarah",
    "5": "0.00",
    "6": "2,450.00",
    "7": "2,450.00",
    "8": "0.00",
    "9": "https://api.crechebooks.co.za/statements/STM-2026-02-123/pdf",
    "10": "STM-2026-02-123"
  }
}
```

**Rich Features**:
- PDF statement attachment
- Balance summary at a glance
- View in portal CTA
- Period clearly stated

---

## 3. Enhanced Templates (Priority 2)

### 3.1 Reminder Escalation Series

Three templates with increasing urgency levels:

#### Friendly Reminder (1-7 days overdue)

**Template Name**: `cb_reminder_friendly`

```json
{
  "types": {
    "twilio/quick-reply": {
      "body": "Hi {{1}}, just a quick reminder that your payment of R{{2}} for {{3}} was due on {{4}}. If you've already paid, please ignore this message. Otherwise, please settle at your earliest convenience.",
      "actions": [
        { "type": "QUICK_REPLY", "title": "Pay Now", "id": "pay_{{5}}" },
        { "type": "QUICK_REPLY", "title": "Already Paid", "id": "paid_{{5}}" },
        { "type": "QUICK_REPLY", "title": "Need Help", "id": "help_{{5}}" }
      ]
    }
  }
}
```

#### Firm Reminder (8-14 days overdue)

**Template Name**: `cb_reminder_firm`

```json
{
  "types": {
    "twilio/quick-reply": {
      "body": "Dear {{1}},\n\nYour account is now {{2}} days overdue. The outstanding amount of R{{3}} requires your immediate attention.\n\nTo avoid service disruption, please settle this amount or contact us to discuss a payment plan.",
      "actions": [
        { "type": "QUICK_REPLY", "title": "Pay Now", "id": "pay_{{4}}" },
        { "type": "QUICK_REPLY", "title": "Payment Plan", "id": "plan_{{4}}" },
        { "type": "QUICK_REPLY", "title": "Call Me", "id": "callback_{{4}}" }
      ]
    }
  }
}
```

#### Final Notice (15+ days overdue)

**Template Name**: `cb_reminder_final`

```json
{
  "types": {
    "twilio/call-to-action": {
      "body": "URGENT: Final Payment Notice\n\nDear {{1}},\n\nDespite previous reminders, your account remains {{2}} days overdue with R{{3}} outstanding.\n\nThis is your final notice before we escalate to our collections procedure.\n\nPlease contact us immediately to resolve this matter.",
      "actions": [
        { "type": "URL", "title": "Pay Immediately", "url": "https://app.crechebooks.co.za/pay/{{4}}" },
        { "type": "PHONE_NUMBER", "title": "Call Now", "phone": "{{5}}" }
      ]
    }
  }
}
```

---

### 3.2 Fee Adjustment Notification

**Template Name**: `cb_fee_adjustment`
**Content Type**: `twilio/card`

```json
{
  "types": {
    "twilio/card": {
      "title": "Fee Structure Update",
      "subtitle": "Effective {{1}}",
      "body": "Dear {{2}},\n\nWe're writing to inform you of an upcoming fee adjustment for {{3}}.\n\nCurrent Fee: R{{4}}\nNew Fee: R{{5}}\nEffective From: {{1}}\n\nThis adjustment reflects our commitment to maintaining quality care and facilities.",
      "actions": [
        { "type": "URL", "title": "View Details", "url": "https://app.crechebooks.co.za/fees/{{6}}" },
        { "type": "QUICK_REPLY", "title": "I Understand", "id": "ack_fee_{{6}}" }
      ]
    }
  }
}
```

---

### 3.3 Payment Allocation Notification

**Template Name**: `cb_payment_allocated`
**Content Type**: `twilio/text`

```json
{
  "types": {
    "twilio/text": {
      "body": "Hi {{1}},\n\nYour payment of R{{2}} (Ref: {{3}}) has been allocated:\n\n{{4}}\n\nUpdated Balance: R{{5}}\n\nThank you for your payment!"
    }
  },
  "variables": {
    "1": "Sarah",
    "2": "4,900.00",
    "3": "SMITH-FEB-2026",
    "4": "- INV-2026-001: R2,450.00\n- INV-2026-002: R2,450.00",
    "5": "0.00"
  }
}
```

---

## 4. Session-Based Interactive Features

These features are available **only during active 24-hour sessions** (after parent messages us):

### 4.1 Statement Period Selector

**Content Type**: `twilio/list-picker` (NO APPROVAL REQUIRED)

```json
{
  "types": {
    "twilio/list-picker": {
      "body": "Which statement would you like to view?",
      "button": "Select Period",
      "items": [
        { "item": "Current Month", "id": "statement_current", "description": "February 2026" },
        { "item": "Previous Month", "id": "statement_prev", "description": "January 2026" },
        { "item": "Last 3 Months", "id": "statement_3mo", "description": "Dec 2025 - Feb 2026" },
        { "item": "Year to Date", "id": "statement_ytd", "description": "Jan - Feb 2026" },
        { "item": "Last Tax Year", "id": "statement_tax", "description": "Mar 2025 - Feb 2026" }
      ]
    }
  }
}
```

### 4.2 Invoice Selection Menu

**Content Type**: `twilio/list-picker`

```json
{
  "types": {
    "twilio/list-picker": {
      "body": "You have 3 unpaid invoices. Which would you like to view?",
      "button": "View Invoices",
      "items": [
        { "item": "INV-2026-003", "id": "inv_003", "description": "R2,450.00 - Due 28 Feb" },
        { "item": "INV-2026-002", "id": "inv_002", "description": "R2,450.00 - Overdue 15 days" },
        { "item": "INV-2026-001", "id": "inv_001", "description": "R2,450.00 - Overdue 45 days" }
      ]
    }
  }
}
```

### 4.3 Help Menu

**Content Type**: `twilio/list-picker`

```json
{
  "types": {
    "twilio/list-picker": {
      "body": "How can we help you today?",
      "button": "Select Topic",
      "items": [
        { "item": "View My Balance", "id": "help_balance", "description": "Check outstanding amount" },
        { "item": "Payment Methods", "id": "help_payment", "description": "How to pay your fees" },
        { "item": "Request Statement", "id": "help_statement", "description": "Get account statement" },
        { "item": "Update Details", "id": "help_update", "description": "Change contact info" },
        { "item": "Speak to Someone", "id": "help_human", "description": "Request callback" }
      ]
    }
  }
}
```

### 4.4 Quick Balance Check (Session)

**Content Type**: `twilio/quick-reply` (3 buttons, no approval needed)

```json
{
  "types": {
    "twilio/quick-reply": {
      "body": "Your current balance is R{{1}}.\n\n{{2}} invoice(s) outstanding.\n\nWhat would you like to do?",
      "actions": [
        { "type": "QUICK_REPLY", "title": "Pay Now", "id": "pay_balance" },
        { "type": "QUICK_REPLY", "title": "View Invoices", "id": "view_invoices" },
        { "type": "QUICK_REPLY", "title": "Get Statement", "id": "get_statement" }
      ]
    }
  }
}
```

---

## 5. Content Type Usage Matrix

| Template | Text | Media | Quick Reply | CTA URL | CTA Phone | Card | List |
|----------|------|-------|-------------|---------|-----------|------|------|
| Invoice Notification | | PDF | | View, Pay | | Yes | |
| Payment Reminder (Friendly) | | | 3 buttons | | | | |
| Payment Reminder (Firm) | | | 3 buttons | | | | |
| Payment Reminder (Final) | | | | Pay | Call | | |
| Payment Confirmation | | Receipt PDF | | View | | Yes | |
| Arrears Notice | | | | Account | Call | | |
| Welcome Message | | Banner | | Portal | Call | Yes | |
| Statement Notification | | Statement PDF | | View | | Yes | |
| Payment Allocated | Yes | | | | | | |
| Fee Adjustment | | | 1 button | View | | Yes | |
| **Session-Only** | | | | | | | |
| Statement Selector | | | | | | | Yes |
| Invoice Selector | | | | | | | Yes |
| Help Menu | | | | | | | Yes |
| Balance Check | | | 3 buttons | | | | |

---

## 6. Variable Standards

### Naming Convention

Variables use sequential numbering: `{{1}}`, `{{2}}`, `{{3}}`

### Common Variables by Position

| Position | Common Usage | Format |
|----------|--------------|--------|
| `{{1}}` | Parent first name | Text, max 50 chars |
| `{{2}}` | Amount (ZAR) | "2,450.00" (comma thousands) |
| `{{3}}` | Child first name | Text, max 50 chars |
| `{{4}}` | Date | "28 February 2026" |
| `{{5}}` | Invoice/Receipt number | "INV-2026-001234" |
| `{{6}}` | Period/Description | Text |
| `{{7}}` | Media URL | HTTPS URL |
| `{{8}}` | Deep link ID | alphanumeric |

### Amount Formatting

All amounts displayed in South African Rand:
- Symbol: `R` (no space before number)
- Format: `R2,450.00` (comma for thousands, period for decimals)
- Always show 2 decimal places

### Date Formatting

- Display: `28 February 2026` (day month year)
- Period ranges: `1 February 2026 to 28 February 2026`

---

## 7. Implementation Roadmap

### Phase 1: Core Billing Templates (Week 1-2)

| Template | Status | Submit By |
|----------|--------|-----------|
| `cb_invoice_with_document` | To Create | Day 1 |
| `cb_payment_reminder_interactive` | To Create | Day 1 |
| `cb_payment_confirmation` | To Create | Day 1 |
| `cb_reminder_friendly` | To Create | Day 2 |
| `cb_reminder_firm` | To Create | Day 2 |
| `cb_reminder_final` | To Create | Day 2 |

**Expected Approval Time**: 24-48 hours per template

### Phase 2: Engagement Templates (Week 2-3)

| Template | Status | Submit By |
|----------|--------|-----------|
| `cb_welcome_enrollment` | To Create | Day 7 |
| `cb_statement_notification` | To Create | Day 7 |
| `cb_arrears_notice` | To Create | Day 8 |
| `cb_payment_allocated` | To Create | Day 8 |

### Phase 3: Session Features (Week 3-4)

No approval required - implement in code:
- Statement period selector
- Invoice selection menu
- Help menu
- Quick balance check

### Phase 4: Advanced Features (Week 4+)

- Two-way conversation handling
- Webhook status tracking
- Analytics dashboard

---

## 8. Template Specifications

### Twilio Content Template Builder Settings

For each template, configure in Twilio Console:

```
Content Template Builder > Create Template

1. Friendly Name: cb_[template_name]
2. Language: English (en)
3. Content Type: Select appropriate type
4. WhatsApp Approval: Enable
5. Category: UTILITY
```

### API Registration

Templates are registered via Twilio Content API:

```typescript
// POST /v1/Content
{
  "friendly_name": "cb_invoice_with_document",
  "language": "en",
  "variables": {
    "1": "INV-2026-001234",
    // ... sample values
  },
  "types": {
    "twilio/card": {
      // template content
    }
  }
}
```

### Content SID Storage

After creation, store Content SIDs in database:

```sql
CREATE TABLE whatsapp_templates (
  id UUID PRIMARY KEY,
  template_name VARCHAR(100) UNIQUE NOT NULL,
  content_sid VARCHAR(34) NOT NULL,  -- Twilio Content SID
  status VARCHAR(20) DEFAULT 'pending',
  category VARCHAR(20) DEFAULT 'utility',
  created_at TIMESTAMP DEFAULT NOW(),
  approved_at TIMESTAMP,
  variables JSONB
);
```

---

## 9. Compliance Requirements

### POPIA Compliance

- **Opt-in Required**: All templates require `parent.whatsappOptIn = true`
- **Consent Timestamp**: Record when consent was given
- **Easy Opt-out**: Honor STOP/UNSUBSCRIBE/OPTOUT immediately
- **Data Retention**: Follow 7-year financial record requirement

### WhatsApp Business Policy

- **No Spam**: Only send relevant, opted-in communications
- **Clear Identity**: Templates identify sender (creche name)
- **Actionable**: Include clear next steps
- **Professional Tone**: Maintain business communication standards

### Template Best Practices

**DO**:
- Provide sample values for all variables
- Use clear, grammatically correct English
- Include specific transaction details
- Test thoroughly before submission

**DON'T**:
- Start/end with variables
- Use adjacent variables (`{{1}}{{2}}`)
- Create generic/reusable-for-anything templates
- Include WhatsApp links in templates

---

## Appendix A: Button Response Handling

### Quick Reply Workflow

When parent taps a quick reply button, the payload is received via webhook:

```typescript
// Webhook receives:
{
  "button": {
    "text": "Pay Now",
    "payload": "pay_INV-2026-001234"
  }
}

// Parse and handle:
switch (payload.split('_')[0]) {
  case 'pay':
    // Send payment link (session message)
    await sendSessionMessage(parentPhone, {
      body: `Here's your secure payment link:\nhttps://app.crechebooks.co.za/pay/${invoiceId}`,
      actions: [{ type: 'URL', title: 'Complete Payment', url: paymentUrl }]
    });
    break;

  case 'extension':
    // Log extension request, notify admin
    await createExtensionRequest(invoiceId, parentId);
    await sendSessionMessage(parentPhone, {
      body: 'Your payment extension request has been submitted. Our team will contact you within 24 hours.'
    });
    break;

  case 'contact':
    // Open conversation window
    await sendSessionMessage(parentPhone, {
      body: "I'm here to help! Please type your question and I'll assist you."
    });
    break;
}
```

### List Picker Response Handling

```typescript
// Webhook receives:
{
  "list_reply": {
    "id": "statement_3mo",
    "title": "Last 3 Months"
  }
}

// Generate and send statement (session message with PDF)
const statementPdf = await generateStatement(parentId, 'last_3_months');
await sendSessionMessage(parentPhone, {
  body: 'Here is your requested statement for the last 3 months.',
  media: [statementPdf.url]
});
```

---

## Appendix B: Template Submission Checklist

Before submitting each template:

- [ ] Unique, descriptive template name (`cb_` prefix)
- [ ] Language set to `en`
- [ ] Category set to `UTILITY`
- [ ] All variables have sample values
- [ ] No adjacent variables
- [ ] Doesn't start/end with variable
- [ ] Body under 1,024 characters
- [ ] Button text under 20 characters
- [ ] URLs are publicly accessible
- [ ] Phone numbers in E.164 format
- [ ] Professional, grammatically correct
- [ ] Relates to specific user transaction/account

---

## Appendix C: Error Codes Reference

| Code | Meaning | Action |
|------|---------|--------|
| 63016 | Template not approved | Wait for approval or fix issues |
| 63024 | Rate limit exceeded | Implement backoff |
| 63025 | Template paused | Check template quality, user feedback |
| 63026 | Template disabled | Create new template |
| 21610 | Unsubscribed recipient | Respect opt-out |
| 21614 | Invalid WhatsApp number | Validate phone format |

---

*Document maintained by CrecheBooks Development Team*
*Last updated: 2026-02-04*
