/**
 * SMS Gateway Interface
 * TASK-NOTIF-001: SMS Channel Adapter Implementation
 *
 * Defines the contract for SMS gateway providers.
 * Enables swappable SMS providers (Africa's Talking, Twilio, etc.)
 */

export interface ISmsGateway {
  /**
   * Send SMS message
   * @param to - Phone number in E.164 format (+27...)
   * @param message - SMS content
   * @param options - Optional sender configuration
   * @returns Result with message ID and delivery status
   */
  send(
    to: string,
    message: string,
    options?: SmsGatewayOptions,
  ): Promise<SmsGatewayResult>;

  /**
   * Check if gateway is properly configured
   * @returns true if API credentials are valid
   */
  isConfigured(): boolean;
}

export interface SmsGatewayOptions {
  /** Sender ID (alphanumeric, max 11 chars) */
  senderId?: string;
  /** Priority level for delivery */
  priority?: 'normal' | 'high';
}

export interface SmsGatewayResult {
  /** Unique message identifier from gateway */
  messageId: string;
  /** Delivery status */
  status: SmsDeliveryStatus;
  /** Error code if failed */
  errorCode?: string;
  /** Human-readable error message */
  errorMessage?: string;
  /** Cost in credits/cents (if provided by gateway) */
  cost?: number;
}

export type SmsDeliveryStatus =
  | 'queued'
  | 'sent'
  | 'delivered'
  | 'failed'
  | 'rejected';

/**
 * SMS Gateway injection token
 */
export const SMS_GATEWAY_TOKEN = 'ISmsGateway';
