/**
 * Communication Types
 * TASK-COMM-001: Ad-hoc Communication Database Schema
 *
 * Type definitions for broadcast messaging, recipient targeting,
 * and delivery status tracking across multiple channels.
 */

/**
 * Recipient type for broadcast messages
 * - PARENT: Target parents (linked to children enrollments)
 * - STAFF: Target staff members
 * - CUSTOM: Custom selection of individuals
 */
export enum RecipientType {
  PARENT = 'parent',
  STAFF = 'staff',
  CUSTOM = 'custom',
}

/**
 * Communication channels for message delivery
 * - EMAIL: Send via email (Mailgun)
 * - WHATSAPP: Send via WhatsApp Business API
 * - SMS: Send via SMS (Africa's Talking)
 * - ALL: Send via all available channels per recipient preference
 */
export enum CommunicationChannel {
  EMAIL = 'email',
  WHATSAPP = 'whatsapp',
  SMS = 'sms',
  ALL = 'all',
}

/**
 * Broadcast message status
 * - DRAFT: Message created but not sent
 * - SCHEDULED: Message scheduled for future delivery
 * - SENDING: Message is being sent to recipients
 * - SENT: All messages have been sent
 * - PARTIALLY_SENT: Some messages sent, some failed
 * - FAILED: All messages failed to send
 * - CANCELLED: Message was cancelled before sending
 */
export enum BroadcastStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  SENDING = 'sending',
  SENT = 'sent',
  PARTIALLY_SENT = 'partially_sent',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

/**
 * Delivery status for individual message recipients
 * - PENDING: Message not yet sent
 * - SENT: Message sent to provider
 * - DELIVERED: Message delivered to recipient
 * - OPENED: Email was opened (email only)
 * - READ: Message was read (WhatsApp only)
 * - FAILED: Delivery failed
 * - BOUNCED: Email bounced (email only)
 */
export enum DeliveryStatus {
  PENDING = 'pending',
  SENT = 'sent',
  DELIVERED = 'delivered',
  OPENED = 'opened',
  READ = 'read',
  FAILED = 'failed',
  BOUNCED = 'bounced',
}

/**
 * Filter criteria for targeting parents
 * Used when recipientType is PARENT
 */
export interface ParentFilter {
  /** Filter by active/inactive status */
  isActive?: boolean;
  /** Filter by enrollment status (ACTIVE, PENDING, WITHDRAWN, GRADUATED) */
  enrollmentStatus?: string[];
  /** Filter by specific fee structure */
  feeStructureId?: string;
  /** Filter parents with outstanding balance > 0 */
  hasOutstandingBalance?: boolean;
  /** Filter parents with invoices overdue by N days */
  daysOverdue?: number;
  /** Filter by WhatsApp opt-in status (for WhatsApp channel) */
  whatsappOptIn?: boolean;
  /** Filter by SMS opt-in status (for SMS channel) */
  smsOptIn?: boolean;
}

/**
 * Filter criteria for targeting staff
 * Used when recipientType is STAFF
 */
export interface StaffFilter {
  /** Filter by active/inactive status */
  isActive?: boolean;
  /** Filter by employment type (PERMANENT, CONTRACT, CASUAL) */
  employmentType?: string[];
  /** Filter by department */
  department?: string;
  /** Filter by position/role */
  position?: string;
}

/**
 * Combined filter criteria for recipient selection
 * Only one of parentFilter, staffFilter, or selectedIds should be used
 */
export interface RecipientFilterCriteria {
  /** Filter criteria for parent recipients */
  parentFilter?: ParentFilter;
  /** Filter criteria for staff recipients */
  staffFilter?: StaffFilter;
  /** Explicit list of recipient IDs for custom selection */
  selectedIds?: string[];
}

/**
 * Resolved recipient with contact details
 * Used when preparing broadcast for sending
 */
export interface ResolvedRecipient {
  /** Unique identifier (parent or staff ID) */
  id: string;
  /** Display name */
  name: string;
  /** Email address (if available) */
  email?: string;
  /** Phone number for SMS/WhatsApp (if available) */
  phone?: string;
  /** Preferred contact method */
  preferredContact?: string;
}

/**
 * Delivery statistics summary for a broadcast
 */
export interface DeliveryStats {
  /** Total number of recipients */
  total: number;
  /** Number of email messages sent */
  emailSent: number;
  /** Number of email messages delivered */
  emailDelivered: number;
  /** Number of email messages opened */
  emailOpened: number;
  /** Number of email messages failed */
  emailFailed: number;
  /** Number of WhatsApp messages sent */
  whatsappSent: number;
  /** Number of WhatsApp messages delivered */
  whatsappDelivered: number;
  /** Number of WhatsApp messages read */
  whatsappRead: number;
  /** Number of WhatsApp messages failed */
  whatsappFailed: number;
  /** Number of SMS messages sent */
  smsSent: number;
  /** Number of SMS messages delivered */
  smsDelivered: number;
  /** Number of SMS messages failed */
  smsFailed: number;
}

/**
 * Broadcast message creation data
 */
export interface CreateBroadcastData {
  tenantId?: string;
  subject?: string;
  body: string;
  htmlBody?: string;
  recipientType: RecipientType;
  recipientFilter?: RecipientFilterCriteria;
  recipientGroupId?: string;
  channel: CommunicationChannel;
  scheduledAt?: Date;
}

/**
 * Message recipient creation data
 */
export interface CreateMessageRecipientData {
  broadcastId: string;
  recipientId: string;
  recipientType: RecipientType;
  recipientName: string;
  recipientEmail?: string;
  recipientPhone?: string;
}

/**
 * Recipient group creation data
 */
export interface CreateRecipientGroupData {
  tenantId?: string;
  name: string;
  description?: string;
  recipientType: RecipientType;
  filterCriteria: RecipientFilterCriteria;
  isSystem?: boolean;
}
