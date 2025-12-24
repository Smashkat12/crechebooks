/**
 * INotificationChannel Interface
 * TASK-INFRA-012: Multi-Channel Notification Service Enhancement
 *
 * Common interface for all notification channel adapters.
 * Enables pluggable channels with consistent behavior.
 */

import {
  NotificationChannelType,
  Notification,
  DeliveryResult,
  NotificationDeliveryStatus,
} from '../types/notification.types';

export interface INotificationChannel {
  /**
   * The type of notification channel
   */
  readonly channelType: NotificationChannelType;

  /**
   * Check if the channel is available for a specific recipient
   * Verifies:
   * - Contact information exists (email, phone, whatsapp)
   * - Opt-in status (POPIA compliance)
   * - Channel configuration (API keys, etc.)
   *
   * @param recipientId - Parent ID
   * @returns Whether the channel is available
   */
  isAvailable(recipientId: string): Promise<boolean>;

  /**
   * Send notification via this channel
   *
   * @param notification - Notification to send
   * @returns Delivery result with status and message ID
   * @throws BusinessException if delivery fails
   */
  send(notification: Notification): Promise<DeliveryResult>;

  /**
   * Get delivery status for a previously sent message
   *
   * @param messageId - Message ID from send() result
   * @returns Current delivery status
   */
  getDeliveryStatus(messageId: string): Promise<NotificationDeliveryStatus>;
}
