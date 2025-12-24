/**
 * Notification Module
 * TASK-INFRA-012: Multi-Channel Notification Service Enhancement
 *
 * Provides multi-channel notification services.
 */

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EmailService } from '../integrations/email/email.service';
import { WhatsAppService } from '../integrations/whatsapp/whatsapp.service';
import { NotificationService } from './notification.service';
import { EmailChannelAdapter } from './adapters/email-channel.adapter';
import { WhatsAppChannelAdapter } from './adapters/whatsapp-channel.adapter';
import { SmsChannelAdapter } from './adapters/sms-channel.adapter';
import { NotificationPreferenceService } from './notification-preference.service';

@Module({
  imports: [DatabaseModule],
  providers: [
    // Services
    EmailService,
    WhatsAppService,
    NotificationService,
    NotificationPreferenceService,

    // Channel Adapters
    EmailChannelAdapter,
    WhatsAppChannelAdapter,
    SmsChannelAdapter,
  ],
  exports: [NotificationService, NotificationPreferenceService],
})
export class NotificationModule {}
