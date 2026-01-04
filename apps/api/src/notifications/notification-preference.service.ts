/**
 * Notification Preference Service
 * TASK-INFRA-012: Multi-Channel Notification Service Enhancement
 *
 * Manages parent notification preferences and channel opt-ins.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';
import {
  NotificationPreferences,
  NotificationChannelType,
} from './types/notification.types';
import { PreferredContact } from '@prisma/client';
import { NotFoundException } from '../shared/exceptions';

@Injectable()
export class NotificationPreferenceService {
  private readonly logger = new Logger(NotificationPreferenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get notification preferences for a parent
   */
  async getPreferences(parentId: string): Promise<NotificationPreferences> {
    const parent = await this.prisma.parent.findUnique({
      where: { id: parentId },
      select: {
        id: true,
        email: true,
        phone: true,
        whatsapp: true,
        preferredContact: true,
        whatsappOptIn: true,
      },
    });

    if (!parent) {
      throw new NotFoundException('Parent', parentId);
    }

    // Build preferred channels from parent.preferredContact
    const preferredChannels = this.mapPreferredContactToChannels(
      parent.preferredContact,
    );

    // Build fallback order based on preferences
    const fallbackOrder = this.buildFallbackOrder(parent.preferredContact);

    return {
      parentId,
      preferredChannels,
      fallbackOrder,
      emailEnabled: !!parent.email,
      whatsappEnabled: !!parent.whatsapp || !!parent.phone,
      smsEnabled: false, // SMS not yet implemented
      emailOptIn: true, // Email doesn't require explicit opt-in (implied consent via signup)
      whatsappOptIn: parent.whatsappOptIn,
      smsOptIn: false, // SMS not yet implemented
    };
  }

  /**
   * Update notification preferences for a parent
   */
  async updatePreferences(
    parentId: string,
    prefs: Partial<NotificationPreferences>,
  ): Promise<void> {
    const parent = await this.prisma.parent.findUnique({
      where: { id: parentId },
      select: { id: true },
    });

    if (!parent) {
      throw new NotFoundException('Parent', parentId);
    }

    // Map notification preferences back to Parent.preferredContact
    const preferredContact = this.mapChannelsToPreferredContact(
      prefs.preferredChannels,
    );

    await this.prisma.parent.update({
      where: { id: parentId },
      data: {
        preferredContact,
        whatsappOptIn: prefs.whatsappOptIn ?? undefined,
        updatedAt: new Date(),
      },
    });

    this.logger.log({
      message: 'Notification preferences updated',
      parentId,
      preferredContact,
      whatsappOptIn: prefs.whatsappOptIn,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Map PreferredContact enum to NotificationChannelType array
   */
  private mapPreferredContactToChannels(
    preferredContact: PreferredContact,
  ): NotificationChannelType[] {
    switch (preferredContact) {
      case PreferredContact.EMAIL:
        return [NotificationChannelType.EMAIL];
      case PreferredContact.WHATSAPP:
        return [NotificationChannelType.WHATSAPP];
      case PreferredContact.BOTH:
        return [
          NotificationChannelType.WHATSAPP,
          NotificationChannelType.EMAIL,
        ];
    }
  }

  /**
   * Build fallback order based on preferred contact
   * Default: WhatsApp > Email > SMS
   */
  private buildFallbackOrder(
    preferredContact: PreferredContact,
  ): NotificationChannelType[] {
    switch (preferredContact) {
      case PreferredContact.EMAIL:
        return [
          NotificationChannelType.EMAIL,
          NotificationChannelType.WHATSAPP,
          NotificationChannelType.SMS,
        ];
      case PreferredContact.WHATSAPP:
        return [
          NotificationChannelType.WHATSAPP,
          NotificationChannelType.EMAIL,
          NotificationChannelType.SMS,
        ];
      case PreferredContact.BOTH:
        return [
          NotificationChannelType.WHATSAPP,
          NotificationChannelType.EMAIL,
          NotificationChannelType.SMS,
        ];
    }
  }

  /**
   * Map NotificationChannelType array back to PreferredContact enum
   */
  private mapChannelsToPreferredContact(
    channels?: NotificationChannelType[],
  ): PreferredContact {
    if (!channels || channels.length === 0) {
      return PreferredContact.EMAIL; // Default
    }

    const hasEmail = channels.includes(NotificationChannelType.EMAIL);
    const hasWhatsApp = channels.includes(NotificationChannelType.WHATSAPP);

    if (hasEmail && hasWhatsApp) {
      return PreferredContact.BOTH;
    } else if (hasWhatsApp) {
      return PreferredContact.WHATSAPP;
    } else {
      return PreferredContact.EMAIL;
    }
  }
}
