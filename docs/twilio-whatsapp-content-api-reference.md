# Twilio WhatsApp Content API - Complete Reference

> Research compiled: 2026-02-04
> Purpose: CrecheBooks WhatsApp Template Planning

---

## Table of Contents

1. [Content Types Overview](#1-content-types-overview)
2. [Template Categories](#2-template-categories)
3. [Interactive Features](#3-interactive-features)
4. [Media Support](#4-media-support)
5. [Variable and Placeholder Syntax](#5-variable-and-placeholder-syntax)
6. [Session vs Template Messaging](#6-session-vs-template-messaging)
7. [Best Practices](#7-best-practices)
8. [Character Limits Quick Reference](#8-character-limits-quick-reference)

---

## 1. Content Types Overview

Twilio Content API supports the following content types, ordered by complexity:

### Basic Types

| Type | Description | WhatsApp Support | Notes |
|------|-------------|------------------|-------|
| `twilio/text` | Simple text messages | Yes | All channels |
| `twilio/media` | Images, videos, documents, audio | Yes | See Media Support section |

### Interactive Types

| Type | Description | WhatsApp Support | Notes |
|------|-------------|------------------|-------|
| `twilio/quick-reply` | Button-based replies | Yes | Up to 10 buttons (3 in-session without approval) |
| `twilio/call-to-action` | URL or phone actions | Yes | Up to 2 buttons |
| `twilio/list-picker` | Selection menu | Yes | Session-only, max 10 items |
| `twilio/card` | Rich card with media and buttons | Yes | Up to 10 buttons |
| `twilio/carousel` | Multiple cards in sequence | Yes | Not on Messenger |

### Advanced Types

| Type | Description | WhatsApp Support | Notes |
|------|-------------|------------------|-------|
| `twilio/location` | Location sharing | Yes | API-only (not in Console) |
| `twilio/catalog` | Product catalogs | Yes | Requires Meta Commerce Manager |
| `twilio/pay` | Payment functionality | Yes | API-only |
| `twilio/flows` | Interactive flows | Yes | API-only |

### WhatsApp-Specific Types

| Type | Description | Notes |
|------|-------------|-------|
| `whatsapp/card` | Native WhatsApp cards | WhatsApp-optimized format |
| `whatsapp/authentication` | OTP/verification codes | Copy-code button, auto-fill support |

---

## 2. Template Categories

WhatsApp requires templates to be categorized. Each category has different pricing and requirements.

### UTILITY Templates

**Purpose**: Transaction-related, event-triggered messages

**Examples**:
- Order confirmations
- Shipping/delivery updates
- Appointment reminders
- Payment receipts
- Account notifications
- Subscription updates

**Requirements**:
- Must include specifics about an active transaction, account, subscription, or interaction
- Must be tied to a user action or request
- User must have opted in

**Pricing**: Mid-tier (free inside open customer service window)

**CrecheBooks Use Cases**:
- Invoice generated notifications
- Payment received confirmations
- Fee due reminders
- Enrollment confirmations

### MARKETING Templates

**Purpose**: Promotional content, awareness, engagement

**Examples**:
- New product/service announcements
- Promotional offers
- Cart abandonment reminders
- General surveys ("How did we do?")
- Re-engagement campaigns

**Requirements**:
- Explicit opt-in required
- Cannot be disguised as utility

**Pricing**: Highest per-message cost

**Note**: As of July 2025, generic surveys not tied to specific transactions are classified as Marketing.

### AUTHENTICATION Templates

**Purpose**: User verification and security

**Examples**:
- One-time passwords (OTP)
- Login verification codes
- Account recovery codes
- Two-factor authentication

**Features**:
- One-tap autofill button
- Copy code button
- Zero-tap (direct OTP forwarding to app)

**Requirements**:
- Meta determines the body text format
- Must use authentication template format

**Pricing**: Lowest per-message cost

---

## 3. Interactive Features

### Quick Reply Buttons (`twilio/quick-reply`)

**Limits**:
| Context | Max Buttons |
|---------|-------------|
| Template (approved) | 10 buttons |
| In-session (no approval) | 3 buttons |

**Character Limits**:
| Element | Limit |
|---------|-------|
| Button title | 20 characters |
| Button payload (ID) | 200 characters |
| Body text | 1,024 characters |

**Behavior**: When tapped, sends the button text as a message in the conversation.

**Approval**: Can be sent without approval within 24-hour session (max 3 buttons).

### Call-to-Action Buttons (`twilio/call-to-action`)

**Button Types**:
| Type | Limit | Description |
|------|-------|-------------|
| URL | 1 per template | Opens website |
| Phone | 1 per template | Initiates call |
| VoIP Call | 1 per template | WhatsApp voice call |
| Copy Code | 1 per template | Copies coupon code |

**Total**: Maximum 2 buttons per template

**URL Requirements**:
- Must resolve to publicly accessible website
- Dynamic URLs supported: `https://example.com/{{1}}`
- No whatsapp.me links allowed

**Phone Requirements**:
- Must be E.164 format (e.g., `+27123456789`)

**Approval**: Required for coupon code buttons; URL-only templates can be used in-session.

### List Picker (`twilio/list-picker`)

**Structure**:
```json
{
  "body": "Select an option:",
  "button": "View Options",
  "items": [
    {
      "item": "Option Title",
      "id": "option_1",
      "description": "Option description"
    }
  ]
}
```

**Limits**:
| Element | Limit |
|---------|-------|
| Items | 1-10 |
| Item title | 24 characters |
| Item description | 72 characters |
| Item ID | 200 characters |
| Body text | 1,024 characters |
| Button text | 20 characters |

**Critical Limitation**:
- Cannot be submitted for WhatsApp approval
- Session-only (24-hour customer-initiated window)
- Cannot initiate business conversations

### Card Messages (`twilio/card`)

**Structure**:
```json
{
  "title": "Card Title",
  "body": "Card body text",
  "subtitle": "Optional subtitle",
  "media": ["https://example.com/image.jpg"],
  "actions": [
    {
      "type": "QUICK_REPLY",
      "title": "Button Text",
      "id": "button_id"
    }
  ]
}
```

**Field Limits**:
| Field | WhatsApp Limit |
|-------|----------------|
| Title | 1,024 characters |
| Body | 1,600 characters |
| Subtitle | 60 characters |
| Button title | 20 characters |

**Button Limits (WhatsApp)**:
- Maximum 10 buttons total
- Up to 2 URL buttons
- Only 1 phone/VoIP button (one or the other)

**Requirements**:
- Must include title OR body (at least one)
- Must include at least one additional field

### Catalog Messages (`twilio/catalog`)

**Message Types**:
| Type | Items | Session Requirement |
|------|-------|---------------------|
| Single Product | 1 | In-session only |
| Multi-Product | 1-30 | In or out of session |
| Full Catalog | All | In or out of session |

**Setup Requirements**:
1. Create catalog in Meta Commerce Manager
2. Add products with Content IDs
3. Connect catalog to WhatsApp Business Account
4. Use Catalog ID in template

**Field Limits**:
| Field | Limit |
|-------|-------|
| Title (MPM) | 60 characters |
| Body | 1,024 characters |
| Subtitle | 1,024 characters |

**Dynamic Items**: Supported via `"dynamic_items": "{{products}}"`

### Location Messages (`twilio/location`)

**Sending Location**:
- Provide latitude, longitude, name, and address
- API-only (not in Console)

**Requesting Location**:
- Displays body text with "Send Location" button
- User shares GPS location
- Webhook returns latitude/longitude (address/name optional)

---

## 4. Media Support

### Supported File Types

| Category | Formats | Max Size |
|----------|---------|----------|
| **Images** | JPG, JPEG, PNG | 5 MB |
| **Stickers** | WEBP | 100 KB |
| **Audio** | OGG (opus), AMR, 3GP, AAC, MPEG | 16 MB |
| **Video** | MP4 (H.264 + AAC) | 16 MB |
| **Documents** | PDF, DOC, DOCX, PPTX, XLSX | 16 MB |
| **Contacts** | vCard (.vcf) | N/A |

### Voice Notes

- Use OGG format with opus codec
- Files can have `.ogg` or `.opus` extension
- Other audio formats appear as downloadable files (not playable inline)

### Image Guidelines

- Maximum size: 5 MB
- Supported formats: JPG, JPEG, PNG
- No specific dimension requirements documented
- Publicly accessible URL required

### Document Guidelines

- Maximum size: 16 MB
- Filename: Keep to 20 characters or less
- Avoid special characters: `~ !` and others
- **Limitation**: Cannot set custom filename or caption

### Important Limitations

1. **No caption with certain media**: Cannot include text body with video, audio, document, contact, or location in same message
2. **Content-Type validation**: Twilio validates file headers; mismatch causes rejection
3. **WEBP stickers**: Only supported as stickers, max 100 KB

---

## 5. Variable and Placeholder Syntax

### Basic Syntax

Variables use double curly braces with numbers:
```
{{1}}, {{2}}, {{3}}, etc.
```

### Usage Examples

**Simple text**:
```
Your invoice {{1}} for {{2}} is due on {{3}}.
```

**With amounts**:
```
Your payment of R{{1}} has been received. Thank you!
```

### Variable Rules

1. **Sequential ordering**: Use `{{1}}`, `{{2}}`, `{{3}}` in order
2. **No adjacent variables**: Cannot use `{{1}}{{2}}` together
3. **No starting/ending with variable**: Template cannot begin or end with `{{1}}`
4. **Sample values required**: Must provide example values for approval

### Supported Components

Variables are supported in:
- Header (text and media)
- Body
- Buttons (URL paths, quick reply IDs)

**Not supported**:
- Footer (no personalization or emojis allowed)

### Dynamic URL Example

```json
{
  "actions": [
    {
      "type": "URL",
      "title": "View Invoice",
      "url": "https://app.crechebooks.co.za/invoices/{{1}}"
    }
  ]
}
```

Provide sample in variables:
```json
"variables": {
  "1": "INV-2026-001"
}
```

---

## 6. Session vs Template Messaging

### Message Types

| Type | Description | Template Required |
|------|-------------|-------------------|
| **Session Message** | Reply within 24-hour window | No |
| **Template Message** | Business-initiated or after 24 hours | Yes (approved) |

### 24-Hour Session Window

- Starts when user sends a message
- Lasts 24 hours from most recent incoming message
- Allows free-form replies including media
- No template approval needed

### In-Session Rich Content (No Approval)

The following can be sent during an active session without template approval:

| Content Type | In-Session Limit |
|--------------|------------------|
| Quick Reply | 3 buttons |
| URL CTA | Yes |
| List Picker | 10 items |
| Media | All types |
| Text | Standard |

**Not available in-session**:
- Coupon code buttons (always need approval)

### Business-Initiated (Template Required)

Required for:
- First message to a user
- Any message after 24-hour window expires
- Notification use cases (reminders, alerts)

**Template Types Available**:
- Text only
- Text with media header
- Quick Reply (up to 10 buttons)
- Call-to-Action (up to 2 buttons)
- Card messages
- Carousel
- Catalog (multi-product)

**Not available as approved templates**:
- List Picker (session-only)
- Single Product Messages (session-only)

---

## 7. Best Practices

### Template Approval Tips

**Do**:
- Write clear, specific purpose
- Include sample values for all variables
- Use professional, grammatically correct text
- Choose correct category (Utility, Marketing, Authentication)
- Keep content focused and non-generic

**Don't**:
- Start or end with variables
- Place two variables adjacent: `{{1}}{{2}}`
- Use placeholders that could enable abuse
- Create generic templates (be specific)
- Duplicate existing template content
- Include whatsapp.me links

### Common Rejection Reasons

1. Format incorrect (malformed placeholders)
2. Content violates WhatsApp policies
3. Template too generic
4. Variable at start/end of message
5. Purpose not clear or well-written
6. Placeholders not sequential
7. Adjacent placeholders
8. Duplicate of existing template

### Opt-In Requirements

**Must have**:
- Explicit, active opt-in from user
- User knowingly signs up
- Record of consent (recommended)

**Cannot**:
- Assume consent
- Pre-check opt-in boxes
- Send without prior agreement

### Opt-Out Best Practices

1. Honor opt-out requests immediately
2. Use Advanced Opt-Out feature for WhatsApp senders
3. Maintain cross-channel opt-out consistency
4. Provide easy opt-out instructions

### Template Quality

To avoid pausing/disabling:
- Monitor user feedback
- Avoid templates that trigger negative responses
- WhatsApp pauses templates after recurring negative feedback
- Third pause = permanent disable

### Template Statuses

| Status | Meaning |
|--------|---------|
| Pending | Under review (up to 48 hours) |
| Approved | Ready to use |
| Rejected | Failed review |
| Paused | Negative feedback (3-6 hours) |
| Disabled | Permanent (after 3rd pause or policy violation) |

---

## 8. Character Limits Quick Reference

### Message Body

| Context | Limit |
|---------|-------|
| Template body | 1,024 characters |
| Free-form message | 1,600 characters |
| Interactive message body | 1,024 characters |

### Headers and Footers

| Element | Limit |
|---------|-------|
| Header (text) | 60 characters |
| Header (caption) | 256 characters |
| Footer | 60 characters |

### Buttons

| Element | Limit |
|---------|-------|
| Button text | 20 characters |
| Quick reply payload | 200 characters |
| URL button text | 25 characters |

### List Picker

| Element | Limit |
|---------|-------|
| Item count | 10 items |
| Item title | 24 characters |
| Item description | 72 characters |
| Item ID | 200 characters |
| Button text | 20 characters |

### Card

| Element | WhatsApp Limit |
|---------|----------------|
| Title | 1,024 characters |
| Body | 1,600 characters |
| Subtitle | 60 characters |
| Button count | 10 |

### Catalog

| Element | Limit |
|---------|-------|
| Title (MPM) | 60 characters |
| Body | 1,024 characters |
| Item count (MPM) | 1-30 |

### General Limits

| Limit | Value |
|-------|-------|
| Templates per WABA | 6,000 |
| Media file size | 16 MB (5 MB for images) |
| Emoji limit in templates | 10 |

---

## CrecheBooks Template Planning Notes

### Recommended Templates for Invoice Workflow

1. **Invoice Generated (Utility)**
   - Type: `twilio/card` or text with CTA button
   - Variables: Parent name, invoice number, amount, due date
   - Button: "View Invoice" (URL to PDF or portal)

2. **Payment Reminder (Utility)**
   - Type: `twilio/quick-reply` with action options
   - Variables: Amount, due date, child name
   - Buttons: "Pay Now", "Contact Us", "Payment Arrangement"

3. **Payment Received (Utility)**
   - Type: `twilio/text` or `twilio/media` (with receipt)
   - Variables: Amount, reference, balance

4. **Statement Request Response (Session)**
   - Type: `twilio/list-picker` (session-only)
   - Options: Current month, Previous month, Year to date, Custom period

### Implementation Considerations

1. **PDF Invoices**: Use `twilio/media` with PDF attachment (max 16 MB)
2. **Quick Actions**: Use Quick Reply for common responses
3. **View Online**: Use CTA URL button to invoice portal
4. **Session-Only Features**: List picker for menu-driven interactions

---

## Sources

- [Twilio Content Templates Overview](https://www.twilio.com/docs/content/overview)
- [Twilio Content Types Overview](https://www.twilio.com/docs/content/content-types-overview)
- [Twilio Quick Reply Documentation](https://www.twilio.com/docs/content/twilio-quick-reply)
- [Twilio Call-to-Action Documentation](https://www.twilio.com/docs/content/twilio-call-to-action)
- [Twilio Card Documentation](https://www.twilio.com/docs/content/twiliocard)
- [Twilio List Picker Documentation](https://www.twilio.com/docs/content/twiliolist-picker)
- [Twilio Catalog Documentation](https://www.twilio.com/docs/content/twilio-catalog)
- [Using Buttons in WhatsApp](https://www.twilio.com/docs/whatsapp/buttons)
- [WhatsApp Media Messages Guide](https://www.twilio.com/docs/whatsapp/guidance-whatsapp-media-messages)
- [WhatsApp Template Approvals](https://www.twilio.com/docs/whatsapp/tutorial/message-template-approvals-statuses)
- [WhatsApp Best Practices](https://www.twilio.com/docs/whatsapp/best-practices-and-faqs)
- [Rules for WhatsApp Messaging](https://help.twilio.com/articles/360017773294-Rules-and-Best-Practices-for-WhatsApp-Messaging-on-Twilio)
- [Template Creation Best Practices](https://help.twilio.com/articles/360039737753-Recommendations-and-Best-Practices-for-Creating-WhatsApp-Message-Templates)
- [WhatsApp Template Categories Guide](https://sanuker.com/guideline-to-whatsapp-template-message-categories/)
- [Infobip WhatsApp Message Types](https://www.infobip.com/docs/whatsapp/message-types-and-templates)
