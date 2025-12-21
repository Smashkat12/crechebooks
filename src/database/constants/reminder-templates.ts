/**
 * Reminder Templates
 * TASK-PAY-014: Automated Reminder System
 *
 * @module database/constants/reminder-templates
 * @description Email and WhatsApp templates for payment reminders
 * with escalation levels. Uses South African English and creche-appropriate tone.
 *
 * Template Placeholders:
 * - {parentName}: Parent's full name
 * - {childName}: Child's name
 * - {invoiceNumber}: Invoice reference number
 * - {amount}: Outstanding amount (formatted)
 * - {dueDate}: Invoice due date (formatted)
 * - {daysOverdue}: Number of days overdue
 * - {crecheName}: Creche trading name
 * - {crechePhone}: Creche contact phone
 * - {crecheEmail}: Creche contact email
 * - {bankName}: Bank name for payments
 * - {accountNumber}: Bank account number
 * - {branchCode}: Bank branch code
 */

import { EscalationLevel } from '../dto/reminder.dto';

/**
 * Email templates for each escalation level
 */
export const REMINDER_TEMPLATES: Record<
  EscalationLevel,
  { subject: string; body: string }
> = {
  [EscalationLevel.FRIENDLY]: {
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

  [EscalationLevel.FIRM]: {
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

  [EscalationLevel.FINAL]: {
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
};

/**
 * WhatsApp templates - shorter, mobile-friendly versions
 */
export const REMINDER_TEMPLATES_WHATSAPP: Record<
  EscalationLevel,
  { subject: string; body: string }
> = {
  [EscalationLevel.FRIENDLY]: {
    subject: 'Friendly Reminder: {childName} Fees',
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

  [EscalationLevel.FIRM]: {
    subject: 'IMPORTANT: Overdue Payment',
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

  [EscalationLevel.FINAL]: {
    subject: 'URGENT: FINAL NOTICE',
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
};
