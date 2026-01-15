/**
 * Health Module
 * TASK-INFRA-001: Add Database Health Check
 * TASK-INFRA-002: Add Redis Health Check
 * TASK-INFRA-007: Integrate with Shutdown Service
 *
 * Provides application health check capabilities using @nestjs/terminus.
 * Imports necessary dependencies for database and Redis health indicators.
 * Imports ShutdownModule for graceful shutdown integration.
 */

import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../common/redis/redis.module';
import { ShutdownModule } from '../common/shutdown';
import { HealthController } from './health.controller';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';

@Module({
  imports: [
    TerminusModule,
    DatabaseModule,
    RedisModule,
    ShutdownModule, // TASK-INFRA-007: Graceful shutdown integration
  ],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, RedisHealthIndicator],
  exports: [DatabaseHealthIndicator, RedisHealthIndicator],
})
export class HealthModule {}
