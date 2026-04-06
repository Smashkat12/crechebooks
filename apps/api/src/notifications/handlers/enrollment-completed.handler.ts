/**
 * Enrollment Completed Event Handler
 *
 * Sends email notification to tenant admin(s) when a new student is enrolled.
 * Covers both admin API and WhatsApp self-registration paths.
 */

import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma/prisma.service';
import { EmailService } from '../../integrations/email/email.service';
import {
  EmailTemplateService,
  EnrollmentNotificationData,
} from '../../common/services/email-template/email-template.service';
import { EventEmitterService } from '../../websocket/services/event-emitter.service';
import {
  DashboardEventType,
  EnrollmentCompletedData,
} from '../../websocket/events/dashboard.events';
import * as EnrollmentEvents from '../../database/events/enrollment.events';
import { NotificationEmitter } from '../helpers/notification-emitter';

@Injectable()
export class EnrollmentCompletedHandler {
  private readonly logger = new Logger(EnrollmentCompletedHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
    private readonly emailTemplateService: EmailTemplateService,
    private readonly wsEventEmitter: EventEmitterService,
    private readonly configService: ConfigService,
    private readonly emitter: NotificationEmitter,
  ) {}

  @OnEvent('enrollment.completed', { async: true })
  async handleEnrollmentCompleted(
    event: EnrollmentEvents.EnrollmentCompletedEvent,
  ): Promise<void> {
    this.logger.log(
      `New enrollment: ${event.childName} (source: ${event.source}) for tenant ${event.tenantId}`,
    );

    // Emit WebSocket event for real-time dashboard (safe in all environments)
    this.emitWebSocketEvent(event);

    // Query admin users for the tenant
    const admins = await this.prisma.user.findMany({
      where: {
        tenantId: event.tenantId,
        role: { in: ['ADMIN', 'OWNER'] },
        isActive: true,
      },
      select: { email: true, name: true },
    });

    if (admins.length === 0) {
      this.logger.warn(
        `No active admins found for tenant ${event.tenantId}`,
      );
      return;
    }

    // Staging safety: suppress emails, only log
    const appEnv = this.configService.get<string>('APP_ENV');
    if (appEnv === 'staging') {
      this.logger.log(
        `[STAGING] Enrollment notification suppressed for ${admins.length} admin(s). ` +
          `Child: ${event.childName}, Source: ${event.source}`,
      );
      return;
    }

    // Get tenant details for branding
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: event.tenantId },
      select: { name: true, email: true },
    });

    if (!tenant) {
      this.logger.warn(
        `Tenant ${event.tenantId} not found for notification`,
      );
      return;
    }

    const frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'https://app.elleelephant.co.za',
    );

    const sourceLabel =
      event.source === 'whatsapp_onboarding'
        ? 'WhatsApp Self-Registration'
        : 'Admin Portal';

    const templateData: EnrollmentNotificationData = {
      tenantName: tenant.name || 'CrecheBooks',
      supportEmail: tenant.email ?? undefined,
      recipientName: '', // Set per admin below
      childName: event.childName,
      parentName: event.parentName,
      parentEmail: event.parentEmail,
      feeStructureName: event.feeStructureName,
      monthlyFee: `R ${(event.monthlyFeeCents / 100).toFixed(2)}`,
      startDate: event.startDate.toLocaleDateString('en-ZA', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      }),
      enrollmentSource: sourceLabel,
      invoiceNumber: event.invoiceNumber,
      dashboardUrl: `${frontendUrl}/dashboard`,
    };

    // Send to each admin (errors per admin don't block others)
    for (const admin of admins) {
      if (!admin.email) continue;

      try {
        const rendered = this.emailTemplateService.renderEnrollmentNotification({
          ...templateData,
          recipientName: admin.name || 'Admin',
        });

        await this.emailService.sendEmailWithOptions({
          to: admin.email,
          subject: rendered.subject,
          body: rendered.text,
          html: rendered.html,
          tags: ['enrollment-notification', event.source],
        });

        this.logger.log(
          `Enrollment notification sent to ${admin.email} for ${event.childName}`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to notify admin ${admin.email}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Also create in-app notification
    try {
      await this.emitter.notifyAdmins(event.tenantId, {
        type: 'ENROLLMENT_COMPLETED',
        title: `New enrollment: ${event.childName}`,
        body: `${event.childName} enrolled via ${sourceLabel} — ${event.feeStructureName}`,
        actionUrl: '/children',
        metadata: { enrollmentId: event.enrollmentId, source: event.source },
      });
    } catch (error) {
      this.logger.error(
        `Failed to send in-app enrollment notification: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private emitWebSocketEvent(event: EnrollmentEvents.EnrollmentCompletedEvent): void {
    try {
      const wsData: EnrollmentCompletedData = {
        enrollmentId: event.enrollmentId,
        childName: event.childName,
        parentName: event.parentName,
        feeStructureName: event.feeStructureName,
        source: event.source,
      };

      this.wsEventEmitter.emitToTenant(event.tenantId, {
        type: DashboardEventType.ENROLLMENT_COMPLETED,
        timestamp: new Date().toISOString(),
        tenantId: event.tenantId,
        data: wsData,
      });
    } catch (error) {
      this.logger.warn(
        `Failed to emit WebSocket event: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
