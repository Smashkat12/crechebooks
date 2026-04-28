/**
 * Hardcoded Twilio Content template definitions for v1.
 * TODO: Replace with a dynamic API endpoint once backend exposes GET /admin/messages/templates.
 * Template SIDs must match what is registered in the Twilio Content API for this account.
 */

export interface WhatsAppTemplate {
  contentSid: string;
  name: string;
  friendlyName: string;
  body: string;
  /** Ordered list of placeholder variable names expected by this template */
  variables: string[];
}

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    contentSid: 'HX_registration_welcome',
    name: 'registration_welcome',
    friendlyName: 'Registration Welcome',
    body: 'Welcome to {{1}}! Your child has been registered. You can access the parent portal at {{2}}.',
    variables: ['school_name', 'portal_url'],
  },
  {
    contentSid: 'HX_invoice_reminder',
    name: 'invoice_reminder',
    friendlyName: 'Invoice Reminder',
    body: 'Hi {{1}}, a friendly reminder that invoice {{2}} for {{3}} is due on {{4}}. Please log in to your portal to pay.',
    variables: ['parent_name', 'invoice_number', 'amount', 'due_date'],
  },
  {
    contentSid: 'HX_arrears_notice',
    name: 'arrears_notice',
    friendlyName: 'Arrears Notice',
    body: 'Hi {{1}}, your account has an outstanding balance of {{2}}. Please contact us to make arrangements.',
    variables: ['parent_name', 'amount_owed'],
  },
  {
    contentSid: 'HX_general_message',
    name: 'general_message',
    friendlyName: 'General Message',
    body: 'Hi {{1}}, {{2}}',
    variables: ['parent_name', 'message_body'],
  },
];
