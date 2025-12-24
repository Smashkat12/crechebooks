/**
 * WhatsApp Business API Types
 * TASK-BILL-015: WhatsApp Business API Integration
 *
 * Types for Meta Cloud API WhatsApp Business integration.
 */

/**
 * Result of sending a WhatsApp message
 */
export interface WhatsAppMessageResult {
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  sentAt: Date;
  recipientPhone: string;
}

/**
 * WhatsApp webhook payload structure (Meta Cloud API)
 */
export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        statuses?: Array<{
          id: string;
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string;
          recipient_id: string;
          errors?: Array<{
            code: number;
            title: string;
            message?: string;
          }>;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
        }>;
      };
      field: string;
    }>;
  }>;
}

/**
 * Template parameter values for WhatsApp templates
 */
export interface TemplateParams {
  [key: string]: string;
}

/**
 * WhatsApp template component
 */
export interface TemplateComponent {
  type: 'header' | 'body' | 'button';
  parameters?: Array<{
    type: 'text' | 'document' | 'image';
    text?: string;
    document?: {
      link: string;
      filename: string;
    };
    image?: {
      link: string;
    };
  }>;
  sub_type?: 'url' | 'quick_reply';
  index?: string;
}

/**
 * WhatsApp message request body
 */
export interface WhatsAppSendRequest {
  messaging_product: 'whatsapp';
  recipient_type: 'individual';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components?: TemplateComponent[];
  };
}

/**
 * WhatsApp API response
 */
export interface WhatsAppApiResponse {
  messaging_product: 'whatsapp';
  contacts: Array<{
    input: string;
    wa_id: string;
  }>;
  messages: Array<{
    id: string;
  }>;
}

/**
 * WhatsApp API error response
 */
export interface WhatsAppApiError {
  error: {
    message: string;
    type: string;
    code: number;
    fbtrace_id: string;
  };
}

/**
 * Consent/opt-in record
 */
export interface WhatsAppConsent {
  phoneNumber: string;
  optedIn: boolean;
  optedInAt?: Date;
  optedOutAt?: Date;
  consentSource: 'registration' | 'preference_update' | 'message_reply';
}

/**
 * Message delivery status record
 */
export interface WhatsAppDeliveryStatus {
  messageId: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  updatedAt: Date;
  errorCode?: number;
  errorMessage?: string;
}

/**
 * Pre-approved template names for CrecheBooks
 */
export type WhatsAppTemplateName =
  | 'invoice_notification'
  | 'invoice_reminder'
  | 'payment_received'
  | 'arrears_notice'
  | 'registration_welcome';

/**
 * WhatsApp configuration
 */
export interface WhatsAppConfig {
  apiUrl: string;
  accessToken: string;
  phoneNumberId: string;
  businessAccountId: string;
  webhookVerifyToken: string;
}
