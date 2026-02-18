/**
 * WhatsAppModule
 * TASK-BILL-015: WhatsApp Business API Integration
 * TASK-WA-001: WhatsApp Message History Entity
 * TASK-WA-002: WhatsApp Template Management Service
 * TASK-WA-006: WhatsApp Message Retry Service
 * TASK-WA-007: Twilio WhatsApp Integration (Alternative Provider)
 * TASK-WA-007: Twilio Content API Integration Service
 * TASK-WA-009: Interactive Button Response Handlers
 * TASK-WA-010: Session-Based Interactive Features & Document Delivery
 * TASK-WA-013: Onboarding Session Expiry CRON Job
 *
 * Provides WhatsApp Business API integration for invoice delivery
 * and reminders via Meta Cloud API or Twilio.
 *
 * Provider selection is controlled by WHATSAPP_PROVIDER env var:
 * - 'meta' (default): Uses Meta's WhatsApp Cloud API
 * - 'twilio': Uses Twilio's WhatsApp API (easier sandbox testing)
 */

import { Module, forwardRef, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { WhatsAppService } from './whatsapp.service';
import { WhatsAppMessageEntity } from './entities/whatsapp-message.entity';
import { WhatsAppTemplateService } from './services/template.service';
import { WhatsAppRetryService } from './services/retry.service';
import { WhatsAppRetryProcessor } from './processors/whatsapp-retry.processor';
import { TwilioWhatsAppService } from './services/twilio-whatsapp.service';
import { TwilioContentService } from './services/twilio-content.service';
import { WhatsAppProviderService } from './services/whatsapp-provider.service';
import { DocumentUrlService } from './services/document-url.service';
import { ButtonResponseHandler } from './handlers/button-response.handler';
import { SessionInteractiveHandler } from './handlers/session-interactive.handler';
import { OnboardingConversationHandler } from './handlers/onboarding-conversation.handler';
import { OnboardingExpiryJob } from './jobs/onboarding-expiry.job';
import { OnboardingController } from './controllers/onboarding.controller';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../../api/auth/auth.module';
import { QUEUE_NAMES } from '../../scheduler/types/scheduler.types';

const logger = new Logger('WhatsAppModule');

/**
 * Check if Redis is configured
 */
const isRedisConfigured = (): boolean => {
  return !!(process.env.REDIS_HOST && process.env.REDIS_PORT);
};

/**
 * Conditionally create Bull imports for retry queue
 * TASK-WA-006: Only register Bull modules if Redis is available
 */
const bullImports = isRedisConfigured()
  ? [
      BullModule.forRootAsync({
        imports: [ConfigModule],
        useFactory: (configService: ConfigService) => {
          const redisHost = configService.get<string>('REDIS_HOST');
          const redisPort = configService.get<number>('REDIS_PORT');
          const redisPassword = configService.get<string>('REDIS_PASSWORD');

          logger.log(
            `WhatsApp retry queue connecting to Redis at ${redisHost}:${redisPort}`,
          );

          return {
            redis: {
              host: redisHost,
              port: redisPort,
              password: redisPassword,
              retryStrategy: (times: number) => {
                if (times > 3) {
                  logger.error(
                    `Failed to connect to Redis after ${times} attempts`,
                  );
                  return null;
                }
                return Math.min(times * 1000, 3000);
              },
            },
            defaultJobOptions: {
              attempts: 5,
              backoff: {
                type: 'exponential',
                delay: 30000, // 30 seconds initial delay
              },
              removeOnComplete: 100,
              removeOnFail: false,
            },
          };
        },
        inject: [ConfigService],
      }),
      BullModule.registerQueue({
        name: QUEUE_NAMES.WHATSAPP_RETRY,
      }),
    ]
  : [];

// Log Redis status at module load
if (!isRedisConfigured()) {
  logger.warn(
    'Redis not configured (REDIS_HOST/REDIS_PORT missing). WhatsApp retry queue disabled.',
  );
}

// TASK-WA-006: Conditionally include processor only when Redis is available
const retryProviders = isRedisConfigured()
  ? [WhatsAppRetryService, WhatsAppRetryProcessor]
  : [WhatsAppRetryService]; // Service can still be injected but won't process jobs

@Module({
  imports: [
    forwardRef(() => DatabaseModule),
    forwardRef(() => AuthModule), // TASK-WA-015: MagicLinkService for onboarding completion
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
    ...bullImports,
  ],
  controllers: [OnboardingController],
  providers: [
    WhatsAppService,
    WhatsAppMessageEntity,
    WhatsAppTemplateService,
    TwilioWhatsAppService,
    TwilioContentService,
    WhatsAppProviderService,
    DocumentUrlService,
    ButtonResponseHandler,
    SessionInteractiveHandler,
    OnboardingConversationHandler,
    OnboardingExpiryJob,
    ...retryProviders,
  ],
  exports: [
    WhatsAppService,
    WhatsAppMessageEntity,
    WhatsAppTemplateService,
    WhatsAppRetryService,
    TwilioWhatsAppService,
    TwilioContentService,
    WhatsAppProviderService,
    DocumentUrlService,
    ButtonResponseHandler,
    SessionInteractiveHandler,
    OnboardingConversationHandler,
  ],
})
export class WhatsAppModule {}
