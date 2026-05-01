/**
 * Notification Module
 * TASK-INFRA-012: Multi-Channel Notification Service Enhancement
 *
 * Provides multi-channel notification services (Email, WhatsApp, in-app).
 */

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { DatabaseModule } from '../database/database.module';
import { EmailService } from '../integrations/email/email.service';
import { EmailTemplateService } from '../common/services/email-template/email-template.service';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { WebSocketModule } from '../websocket';
import { NotificationService } from './notification.service';
import { InAppNotificationService } from './in-app-notification.service';
import { NotificationProcessor } from './processors/notification.processor';
import { NotificationEmitter } from './helpers/notification-emitter';
import { InAppPreferenceService } from './in-app-preference.service';
import { NotificationCleanupJob } from './jobs/notification-cleanup.job';
import { EmailChannelAdapter } from './adapters/email-channel.adapter';
import { WhatsAppChannelAdapter } from './adapters/whatsapp-channel.adapter';
import { NotificationPreferenceService } from './notification-preference.service';
import { EnrollmentCompletedHandler } from './handlers/enrollment-completed.handler';
import { PaymentEventsHandler } from './handlers/payment-events.handler';
import { InvoiceEventsHandler } from './handlers/invoice-events.handler';
import { SarsDeadlineHandler } from './handlers/sars-deadline.handler';
import { ReconciliationHandler } from './handlers/reconciliation.handler';
import { StaffEventsHandler } from './handlers/staff-events.handler';
import { RolloutModule } from '../agents/rollout/rollout.module';

@Module({
  imports: [
    forwardRef(() => DatabaseModule),
    ConfigModule,
    WebSocketModule,
    RolloutModule,
    forwardRef(() => WhatsAppModule),
    BullModule.registerQueue({ name: 'notification' }),
  ],
  providers: [
    // Services
    EmailService,
    EmailTemplateService,
    NotificationService,
    NotificationPreferenceService,

    // In-App Notification System (Phase 1)
    InAppNotificationService,
    InAppPreferenceService,
    NotificationProcessor,
    NotificationEmitter,
    NotificationCleanupJob,

    // Event Handlers
    EnrollmentCompletedHandler,
    PaymentEventsHandler,
    InvoiceEventsHandler,
    SarsDeadlineHandler,
    ReconciliationHandler,
    StaffEventsHandler,

    // Channel Adapters
    EmailChannelAdapter,
    WhatsAppChannelAdapter,
  ],
  exports: [
    NotificationService,
    NotificationPreferenceService,
    InAppNotificationService,
    InAppPreferenceService,
    NotificationEmitter,
  ],
})
export class NotificationModule {}
