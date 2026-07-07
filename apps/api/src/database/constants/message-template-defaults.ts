/**
 * Message Template Defaults
 * TASK-TMPL-001: Tenant-Editable Message Templates
 *
 * @module database/constants/message-template-defaults
 * @description Coded defaults for every MessageTemplate key/channel that the
 * MessageTemplateResolverService falls back to when a tenant has not saved an
 * override. The strings here are the same content the individual sender
 * services previously hard-coded — extracted verbatim so that behaviour is
 * unchanged for tenants who never edit their templates.
 *
 * Placeholder syntax is intentionally kept per-key rather than unified:
 *
 * ARREARS_REMINDER_* — {parentName}, {childName}, {invoiceNumber}, {amount},
 *   {dueDate}, {daysOverdue}, {crecheName}, {crechePhone}, {crecheEmail},
 *   {bankName}, {accountNumber}, {branchCode}
 *   (Single-brace {name} — matches ReminderService.renderTemplate.)
 *
 * INVOICE_DELIVERY — {invoiceNumber}, {tenantName}
 *   (Subject only. Body remains code-controlled HTML via EmailTemplateService.)
 *
 * WELCOME_PACK — {tenantName}, {childName}
 *   (Subject only. Body remains code-controlled HTML.)
 *
 * STATEMENT_DELIVERY — {tenantName}
 *   (Subject only. Body remains code-controlled HTML.)
 *
 * INVOICE_SCHEDULER_ADMIN_SUMMARY — {tenantName}, {periodLabel},
 *   {totalEnrollments}, {successCount}, {errorCount}, {skippedCount},
 *   {durationSeconds}, {errorLines}
 */

export type MessageTemplateKeyLiteral =
  | 'ARREARS_REMINDER_FRIENDLY'
  | 'ARREARS_REMINDER_FIRM'
  | 'ARREARS_REMINDER_FINAL'
  | 'INVOICE_DELIVERY'
  | 'WELCOME_PACK'
  | 'STATEMENT_DELIVERY'
  | 'INVOICE_SCHEDULER_ADMIN_SUMMARY';

export type MessageTemplateChannelLiteral = 'EMAIL' | 'WHATSAPP' | 'SMS';

/**
 * One coded default template. `subject` is `null` for channels that don't
 * carry a subject line (WhatsApp, SMS).
 */
export interface DefaultMessageTemplate {
  key: MessageTemplateKeyLiteral;
  channel: MessageTemplateChannelLiteral;
  subject: string | null;
  body: string;
  /** Human-readable placeholder tokens the template understands. */
  placeholders: string[];
  /** UI-friendly label for the settings/templates page. */
  label: string;
}

/** Placeholders supported by every ARREARS_REMINDER_* template. */
const REMINDER_PLACEHOLDERS = [
  '{parentName}',
  '{childName}',
  '{invoiceNumber}',
  '{amount}',
  '{dueDate}',
  '{daysOverdue}',
  '{crecheName}',
  '{crechePhone}',
  '{crecheEmail}',
  '{bankName}',
  '{accountNumber}',
  '{branchCode}',
];

export const DEFAULT_MESSAGE_TEMPLATES: DefaultMessageTemplate[] = [
  // ---------------------------------------------------------------
  // ARREARS_REMINDER_FRIENDLY
  // Extracted from apps/api/src/database/constants/reminder-templates.ts
  // ---------------------------------------------------------------
  {
    key: 'ARREARS_REMINDER_FRIENDLY',
    channel: 'EMAIL',
    label: 'Friendly Reminder - Email',
    placeholders: REMINDER_PLACEHOLDERS,
    subject: 'Friendly Reminder: Invoice {invoiceNumber} for {childName}',
    body: `Dear {parentName},

We hope this message finds you well.

This is a friendly reminder that payment for {childName}'s fees is now overdue. We understand that things can sometimes slip our minds, so we wanted to send you a gentle reminder.

Invoice Details:
• Invoice Number: {invoiceNumber}
• Amount Outstanding: {amount}
• Original Due Date: {dueDate}
• Days Overdue: {daysOverdue}

Payment Details:
Bank: {bankName}
Account Number: {accountNumber}
Branch Code: {branchCode}
Reference: {invoiceNumber}

If you have already made this payment, please accept our apologies and kindly send us proof of payment so we can update our records.

Should you have any questions or need to discuss payment arrangements, please don't hesitate to contact us.

Kind regards,
{crecheName}
Phone: {crechePhone}
Email: {crecheEmail}`,
  },
  {
    key: 'ARREARS_REMINDER_FRIENDLY',
    channel: 'WHATSAPP',
    label: 'Friendly Reminder - WhatsApp',
    placeholders: REMINDER_PLACEHOLDERS,
    subject: null,
    body: `Hi {parentName},

Just a friendly reminder that {childName}'s fees are now overdue.

Invoice: {invoiceNumber}
Amount: {amount}
Due date: {dueDate}
Days overdue: {daysOverdue}

Banking Details:
{bankName}
Acc: {accountNumber}
Branch: {branchCode}
Ref: {invoiceNumber}

Already paid? Please send proof of payment.

Any queries? Call us on {crechePhone}

Kind regards,
{crecheName}`,
  },
  // ---------------------------------------------------------------
  // ARREARS_REMINDER_FIRM
  // ---------------------------------------------------------------
  {
    key: 'ARREARS_REMINDER_FIRM',
    channel: 'EMAIL',
    label: 'Firm Reminder - Email',
    placeholders: REMINDER_PLACEHOLDERS,
    subject: 'Important: Overdue Payment for Invoice {invoiceNumber}',
    body: `Dear {parentName},

We are writing to follow up on the outstanding payment for {childName}'s fees.

Despite our previous reminder, payment for the invoice below remains outstanding:

Invoice Details:
• Invoice Number: {invoiceNumber}
• Amount Outstanding: {amount}
• Original Due Date: {dueDate}
• Days Overdue: {daysOverdue}

We kindly request that this payment be settled within the next 7 days to avoid any disruption to {childName}'s placement.

Payment Details:
Bank: {bankName}
Account Number: {accountNumber}
Branch Code: {branchCode}
Reference: {invoiceNumber}

If you are experiencing financial difficulties or need to arrange a payment plan, please contact us immediately so we can assist you. We are committed to working with families to find suitable solutions.

If payment has already been made, please send us proof of payment as soon as possible.

We appreciate your prompt attention to this matter.

Regards,
{crecheName}
Phone: {crechePhone}
Email: {crecheEmail}`,
  },
  {
    key: 'ARREARS_REMINDER_FIRM',
    channel: 'WHATSAPP',
    label: 'Firm Reminder - WhatsApp',
    placeholders: REMINDER_PLACEHOLDERS,
    subject: null,
    body: `Dear {parentName},

IMPORTANT: {childName}'s fees remain overdue despite our previous reminder.

Invoice: {invoiceNumber}
Amount: {amount}
Days overdue: {daysOverdue}

Please settle within 7 days to avoid disruption to {childName}'s placement.

Banking Details:
{bankName}
Acc: {accountNumber}
Branch: {branchCode}
Ref: {invoiceNumber}

Need a payment plan? Contact us urgently.

Already paid? Send proof of payment ASAP.

{crecheName}
{crechePhone}`,
  },
  // ---------------------------------------------------------------
  // ARREARS_REMINDER_FINAL
  // ---------------------------------------------------------------
  {
    key: 'ARREARS_REMINDER_FINAL',
    channel: 'EMAIL',
    label: 'Final Notice - Email',
    placeholders: REMINDER_PLACEHOLDERS,
    subject:
      'URGENT: Final Notice - Invoice {invoiceNumber} Significantly Overdue',
    body: `Dear {parentName},

FINAL NOTICE: Outstanding Payment

This is our final reminder regarding the seriously overdue payment for {childName}'s fees.

Invoice Details:
• Invoice Number: {invoiceNumber}
• Amount Outstanding: {amount}
• Original Due Date: {dueDate}
• Days Overdue: {daysOverdue}

Despite previous reminders, this invoice remains unpaid. We must receive payment or hear from you within the next 48 hours to avoid the following consequences:

1. Suspension of {childName}'s placement at our facility
2. Referral of the outstanding amount to a debt collection agency
3. Potential legal action to recover the debt

Payment Details:
Bank: {bankName}
Account Number: {accountNumber}
Branch Code: {branchCode}
Reference: {invoiceNumber}

URGENT ACTION REQUIRED: If you cannot make full payment immediately, please contact us TODAY to arrange a payment plan. We genuinely want to avoid taking further action, but we cannot continue providing services without payment.

If payment has been made, please send proof of payment immediately to prevent suspension.

This is a serious matter that requires your immediate attention.

{crecheName}
Phone: {crechePhone}
Email: {crecheEmail}`,
  },
  {
    key: 'ARREARS_REMINDER_FINAL',
    channel: 'WHATSAPP',
    label: 'Final Notice - WhatsApp',
    placeholders: REMINDER_PLACEHOLDERS,
    subject: null,
    body: `{parentName} - FINAL NOTICE

Invoice {invoiceNumber} is SERIOUSLY OVERDUE ({daysOverdue} days)

Amount: {amount}

Payment or contact required within 48 HOURS to avoid:
• Suspension of {childName}'s placement
• Debt collection referral
• Legal action

Banking Details:
{bankName}
Acc: {accountNumber}
Branch: {branchCode}
Ref: {invoiceNumber}

URGENT: Contact us TODAY if you cannot pay in full.

Already paid? Send proof NOW to prevent suspension.

{crecheName}
{crechePhone}
{crecheEmail}`,
  },
  // ---------------------------------------------------------------
  // INVOICE_DELIVERY (subject only — HTML body is code-controlled)
  // Matches EmailTemplateService.generateSubject for INVOICE_EMAIL.
  // ---------------------------------------------------------------
  {
    key: 'INVOICE_DELIVERY',
    channel: 'EMAIL',
    label: 'Invoice Email - Subject',
    placeholders: ['{invoiceNumber}', '{tenantName}'],
    subject: 'Invoice {invoiceNumber} from {tenantName}',
    body: 'Please see the attached invoice.',
  },
  // ---------------------------------------------------------------
  // WELCOME_PACK (subject only)
  // Matches EmailTemplateService.generateSubject for WELCOME_PACK_EMAIL.
  // ---------------------------------------------------------------
  {
    key: 'WELCOME_PACK',
    channel: 'EMAIL',
    label: 'Welcome Pack Email - Subject',
    placeholders: ['{tenantName}', '{childName}'],
    subject: "Welcome to {tenantName} - {childName}'s Enrollment",
    body: 'Please see the attached welcome pack.',
  },
  // ---------------------------------------------------------------
  // STATEMENT_DELIVERY (subject only)
  // Matches EmailTemplateService.generateSubject for STATEMENT_EMAIL.
  // ---------------------------------------------------------------
  {
    key: 'STATEMENT_DELIVERY',
    channel: 'EMAIL',
    label: 'Statement Email - Subject',
    placeholders: ['{tenantName}'],
    subject: 'Account Statement from {tenantName}',
    body: 'Please see the attached statement.',
  },
  // ---------------------------------------------------------------
  // INVOICE_SCHEDULER_ADMIN_SUMMARY (subject + body, both plain text)
  // Matches invoice-scheduler.processor.ts admin notification body.
  // ---------------------------------------------------------------
  {
    key: 'INVOICE_SCHEDULER_ADMIN_SUMMARY',
    channel: 'EMAIL',
    label: 'Invoice Generation - Admin Summary',
    placeholders: [
      '{tenantName}',
      '{periodLabel}',
      '{totalEnrollments}',
      '{successCount}',
      '{errorCount}',
      '{skippedCount}',
      '{durationSeconds}',
      '{errorLines}',
    ],
    subject: 'Invoice Generation Summary - {periodLabel}',
    body: `Invoice generation for {periodLabel} completed.

Summary:
- Total enrollments processed: {totalEnrollments}
- Successful: {successCount}
- Errors: {errorCount}
- Skipped: {skippedCount}
- Duration: {durationSeconds}s

{errorLines}
---
This is an automated notification.`,
  },
];

/**
 * Lookup a default template for a specific key/channel.
 * Returns `null` when no default is defined (e.g., asking for the WHATSAPP
 * variant of INVOICE_DELIVERY).
 */
export function findDefaultTemplate(
  key: MessageTemplateKeyLiteral,
  channel: MessageTemplateChannelLiteral,
): DefaultMessageTemplate | null {
  return (
    DEFAULT_MESSAGE_TEMPLATES.find(
      (t) => t.key === key && t.channel === channel,
    ) ?? null
  );
}

/**
 * All (key, channel) pairs that have coded defaults. The API uses this to
 * fall through defaults when a tenant hasn't customized every template.
 */
export function listDefaultTemplateKeys(): Array<{
  key: MessageTemplateKeyLiteral;
  channel: MessageTemplateChannelLiteral;
}> {
  return DEFAULT_MESSAGE_TEMPLATES.map((t) => ({
    key: t.key,
    channel: t.channel,
  }));
}
