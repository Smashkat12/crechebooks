/**
 * Twilio Content API Types
 * TASK-WA-007: Twilio Content API Integration Service
 *
 * Type definitions for Twilio Content API rich messaging templates.
 * Supports cards, quick replies, call-to-action buttons, list pickers, and carousels.
 *
 * @see https://www.twilio.com/docs/content-api/content-types-overview
 */

/**
 * Supported Twilio content types for WhatsApp
 */
export type TwilioContentType =
  | 'twilio/text'
  | 'twilio/media'
  | 'twilio/quick-reply'
  | 'twilio/call-to-action'
  | 'twilio/card'
  | 'twilio/list-picker'
  | 'twilio/carousel';

/**
 * WhatsApp template categories for approval
 */
export type ContentTemplateCategory =
  | 'UTILITY'
  | 'MARKETING'
  | 'AUTHENTICATION';

/**
 * Template approval status
 */
export type ContentApprovalStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'in_appeal'
  | 'pending_deletion'
  | 'deleted'
  | 'disabled'
  | 'paused';

/**
 * Content template definition for creating templates
 */
export interface ContentTemplateDefinition {
  /** Unique friendly name for the template */
  friendlyName: string;
  /** Language code (e.g., 'en', 'af', 'zu') */
  language: string;
  /** Category for WhatsApp approval */
  category: ContentTemplateCategory;
  /** Variable definitions with descriptions */
  variables: Record<string, string>;
  /** Content type definitions */
  types: Record<string, unknown>;
}

/**
 * Quick reply action button
 * Max 10 buttons for approved templates, 3 for session messages
 */
export interface QuickReplyAction {
  type: 'QUICK_REPLY';
  /** Button text - Max 20 characters */
  title: string;
  /** Unique identifier for the button - Max 200 characters */
  id: string;
}

/**
 * URL action button for call-to-action
 * Max 2 URL buttons per template
 */
export interface UrlAction {
  type: 'URL';
  /** Button text - Max 25 characters */
  title: string;
  /** HTTPS URL, can include {{variables}} */
  url: string;
}

/**
 * Phone action button for call-to-action
 * Max 1 phone button per template
 */
export interface PhoneAction {
  type: 'PHONE_NUMBER';
  /** Button text - Max 20 characters */
  title: string;
  /** Phone number in E.164 format (e.g., +27600188230) */
  phone: string;
}

/**
 * Union type for all action types
 */
export type ContentAction = QuickReplyAction | UrlAction | PhoneAction;

/**
 * Card content for rich media messages
 */
export interface CardContent {
  /** Card title - Max 1024 characters */
  title?: string;
  /** Card subtitle - Max 60 characters */
  subtitle?: string;
  /** Card body text - Max 1600 characters */
  body?: string;
  /** Media URLs (images or documents) */
  media?: string[];
  /** Action buttons */
  actions?: ContentAction[];
}

/**
 * Text content type
 */
export interface TextContent {
  body: string;
}

/**
 * Media content type
 */
export interface MediaContent {
  media: string[];
  body?: string;
}

/**
 * Quick reply content type
 * Session messages: max 3 buttons
 * Approved templates: max 10 buttons
 */
export interface QuickReplyContent {
  /** Message body text */
  body: string;
  /** Quick reply buttons */
  actions: QuickReplyAction[];
}

/**
 * Call-to-action content type
 * Max 2 buttons total (1 URL + 1 Phone, or 2 URLs)
 */
export interface CallToActionContent {
  /** Message body text */
  body: string;
  /** Action buttons */
  actions: (UrlAction | PhoneAction)[];
}

/**
 * List picker content type (session only - cannot be approved)
 * Max 10 items
 */
export interface ListPickerContent {
  /** Message body text */
  body: string;
  /** Button text to open list - Max 20 characters */
  button: string;
  /** List items - Max 10 */
  items: ListPickerItem[];
}

/**
 * List picker item
 */
export interface ListPickerItem {
  /** Item title - Max 24 characters */
  item: string;
  /** Unique identifier - Max 200 characters */
  id: string;
  /** Item description - Max 72 characters */
  description?: string;
}

/**
 * Carousel content type
 * Min 2, Max 10 cards
 */
export interface CarouselContent {
  /** Array of card contents */
  cards: CardContent[];
}

/**
 * Cached content template from Twilio
 */
export interface ContentTemplate {
  /** Twilio content SID */
  sid: string;
  /** Human-readable template name */
  friendlyName: string;
  /** Language code */
  language: string;
  /** Variable definitions */
  variables: Record<string, string>;
  /** Content type configuration */
  types: Record<string, unknown>;
  /** Approval status for WhatsApp */
  approvalStatus?: ContentApprovalStatus;
  /** Rejection reason if rejected */
  rejectionReason?: string;
}

/**
 * Content variable for sending messages
 */
export interface ContentVariable {
  /** Variable key (positional: '1', '2', etc.) */
  key: string;
  /** Variable value */
  value: string;
}

/**
 * Options for sending content messages
 */
export interface SendContentMessageOptions {
  /** Recipient phone number in E.164 format */
  to: string;
  /** Twilio content SID */
  contentSid: string;
  /** Variable values */
  variables: ContentVariable[];
  /** Tenant ID for audit trail */
  tenantId?: string;
  /** Context type for message history */
  contextType?: string;
  /** Context ID (e.g., invoice number) */
  contextId?: string;
  /** Media URLs to attach */
  mediaUrls?: string[];
}

/**
 * Result of sending a content message
 */
export interface ContentMessageResult {
  success: boolean;
  /** Twilio message SID if successful */
  messageSid?: string;
  /** Error message if failed */
  error?: string;
  /** Error code if failed */
  errorCode?: string;
}

/**
 * Template registration result
 */
export interface TemplateRegistrationResult {
  success: boolean;
  /** Twilio content SID if successful */
  contentSid?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Template approval submission result
 */
export interface ApprovalSubmissionResult {
  success: boolean;
  /** Current approval status */
  status?: ContentApprovalStatus;
  /** Error message if failed */
  error?: string;
}

/**
 * Character limits for content types
 */
export const CONTENT_LIMITS = {
  /** Quick reply button title */
  QUICK_REPLY_TITLE: 20,
  /** Quick reply button ID */
  QUICK_REPLY_ID: 200,
  /** Max quick reply buttons for session messages */
  SESSION_QUICK_REPLY_BUTTONS: 3,
  /** Max quick reply buttons for approved templates */
  APPROVED_QUICK_REPLY_BUTTONS: 10,
  /** URL button title */
  URL_BUTTON_TITLE: 25,
  /** Phone button title */
  PHONE_BUTTON_TITLE: 20,
  /** Max URL buttons */
  MAX_URL_BUTTONS: 2,
  /** Max phone buttons */
  MAX_PHONE_BUTTONS: 1,
  /** Card title */
  CARD_TITLE: 1024,
  /** Card subtitle */
  CARD_SUBTITLE: 60,
  /** Card body */
  CARD_BODY: 1600,
  /** Max card buttons */
  MAX_CARD_BUTTONS: 10,
  /** List picker button */
  LIST_PICKER_BUTTON: 20,
  /** Max list picker items */
  MAX_LIST_ITEMS: 10,
  /** List item title */
  LIST_ITEM_TITLE: 24,
  /** List item ID */
  LIST_ITEM_ID: 200,
  /** List item description */
  LIST_ITEM_DESCRIPTION: 72,
  /** Template body text */
  TEMPLATE_BODY: 1024,
  /** Min carousel cards */
  MIN_CAROUSEL_CARDS: 2,
  /** Max carousel cards */
  MAX_CAROUSEL_CARDS: 10,
} as const;
