<task_spec id="TASK-ENROL-007" version="1.0">

<metadata>
  <title>Parent Welcome Email Template</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>267</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-ENROL-007</requirement_ref>
    <requirement_ref>REQ-PARENT-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-ENROL-006</task_ref>
    <task_ref status="complete">TASK-BILL-013</task_ref>
    <task_ref status="complete">TASK-BILL-042</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <last_updated>2026-01-20</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current Email Template Infrastructure

  **Existing EmailTemplateService (email-template.service.ts):**
  - `renderInvoiceEmail()` - HTML email for invoices
  - `renderStatementEmail()` - HTML email for statements
  - Consistent branding with tenant details
  - Responsive HTML templates
  - Plain text fallback generation

  **Template Pattern:**
  - Each email type has a data interface (e.g., InvoiceEmailData)
  - `render*Email()` method returns { text, html, subject }
  - HTML includes header with tenant name, body content, footer
  - Support for bank details in payment instructions

  **Email Delivery (email.service.ts):**
  - Mailgun integration
  - HTML + plain text multipart emails
  - PDF attachments support
  - Custom variables for webhook tracking
</project_state>

<context>
  ## Business Requirement

  When a child is enrolled, the parent should receive a professional welcome email that:

  1. **Welcomes the parent** with a warm, personalized message
  2. **Confirms enrollment details**: Child name, start date, class (if applicable)
  3. **Summarizes key information**: Operating hours, contact details
  4. **Highlights next steps**: What to bring, first day instructions
  5. **Includes PDF attachment**: Full welcome pack with detailed information
  6. **Provides payment information**: Fee amount, bank details for payment

  ## Email Structure
  - Subject: "Welcome to [Crèche Name] - [Child Name]'s Enrollment Confirmed"
  - Header: Tenant branding
  - Body: Welcome message, enrollment summary, quick reference info
  - Footer: Contact information, support email
  - Attachment: Welcome Pack PDF (from TASK-ENROL-006)

  ## Project Context
  - **Email Service**: Mailgun API
  - **Template Service**: EmailTemplateService
  - **Pattern**: Follow existing invoice/statement email patterns
</context>

<input_context_files>
  <file purpose="email_template_service">apps/api/src/common/services/email-template/email-template.service.ts</file>
  <file purpose="invoice_delivery_reference">apps/api/src/database/services/invoice-delivery.service.ts</file>
  <file purpose="statement_delivery_reference">apps/api/src/database/services/statement-delivery.service.ts</file>
  <file purpose="email_service">apps/api/src/integrations/email/email.service.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-ENROL-006 ready (PDF service defined)</check>
  <check>TASK-BILL-013 completed (invoice delivery pattern exists)</check>
  <check>EmailTemplateService exists with invoice/statement templates</check>
  <check>Mailgun email service configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Add `WelcomePackEmailData` interface to EmailTemplateService
    - Implement `renderWelcomePackEmail()` method
    - Generate HTML email with responsive design
    - Generate plain text fallback
    - Include enrollment summary in email body
    - Include bank details for payment reference
    - Include quick reference section (hours, contact)
    - Follow existing email template patterns
  </in_scope>
  <out_of_scope>
    - PDF generation (TASK-ENROL-006)
    - Email sending/delivery integration (TASK-ENROL-008)
    - Attachment handling (handled by email service)
    - WhatsApp notification (future task)
  </out_of_scope>
</scope>

<!-- ============================================ -->
<!-- TEMPLATE IMPLEMENTATION                      -->
<!-- ============================================ -->

<template_definition>
## WelcomePackEmailData Interface

```typescript
export interface WelcomePackEmailData {
  // Tenant branding
  tenantName: string;
  supportEmail?: string;
  supportPhone?: string;
  operatingHours?: string;
  physicalAddress?: string;

  // Bank details for payment
  bankName?: string;
  bankAccountHolder?: string;
  bankAccountNumber?: string;
  bankBranchCode?: string;
  bankAccountType?: string;

  // Recipient
  recipientName: string;  // Parent's full name

  // Child details
  childName: string;      // Child's full name
  startDate: Date;        // Enrollment start date
  className?: string;     // Class/group name if applicable

  // Fee information
  monthlyFeeCents: number;
  registrationFeeCents?: number;
  paymentReference: string;  // e.g., "Emma Johnson" or child reference

  // Custom content
  customWelcomeMessage?: string;

  // First day info
  firstDayTime?: string;   // e.g., "08:00"
  whatToBring?: string[];  // Quick list of items
}
```

## Email Subject
```
Welcome to {tenantName} - {childName}'s Enrollment Confirmed
```

## Email Sections

### 1. Header
- Tenant name in large font
- "Welcome to our family" tagline

### 2. Personalized Greeting
```
Dear {recipientName},

We are delighted to welcome {childName} to {tenantName}!
```

### 3. Enrollment Summary Box
- Child's Name: {childName}
- Start Date: {startDate formatted}
- Class: {className} (if applicable)
- Monthly Fee: R{monthlyFee}

### 4. Quick Reference Section
- Operating Hours: {operatingHours}
- Contact: {supportPhone}
- Email: {supportEmail}
- Address: {physicalAddress}

### 5. Payment Information (if bank details available)
- Bank: {bankName}
- Account: {bankAccountNumber}
- Branch: {bankBranchCode}
- Reference: {paymentReference}

### 6. First Day Checklist (bullet points)
- What to bring summary
- Arrival time
- What to expect

### 7. Call to Action
- "View the attached Welcome Pack for complete details"

### 8. Footer
- Contact information
- "If you have any questions, please don't hesitate to contact us"
</template_definition>

<!-- ============================================ -->
<!-- DEFINITION OF DONE                           -->
<!-- ============================================ -->

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/common/services/email-template/email-template.service.ts">
      export interface WelcomePackEmailData {
        tenantName: string;
        supportEmail?: string;
        supportPhone?: string;
        operatingHours?: string;
        physicalAddress?: string;
        bankName?: string;
        bankAccountHolder?: string;
        bankAccountNumber?: string;
        bankBranchCode?: string;
        bankAccountType?: string;
        recipientName: string;
        childName: string;
        startDate: Date;
        className?: string;
        monthlyFeeCents: number;
        registrationFeeCents?: number;
        paymentReference: string;
        customWelcomeMessage?: string;
        firstDayTime?: string;
        whatToBring?: string[];
      }

      renderWelcomePackEmail(data: WelcomePackEmailData): {
        text: string;
        html: string;
        subject: string;
      }
    </signature>
  </signatures>

  <constraints>
    - HTML must be responsive (mobile-friendly)
    - Must follow existing template styling patterns
    - Plain text must be readable and formatted
    - Subject line must include child name
    - Bank details section only shown if bankAccountNumber provided
    - All currency amounts must be formatted in ZAR
    - Dates must use South African format (DD Month YYYY)
    - Must handle missing optional fields gracefully
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - HTML renders correctly in email clients (Gmail, Outlook)
    - Plain text version is readable
    - Bank details appear when provided
    - Bank details hidden when not provided
    - Fee amounts formatted correctly
    - Dates formatted correctly
    - Unit tests pass
  </verification>
</definition_of_done>

<implementation_steps>
## Phase 1: Interface Definition

1. Add `WelcomePackEmailData` interface to `email-template.service.ts`

## Phase 2: Template Implementation

2. Implement `renderWelcomePackEmail()` method:
   - Follow patterns from `renderInvoiceEmail()` and `renderStatementEmail()`
   - Use same HTML structure (header, body sections, footer)
   - Include enrollment summary box
   - Include bank details section (conditional)
   - Include quick reference section

3. Implement `renderWelcomePackText()` private method:
   - Plain text version of all sections

4. Implement `getWelcomePackSubject()` private method:
   - Generate subject line with child name

## Phase 3: Testing

5. Add unit tests for:
   - Full email rendering with all fields
   - Email rendering with minimal fields
   - Email rendering without bank details
   - Currency formatting
   - Date formatting

## Phase 4: Verification

6. Build and verify:
   ```bash
   pnpm run build
   pnpm run lint
   pnpm test -- email-template
   ```
</implementation_steps>

<files_to_modify>
  <file path="apps/api/src/common/services/email-template/email-template.service.ts">Add WelcomePackEmailData interface and renderWelcomePackEmail method</file>
</files_to_modify>

<files_to_create>
  <file path="apps/api/tests/common/services/email-template.service.welcome-pack.spec.ts">Welcome pack email template tests</file>
</files_to_create>

<validation_criteria>
  <criterion>TypeScript compiles without errors</criterion>
  <criterion>HTML email renders child name in subject</criterion>
  <criterion>HTML email includes enrollment summary box</criterion>
  <criterion>HTML email includes bank details when provided</criterion>
  <criterion>HTML email excludes bank section when not provided</criterion>
  <criterion>Currency amounts display as "R X,XXX.XX"</criterion>
  <criterion>Dates display as "1 January 2026" format</criterion>
  <criterion>Plain text version includes all key information</criterion>
  <criterion>Email styling matches invoice/statement emails</criterion>
</validation_criteria>

<test_commands>
  <command>pnpm run build</command>
  <command>pnpm run lint</command>
  <command>pnpm test -- email-template</command>
</test_commands>

<test_scenarios>
## Scenario 1: Full Email Data
- All fields provided including bank details
- Custom welcome message
- What to bring list
- EXPECTED: Complete email with all sections visible

## Scenario 2: Minimal Email Data
- Only required fields
- No bank details
- No custom message
- EXPECTED: Email with default message, no bank section

## Scenario 3: Currency Formatting
- monthlyFeeCents: 250000 (R2,500.00)
- registrationFeeCents: 50000 (R500.00)
- EXPECTED: Amounts formatted as "R 2,500.00" and "R 500.00"

## Scenario 4: Date Formatting
- startDate: 2026-02-01
- EXPECTED: "1 February 2026" in South African format

## Scenario 5: Subject Line
- tenantName: "Little Stars Daycare"
- childName: "Emma Johnson"
- EXPECTED: "Welcome to Little Stars Daycare - Emma Johnson's Enrollment Confirmed"
</test_scenarios>

</task_spec>
