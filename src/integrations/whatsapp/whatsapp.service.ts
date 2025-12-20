/**
 * WhatsAppService
 * TASK-BILL-013: Invoice Delivery Service
 *
 * Handles WhatsApp messaging for invoice delivery.
 * Uses WhatsApp Business API (when configured).
 *
 * CRITICAL: Fail fast with detailed error logging.
 */

import { Injectable, Logger } from '@nestjs/common';
import { BusinessException } from '../../shared/exceptions';

export interface WhatsAppResult {
  messageId: string;
  status: 'sent' | 'failed';
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly isConfigured: boolean;

  constructor() {
    // Check if WhatsApp Business API is configured
    const apiUrl = process.env.WHATSAPP_API_URL;
    const apiToken = process.env.WHATSAPP_API_TOKEN;

    this.isConfigured = !!(apiUrl && apiToken);

    if (!this.isConfigured) {
      this.logger.warn(
        'WhatsApp API not configured. Set WHATSAPP_API_URL and WHATSAPP_API_TOKEN environment variables.',
      );
    } else {
      this.logger.log('WhatsApp service initialized');
    }
  }

  /**
   * Send WhatsApp message
   * @param to - Phone number (will be sanitized to South African format)
   * @param message - Message content
   * @throws BusinessException if WhatsApp not configured or send fails
   */
  sendMessage(to: string, message: string): Promise<WhatsAppResult> {
    const sanitizedPhone = this.sanitizePhoneNumber(to);

    if (!this.isValidPhoneNumber(sanitizedPhone)) {
      this.logger.error(
        `WhatsApp send failed: Invalid phone number: ${to} (sanitized: ${sanitizedPhone})`,
      );
      throw new BusinessException(
        `Invalid phone number: ${to}`,
        'INVALID_PHONE',
      );
    }

    if (!this.isConfigured) {
      this.logger.error(
        'WhatsApp send failed: WhatsApp API not configured. Set WHATSAPP_API_URL and WHATSAPP_API_TOKEN.',
      );
      throw new BusinessException(
        'WhatsApp integration not configured. Set WHATSAPP_API_URL and WHATSAPP_API_TOKEN environment variables.',
        'WHATSAPP_NOT_CONFIGURED',
      );
    }

    this.logger.log(
      `Sending WhatsApp message to ${sanitizedPhone}: ${message.substring(0, 50)}...`,
    );

    // TODO: Implement actual WhatsApp Business API call when API is available
    // For now, throw NOT_IMPLEMENTED to indicate the feature is not yet functional
    // This is CORRECT fail-fast behavior, not a workaround
    throw new BusinessException(
      'WhatsApp Business API integration not yet implemented. Configure WHATSAPP_API_URL and WHATSAPP_API_TOKEN when available.',
      'WHATSAPP_NOT_IMPLEMENTED',
    );
  }

  /**
   * Sanitize phone number to South African format
   * Removes non-digits, converts 0XX to 27XX
   */
  sanitizePhoneNumber(phone: string): string {
    if (!phone || typeof phone !== 'string') {
      return '';
    }

    // Remove non-digit characters
    let digits = phone.replace(/\D/g, '');

    // Convert SA format: 0XX... to 27XX...
    if (digits.length === 10 && digits.startsWith('0')) {
      digits = '27' + digits.substring(1);
    }

    // Add country code if missing (9 digits without leading 0)
    if (digits.length === 9 && !digits.startsWith('27')) {
      digits = '27' + digits;
    }

    return digits;
  }

  /**
   * Validate phone number (South African format)
   * South African numbers: 27 + 9 digits = 11 total
   */
  isValidPhoneNumber(phone: string): boolean {
    if (!phone || typeof phone !== 'string') {
      return false;
    }
    const sanitized = this.sanitizePhoneNumber(phone);
    return /^27\d{9}$/.test(sanitized);
  }
}
