/**
 * Webhook Types
 * TASK-BILL-035: Delivery Status Webhook Handlers
 *
 * Types for email and WhatsApp delivery webhooks.
 */

/**
 * Delivery status for invoice delivery tracking.
 * Synced with Prisma DeliveryStatus enum.
 */
export type DeliveryStatus =
  | 'PENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'OPENED'
  | 'CLICKED'
  | 'BOUNCED'
  | 'COMPLAINED'
  | 'FAILED';

/**
 * SendGrid email event types
 * @see https://docs.sendgrid.com/for-developers/tracking-events/event
 */
export type EmailEventType =
  | 'processed'
  | 'dropped'
  | 'delivered'
  | 'deferred'
  | 'bounce'
  | 'open'
  | 'click'
  | 'spam_report'
  | 'unsubscribe';

/**
 * SendGrid email event structure
 */
export interface EmailEvent {
  /** Event type */
  event: EmailEventType;
  /** Unix timestamp of event */
  timestamp: number;
  /** SendGrid message ID (sg_message_id) */
  sg_message_id: string;
  /** Recipient email address */
  email: string;
  /** Invoice ID stored in custom arguments */
  invoiceId?: string;
  /** Tenant ID stored in custom arguments */
  tenantId?: string;
  /** Bounce type (for bounce events) */
  type?: string;
  /** Bounce reason (for bounce events) */
  reason?: string;
  /** Clicked URL (for click events) */
  url?: string;
  /** User agent (for open/click events) */
  useragent?: string;
  /** IP address (for open/click events) */
  ip?: string;
}

/**
 * SendGrid webhook payload (array of events)
 */
export interface EmailWebhookPayload {
  events: EmailEvent[];
}

/**
 * WhatsApp message status
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 */
export type WhatsAppStatusType = 'sent' | 'delivered' | 'read' | 'failed';

/**
 * WhatsApp status update structure
 */
export interface WhatsAppStatus {
  /** WhatsApp message ID */
  id: string;
  /** Status of the message */
  status: WhatsAppStatusType;
  /** Unix timestamp as string */
  timestamp: string;
  /** Recipient's phone number */
  recipient_id: string;
  /** Conversation details (optional) */
  conversation?: {
    id: string;
    origin: {
      type: string;
    };
  };
  /** Pricing details (optional) */
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
  /** Error details (for failed status) */
  errors?: Array<{
    code: number;
    title: string;
    message?: string;
    error_data?: {
      details: string;
    };
  }>;
}

/**
 * WhatsApp webhook entry value
 */
export interface WhatsAppWebhookValue {
  messaging_product: 'whatsapp';
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  statuses?: WhatsAppStatus[];
  messages?: Array<{
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body: string };
  }>;
}

/**
 * WhatsApp webhook change structure
 */
export interface WhatsAppWebhookChange {
  field: 'messages';
  value: WhatsAppWebhookValue;
}

/**
 * WhatsApp webhook entry
 */
export interface WhatsAppWebhookEntry {
  id: string;
  changes: WhatsAppWebhookChange[];
}

/**
 * WhatsApp webhook payload (Meta format)
 */
export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: WhatsAppWebhookEntry[];
}

/**
 * Simplified WhatsApp event for processing
 */
export interface WhatsAppEvent {
  statuses: Array<{
    id: string;
    status: WhatsAppStatusType;
    timestamp: string;
    recipient_id: string;
    error?: {
      code: number;
      title: string;
      message?: string;
    };
  }>;
}

/**
 * Webhook processing result
 */
export interface WebhookProcessingResult {
  processed: number;
  skipped: number;
  errors: Array<{
    eventId: string;
    error: string;
  }>;
}

/**
 * Raw webhook event for storage/debugging
 */
export interface RawWebhookEvent {
  id: string;
  tenantId: string;
  channel: 'email' | 'whatsapp';
  payload: Record<string, unknown>;
  receivedAt: Date;
  processed: boolean;
  processedAt?: Date;
  error?: string;
}

/**
 * Map email event types to delivery status
 */
export function mapEmailEventToStatus(
  event: EmailEventType,
): DeliveryStatus | null {
  switch (event) {
    case 'delivered':
      return 'DELIVERED';
    case 'open':
      return 'OPENED';
    case 'click':
      return 'CLICKED';
    case 'bounce':
    case 'dropped':
      return 'BOUNCED';
    case 'spam_report':
      return 'COMPLAINED';
    case 'processed':
    case 'deferred':
    case 'unsubscribe':
      // These don't change delivery status
      return null;
    default:
      return null;
  }
}

/**
 * Map WhatsApp status to delivery status
 */
export function mapWhatsAppStatusToDeliveryStatus(
  status: WhatsAppStatusType,
): DeliveryStatus | null {
  switch (status) {
    case 'sent':
      return 'SENT';
    case 'delivered':
      return 'DELIVERED';
    case 'read':
      return 'OPENED';
    case 'failed':
      return 'FAILED';
    default:
      return null;
  }
}

/**
 * Status progression order for idempotent processing
 * Higher index = more advanced status
 */
export const STATUS_PROGRESSION: DeliveryStatus[] = [
  'PENDING',
  'SENT',
  'DELIVERED',
  'OPENED',
  'CLICKED',
  // Terminal states (can override any)
  'BOUNCED',
  'COMPLAINED',
  'FAILED',
];

/**
 * Check if a new status should override the current status
 * Follows a progression: PENDING < SENT < DELIVERED < OPENED < CLICKED
 * Terminal states (BOUNCED, COMPLAINED, FAILED) always override non-terminal
 */
export function shouldUpdateStatus(
  currentStatus: DeliveryStatus,
  newStatus: DeliveryStatus,
): boolean {
  // Terminal states (negative outcomes) always take precedence
  const terminalStates: DeliveryStatus[] = ['BOUNCED', 'COMPLAINED', 'FAILED'];

  if (terminalStates.includes(newStatus)) {
    // Don't override if already in a terminal state
    return !terminalStates.includes(currentStatus);
  }

  // For progression states, only update if new status is more advanced
  const currentIndex = STATUS_PROGRESSION.indexOf(currentStatus);
  const newIndex = STATUS_PROGRESSION.indexOf(newStatus);

  // If current is terminal, don't allow progression overrides
  if (terminalStates.includes(currentStatus)) {
    return false;
  }

  return newIndex > currentIndex;
}
