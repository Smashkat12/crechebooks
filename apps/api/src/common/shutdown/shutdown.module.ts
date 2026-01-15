/**
 * Shutdown Module
 * TASK-INFRA-007: Implement Bull Queue Graceful Shutdown
 *
 * Provides the ShutdownService for graceful queue shutdown.
 * Imports BullModule from SchedulerModule and SimplePayModule.
 */

import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bull';
import { ConfigModule } from '@nestjs/config';
import { ShutdownService } from './shutdown.service';
import { LoggerModule } from '../logger';
import { QUEUE_NAMES } from '../../scheduler/types/scheduler.types';
import { SIMPLEPAY_SYNC_QUEUE } from '../../integrations/simplepay/simplepay-sync.processor';

// Check if Redis is configured (queues only available when Redis is set up)
const isRedisConfigured = (): boolean => {
  return !!(process.env.REDIS_HOST && process.env.REDIS_PORT);
};

// Conditionally register queue tokens for injection
// When Redis is not configured, these queues won't exist, but we still need
// the module to load. The service handles missing queues gracefully.
const bullImports = isRedisConfigured()
  ? [
      BullModule.registerQueue(
        { name: QUEUE_NAMES.INVOICE_GENERATION },
        { name: QUEUE_NAMES.PAYMENT_REMINDER },
        { name: QUEUE_NAMES.SARS_DEADLINE },
        { name: QUEUE_NAMES.BANK_SYNC },
        { name: QUEUE_NAMES.STATEMENT_GENERATION },
        { name: SIMPLEPAY_SYNC_QUEUE },
      ),
    ]
  : [];

@Module({
  imports: [ConfigModule, LoggerModule, ...bullImports],
  providers: [ShutdownService],
  exports: [ShutdownService],
})
export class ShutdownModule {}
