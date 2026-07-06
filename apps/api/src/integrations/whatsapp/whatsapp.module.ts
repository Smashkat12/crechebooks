/**
 * WhatsAppModule
 * TASK-BILL-015: WhatsApp Business API Integration
 * TASK-WA-001: WhatsApp Message History Entity
 * TASK-WA-007: Twilio WhatsApp Integration
 * TASK-WA-007: Twilio Content API Integration Service
 * TASK-WA-009: Interactive Button Response Handlers
 * TASK-WA-010: Session-Based Interactive Features & Document Delivery
 * TASK-WA-013: Onboarding Session Expiry CRON Job
 *
 * Provides WhatsApp integration for invoice delivery and reminders
 * via Twilio (the only supported provider).
 */

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppMessageEntity } from './entities/whatsapp-message.entity';
import { TwilioWhatsAppService } from './services/twilio-whatsapp.service';
import { TwilioContentService } from './services/twilio-content.service';
import { WhatsAppProviderService } from './services/whatsapp-provider.service';
import { DocumentUrlService } from './services/document-url.service';
import { ButtonResponseHandler } from './handlers/button-response.handler';
import { SessionInteractiveHandler } from './handlers/session-interactive.handler';
import { OnboardingConversationHandler } from './handlers/onboarding-conversation.handler';
import { ParentMenuHandler } from './handlers/parent-menu.handler';
import { OnboardingExpiryJob } from './jobs/onboarding-expiry.job';
import { OnboardingController } from './controllers/onboarding.controller';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../../api/auth/auth.module';
import { MailgunModule } from '../mailgun/mailgun.module';

@Module({
  imports: [
    forwardRef(() => DatabaseModule),
    forwardRef(() => AuthModule), // TASK-WA-015: MagicLinkService for onboarding completion
    MailgunModule, // Provides CommsGuardService for outbound suppression
    ConfigModule,
    ScheduleModule.forRoot(), // TASK-WA-013: Enable @Cron for OnboardingExpiryJob
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '15m' }, // Default for document URLs
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [OnboardingController],
  providers: [
    WhatsAppService,
    WhatsAppMessageEntity,
    TwilioWhatsAppService,
    TwilioContentService,
    WhatsAppProviderService,
    DocumentUrlService,
    ButtonResponseHandler,
    SessionInteractiveHandler,
    OnboardingConversationHandler,
    ParentMenuHandler,
    OnboardingExpiryJob,
  ],
  exports: [
    WhatsAppService,
    WhatsAppMessageEntity,
    TwilioWhatsAppService,
    TwilioContentService,
    WhatsAppProviderService,
    DocumentUrlService,
    ButtonResponseHandler,
    SessionInteractiveHandler,
    OnboardingConversationHandler,
    ParentMenuHandler,
  ],
})
export class WhatsAppModule {}
