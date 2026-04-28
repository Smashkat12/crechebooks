/**
 * Notification BullMQ Processor
 * TASK-NOTIF-010: In-App Notification Backend (Phase 1)
 *
 * Processes queued notification jobs: persists to DB then pushes
 * a WebSocket event for real-time delivery. Non-blocking — errors
 * are logged but never re-thrown to avoid retries for notifications.
 */

import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import * as Bull from 'bull';
import { InAppNotificationService } from '../in-app-notification.service';
import { InAppPreferenceService } from '../in-app-preference.service';
import { FeatureFlagService } from '../../agents/rollout/feature-flags.service';
import { EventEmitterService } from '../../websocket/services/event-emitter.service';
import {
  DashboardEventType,
  NotificationCreatedData,
  createNotificationCreatedEvent,
} from '../../websocket/events/dashboard.events';
import { NotificationJobData } from '../types/in-app-notification.types';

@Processor('notification')
export class NotificationProcessor {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private readonly inAppNotificationService: InAppNotificationService,
    private readonly preferenceService: InAppPreferenceService,
    private readonly featureFlagService: FeatureFlagService,
    private readonly eventEmitterService: EventEmitterService,
  ) {}

  @Process()
  async handleNotification(job: Bull.Job<NotificationJobData>): Promise<void> {
    const { notification } = job.data;

    try {
      this.logger.debug(
        `Processing notification job ${job.id} for ${notification.recipientType}:${notification.recipientId}`,
      );

      // Check feature flags for parent/staff notifications
      if (notification.recipientType === 'PARENT') {
        const isEnabled = await this.featureFlagService.isEnabled(
          notification.tenantId,
          'PARENT_NOTIFICATIONS_ENABLED',
        );
        if (!isEnabled) {
          this.logger.debug(
            `Parent notifications disabled for tenant ${notification.tenantId}`,
          );
          return;
        }
      }
      if (notification.recipientType === 'STAFF') {
        const isEnabled = await this.featureFlagService.isEnabled(
          notification.tenantId,
          'STAFF_NOTIFICATIONS_ENABLED',
        );
        if (!isEnabled) {
          this.logger.debug(
            `Staff notifications disabled for tenant ${notification.tenantId}`,
          );
          return;
        }
      }

      // Check preferences before creating
      try {
        const prefs = await this.preferenceService.getPreferences(
          notification.tenantId,
          notification.recipientType,
          notification.recipientId,
        );
        if (!this.preferenceService.shouldNotify(prefs, notification.type)) {
          this.logger.debug(
            `Notification suppressed by preferences for ${notification.recipientType}:${notification.recipientId} type=${notification.type}`,
          );
          return;
        }
      } catch (prefError) {
        // If preference check fails, deliver anyway (fail-open)
        this.logger.warn(
          `Preference check failed, delivering anyway: ${prefError}`,
        );
      }

      // 1. Persist to database
      const created = await this.inAppNotificationService.create(notification);

      // 2. Push WebSocket event for real-time delivery
      const wsData: NotificationCreatedData = {
        notificationId: created.id,
        type: created.type,
        priority: created.priority,
        title: created.title,
        recipientType: notification.recipientType,
        recipientId: notification.recipientId,
      };

      this.eventEmitterService.emitNotificationCreated(
        notification.tenantId,
        wsData,
      );

      this.logger.debug(
        `Notification ${created.id} persisted and emitted for tenant ${notification.tenantId}`,
      );
    } catch (error) {
      // Non-blocking: log but do not throw, so failed notifications
      // don't clog the queue with retries
      this.logger.error(
        `Failed to process notification job ${job.id}: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
