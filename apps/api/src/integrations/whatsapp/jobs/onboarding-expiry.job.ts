/**
 * Onboarding Session Expiry Job
 * TASK-WA-013: CRON job for session expiry and re-engagement
 *
 * Runs every hour to:
 * 1. Mark 7-day-old IN_PROGRESS sessions as ABANDONED
 * 2. Send re-engagement messages for stale (>24h, <7d) sessions
 *
 * Requires ScheduleModule.forRoot() to be imported (already in SchedulerModule).
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { WaOnboardingStatus, OnboardingStep } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service';
import { TwilioContentService } from '../services/twilio-content.service';
import {
  OnboardingCollectedData,
  SESSION_WINDOW_MS,
  ABANDON_THRESHOLD_MS,
} from '../types/onboarding.types';
import { ContentVariable } from '../types/content.types';
import { WhatsAppContextType } from '../types/message-history.types';
import { TEMPLATE_NAMES } from '../templates/content-templates';

@Injectable()
export class OnboardingExpiryJob {
  private readonly logger = new Logger(OnboardingExpiryJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly contentService: TwilioContentService,
  ) {}

  @Cron('0 * * * *') // Every hour
  async handleExpiredSessions(): Promise<void> {
    const staleThreshold = new Date(Date.now() - SESSION_WINDOW_MS);
    const abandonThreshold = new Date(Date.now() - ABANDON_THRESHOLD_MS);

    // Mark 7-day-old sessions as ABANDONED
    const abandoned = await this.prisma.whatsAppOnboardingSession.updateMany({
      where: {
        status: WaOnboardingStatus.IN_PROGRESS,
        lastMessageAt: { lt: abandonThreshold },
      },
      data: { status: WaOnboardingStatus.ABANDONED },
    });

    if (abandoned.count > 0) {
      this.logger.log(`Marked ${abandoned.count} sessions as ABANDONED`);
    }

    // Look up the approved onboarding resume template ONCE before the loop
    const resumeTemplate = await this.contentService.getTemplateAsync(
      TEMPLATE_NAMES.ONBOARDING_RESUME,
    );

    if (!resumeTemplate?.sid) {
      this.logger.warn(
        'ONBOARDING_RESUME template not registered on Twilio. ' +
          'Re-engagement messages disabled. ' +
          'Register via POST /api/v1/whatsapp/templates/register',
      );
      return;
    }

    // Send re-engagement for stale (>24h, <7d) sessions
    const staleSessions = await this.prisma.whatsAppOnboardingSession.findMany({
      where: {
        status: WaOnboardingStatus.IN_PROGRESS,
        lastMessageAt: {
          lt: staleThreshold,
          gt: abandonThreshold,
        },
      },
      include: { tenant: true },
    });

    for (const session of staleSessions) {
      const data = session.collectedData as OnboardingCollectedData;
      const firstName = data.parent?.firstName || 'there';
      const tenantName = session.tenant.tradingName || session.tenant.name;
      const stepLabel = this.stepToFriendlyLabel(session.currentStep);

      const variables: ContentVariable[] = [
        { key: '1', value: firstName },
        { key: '2', value: tenantName },
        { key: '3', value: stepLabel },
      ];

      try {
        const result = await this.contentService.sendContentMessage(
          session.waId,
          resumeTemplate.sid,
          variables,
          session.tenantId,
          WhatsAppContextType.WELCOME,
          session.id,
        );

        if (result.success) {
          this.logger.log(`Re-engagement sent to ${session.waId}`);
        } else {
          this.logger.warn(
            `Failed to send re-engagement to ${session.waId}: ${result.error}`,
          );
        }
      } catch (error) {
        this.logger.warn(
          `Failed to send re-engagement to ${session.waId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private stepToFriendlyLabel(step: OnboardingStep): string {
    const labels: Record<string, string> = {
      PARENT_NAME: 'your details',
      PARENT_SURNAME: 'your details',
      PARENT_EMAIL: 'your details',
      PARENT_ID_NUMBER: 'your details',
      CHILD_NAME: 'child details',
      CHILD_DOB: 'child details',
      CHILD_ALLERGIES: 'child details',
      CHILD_ANOTHER: 'child details',
      EMERGENCY_CONTACT_NAME: 'emergency contact',
      EMERGENCY_CONTACT_PHONE: 'emergency contact',
      EMERGENCY_CONTACT_RELATION: 'emergency contact',
      ID_DOCUMENT: 'ID verification',
      FEE_AGREEMENT: 'fee agreement',
      COMMUNICATION_PREFS: 'preferences',
      CONFIRMATION: 'final confirmation',
    };
    return labels[step] || 'registration';
  }
}
