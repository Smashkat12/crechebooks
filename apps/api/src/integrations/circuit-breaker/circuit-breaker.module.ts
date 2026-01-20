/**
 * CircuitBreakerModule
 * TASK-REL-101: Circuit Breaker Pattern for Xero Integration
 *
 * NestJS module for circuit breaker pattern implementation.
 * Provides XeroCircuitBreaker service for fault tolerance.
 */

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { XeroCircuitBreaker } from './xero-circuit-breaker';
import { PendingSyncQueueService } from '../../database/services/pending-sync-queue.service';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  providers: [XeroCircuitBreaker, PendingSyncQueueService],
  exports: [XeroCircuitBreaker, PendingSyncQueueService],
})
export class CircuitBreakerModule {}
