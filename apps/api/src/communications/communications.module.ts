/**
 * Communications Module
 * TASK-COMM-001: Ad-hoc Communication Database Schema
 * TASK-COMM-002: Ad-hoc Communication Service
 *
 * Provides entity services and communication orchestration for broadcast messaging.
 * Supports multi-channel communication (email, WhatsApp, SMS).
 */

import { Module, forwardRef, Logger, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { BullModule } from '@nestjs/bull';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BroadcastMessageEntity } from './entities/broadcast-message.entity';
import { MessageRecipientEntity } from './entities/message-recipient.entity';
import { RecipientGroupEntity } from './entities/recipient-group.entity';
import { RecipientResolverService } from './services/recipient-resolver.service';
import { AdhocCommunicationService } from './services/adhoc-communication.service';
import { BroadcastProcessor } from './processors/broadcast.processor';
import { DatabaseModule } from '../database/database.module';
import { EmailModule } from '../integrations/email/email.module';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { QUEUE_NAMES } from '../scheduler/types/scheduler.types';
import type { Queue } from 'bull';

const logger = new Logger('CommunicationsModule');

/**
 * Check if Redis is configured
 */
const isRedisConfigured = (): boolean => {
  return !!(process.env.REDIS_HOST && process.env.REDIS_PORT);
};

/**
 * Conditionally create Bull imports for broadcast queue
 * TASK-COMM-002: Only register Bull modules if Redis is available
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
            `Broadcast queue connecting to Redis at ${redisHost}:${redisPort}`,
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
              attempts: 3,
              backoff: {
                type: 'exponential',
                delay: 5000,
              },
              removeOnComplete: 100,
              removeOnFail: false,
            },
          };
        },
        inject: [ConfigService],
      }),
      BullModule.registerQueue({
        name: QUEUE_NAMES.BROADCAST,
      }),
    ]
  : [];

// Log Redis status at module load
if (!isRedisConfigured()) {
  logger.warn(
    'Redis not configured (REDIS_HOST/REDIS_PORT missing). Broadcast queue disabled.',
  );
}

// TASK-COMM-002: Conditionally include processor only when Redis is available
const processorProviders = isRedisConfigured() ? [BroadcastProcessor] : [];

@Module({
  imports: [
    forwardRef(() => DatabaseModule),
    forwardRef(() => EmailModule),
    forwardRef(() => WhatsAppModule),
    ConfigModule,
    ...bullImports,
  ],
  providers: [
    // Entities
    BroadcastMessageEntity,
    MessageRecipientEntity,
    RecipientGroupEntity,
    // Services
    RecipientResolverService,
    AdhocCommunicationService,
    // Processors (conditional)
    ...processorProviders,
  ],
  exports: [
    // Entities
    BroadcastMessageEntity,
    MessageRecipientEntity,
    RecipientGroupEntity,
    // Services
    RecipientResolverService,
    AdhocCommunicationService,
  ],
})
export class CommunicationsModule implements OnModuleInit {
  constructor(private readonly moduleRef: ModuleRef) {}

  /**
   * Inject the broadcast queue into AdhocCommunicationService after module init
   * This handles the case where Redis may or may not be available
   */
  onModuleInit(): void {
    const adhocService = this.moduleRef.get(AdhocCommunicationService, {
      strict: false,
    });

    if (isRedisConfigured()) {
      try {
        // Get the queue using the token format Bull uses
        const queue = this.moduleRef.get<Queue>(
          `BullQueue_${QUEUE_NAMES.BROADCAST}`,
          { strict: false },
        );
        adhocService.setBroadcastQueue(queue);
        logger.log('Broadcast queue injected into AdhocCommunicationService');
      } catch (error) {
        logger.warn(
          'Failed to inject broadcast queue:',
          error instanceof Error ? error.message : String(error),
        );
        adhocService.setBroadcastQueue(null);
      }
    } else {
      adhocService.setBroadcastQueue(null);
    }
  }
}
