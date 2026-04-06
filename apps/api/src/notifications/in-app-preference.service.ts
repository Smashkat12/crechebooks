import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../database/prisma/prisma.service';

interface PreferenceUpdate {
  disabledTypes?: string[];
  quietHoursEnabled?: boolean;
  quietHoursStart?: string | null;
  quietHoursEnd?: string | null;
  inAppEnabled?: boolean;
  emailDigest?: boolean;
}

export interface NotificationPreferences {
  disabledTypes: string[];
  quietHoursEnabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  inAppEnabled: boolean;
  emailDigest: boolean;
}

@Injectable()
export class InAppPreferenceService {
  private readonly logger = new Logger(InAppPreferenceService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getPreferences(
    tenantId: string,
    recipientType: string,
    recipientId: string,
  ): Promise<NotificationPreferences> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: {
        tenantId_recipientType_recipientId: {
          tenantId,
          recipientType,
          recipientId,
        },
      },
    });

    if (!pref) {
      return {
        disabledTypes: [],
        quietHoursEnabled: false,
        quietHoursStart: null,
        quietHoursEnd: null,
        inAppEnabled: true,
        emailDigest: false,
      };
    }

    return {
      disabledTypes: pref.disabledTypes,
      quietHoursEnabled: pref.quietHoursEnabled,
      quietHoursStart: pref.quietHoursStart,
      quietHoursEnd: pref.quietHoursEnd,
      inAppEnabled: pref.inAppEnabled,
      emailDigest: pref.emailDigest,
    };
  }

  async updatePreferences(
    tenantId: string,
    recipientType: string,
    recipientId: string,
    update: PreferenceUpdate,
  ): Promise<NotificationPreferences> {
    const pref = await this.prisma.notificationPreference.upsert({
      where: {
        tenantId_recipientType_recipientId: {
          tenantId,
          recipientType,
          recipientId,
        },
      },
      create: {
        tenantId,
        recipientType,
        recipientId,
        ...update,
      },
      update,
    });

    return {
      disabledTypes: pref.disabledTypes,
      quietHoursEnabled: pref.quietHoursEnabled,
      quietHoursStart: pref.quietHoursStart,
      quietHoursEnd: pref.quietHoursEnd,
      inAppEnabled: pref.inAppEnabled,
      emailDigest: pref.emailDigest,
    };
  }

  shouldNotify(
    preferences: NotificationPreferences,
    notificationType: string,
  ): boolean {
    if (!preferences.inAppEnabled) return false;
    if (preferences.disabledTypes.includes(notificationType)) return false;
    if (preferences.quietHoursEnabled) {
      return !this.isInQuietHours(
        preferences.quietHoursStart,
        preferences.quietHoursEnd,
      );
    }
    return true;
  }

  private isInQuietHours(start: string | null, end: string | null): boolean {
    if (!start || !end) return false;
    const now = new Date();
    const saTime = new Date(
      now.toLocaleString('en-US', { timeZone: 'Africa/Johannesburg' }),
    );
    const currentMinutes = saTime.getHours() * 60 + saTime.getMinutes();
    const [startH, startM] = start.split(':').map(Number);
    const [endH, endM] = end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    if (startMinutes <= endMinutes) {
      return currentMinutes >= startMinutes && currentMinutes < endMinutes;
    } else {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
  }
}
