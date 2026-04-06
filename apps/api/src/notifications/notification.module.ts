/**
 * Notification Module
 * TASK-INFRA-012: Multi-Channel Notification Service Enhancement
 * TASK-NOTIF-001: SMS Channel Adapter Implementation
 * TASK-NOTIF-002: SMS Gateway Integration (Africa's Talking)
 *
 * Provides multi-channel notification services with SMS support.
 * Supports Africa's Talking (production) and Mock (development) gateways.
 */

import { Module, Logger, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bull';
import { DatabaseModule } from '../database/database.module';
import { EmailService } from '../integrations/email/email.service';
import { EmailTemplateService } from '../common/services/email-template/email-template.service';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';
import { WebSocketModule } from '../websocket';
import { NotificationService } from './notification.service';
import { InAppNotificationService } from './in-app-notification.service';
import { NotificationProcessor } from './processors/notification.processor';
import { NotificationEmitter } from './helpers/notification-emitter';
import { InAppPreferenceService } from './in-app-preference.service';
import { NotificationCleanupJob } from './jobs/notification-cleanup.job';
import { EmailChannelAdapter } from './adapters/email-channel.adapter';
import { WhatsAppChannelAdapter } from './adapters/whatsapp-channel.adapter';
import { SmsChannelAdapter } from './adapters/sms-channel.adapter';
import { NotificationPreferenceService } from './notification-preference.service';
import { EnrollmentCompletedHandler } from './handlers/enrollment-completed.handler';
import { PaymentEventsHandler } from './handlers/payment-events.handler';
import { InvoiceEventsHandler } from './handlers/invoice-events.handler';
import { SarsDeadlineHandler } from './handlers/sars-deadline.handler';
import { ReconciliationHandler } from './handlers/reconciliation.handler';
import { StaffEventsHandler } from './handlers/staff-events.handler';
import { SMS_GATEWAY_TOKEN } from './interfaces/sms-gateway.interface';
import { MockSmsGateway } from './gateways/mock-sms.gateway';
import { AfricasTalkingSmsGateway } from './gateways/africastalking-sms.gateway';

const logger = new Logger('NotificationModule');

@Module({
  imports: [
    forwardRef(() => DatabaseModule),
    ConfigModule,
    WebSocketModule,
    BullModule.registerQueue({ name: 'notification' }),
  ],
  providers: [
    // Services
    EmailService,
    EmailTemplateService,
    WhatsAppService,
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

    // SMS Gateway Provider (factory for swappable implementations)
    {
      provide: SMS_GATEWAY_TOKEN,
      useFactory: (configService: ConfigService) => {
        const gatewayType = configService.get<string>('SMS_GATEWAY', 'mock');

        switch (gatewayType) {
          case 'africastalking':
            logger.log("Using Africa's Talking SMS gateway");
            return new AfricasTalkingSmsGateway(configService);

          case 'twilio':
            // Twilio not implemented - fail fast
            logger.error(
              'Twilio SMS gateway not implemented. Use africastalking or mock.',
            );
            throw new Error(
              'TwilioSmsGateway not implemented. Set SMS_GATEWAY=africastalking or SMS_GATEWAY=mock',
            );

          case 'mock':
          default:
            logger.log('Using Mock SMS gateway (development mode)');
            return new MockSmsGateway();
        }
      },
      inject: [ConfigService],
    },

    // Channel Adapters
    EmailChannelAdapter,
    WhatsAppChannelAdapter,
    SmsChannelAdapter,
  ],
  exports: [
    NotificationService,
    NotificationPreferenceService,
    SmsChannelAdapter,
    InAppNotificationService,
    InAppPreferenceService,
    NotificationEmitter,
  ],
})
export class NotificationModule {}
