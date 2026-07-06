/**
 * WhatsApp Consent & History Service
 *
 * Database-side WhatsApp concerns: opt-in/opt-out consent management
 * (POPIA compliant) and message history lookups.
 *
 * Message delivery is handled by the Twilio provider path
 * (WhatsAppProviderService -> TwilioWhatsAppService); the former
 * Meta Cloud API send/template machinery has been removed.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../database/prisma/prisma.service';
import { WhatsAppMessageEntity } from './entities/whatsapp-message.entity';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly messageEntity?: WhatsAppMessageEntity,
  ) {}

  /**
   * Opt out a phone number from WhatsApp messages
   *
   * @param phoneNumber - Phone number to opt out
   */
  async optOut(phoneNumber: string): Promise<void> {
    const phone = this.formatPhoneE164(phoneNumber);

    // Find all parents with this phone number (phone or whatsapp) and opt them out
    const result = await this.prisma.parent.updateMany({
      where: {
        OR: [{ phone }, { whatsapp: phone }],
      },
      data: {
        whatsappOptIn: false,
        updatedAt: new Date(),
      },
    });

    if (result.count > 0) {
      this.logger.log({
        message: 'Phone number opted out of WhatsApp',
        phoneNumber: phone,
        affectedRecords: result.count,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Opt in a phone number to WhatsApp messages
   *
   * @param parentId - Parent ID
   */
  async optIn(parentId: string): Promise<void> {
    await this.prisma.parent.update({
      where: { id: parentId },
      data: {
        whatsappOptIn: true,
        updatedAt: new Date(),
      },
    });

    this.logger.log({
      message: 'Parent opted in to WhatsApp',
      parentId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get message history for a parent
   */
  async getMessageHistory(
    tenantId: string,
    parentId: string,
    limit?: number,
  ): Promise<import('@prisma/client').WhatsAppMessage[]> {
    if (!this.messageEntity) {
      return [];
    }

    return this.messageEntity.findByTenantAndParent(tenantId, parentId, {
      limit: limit ?? 50,
    });
  }

  /**
   * Format phone number to E.164 format (+27...)
   */
  formatPhoneE164(phone: string): string {
    if (!phone || typeof phone !== 'string') {
      return '';
    }

    // Remove non-digit characters except leading +
    const digits = phone.replace(/[^\d+]/g, '');

    // If starts with +, keep as is (already E.164)
    if (digits.startsWith('+')) {
      return digits;
    }

    // Convert SA format: 0XX... to +27XX...
    if (digits.length === 10 && digits.startsWith('0')) {
      return '+27' + digits.substring(1);
    }

    // If 9 digits without leading 0, add +27
    if (digits.length === 9 && !digits.startsWith('27')) {
      return '+27' + digits;
    }

    // If already has 27 prefix, add +
    if (digits.startsWith('27') && digits.length === 11) {
      return '+' + digits;
    }

    return '+' + digits;
  }
}
