/**
 * Health Module
 * TASK-INFRA-001: Add Database Health Check
 * TASK-INFRA-002: Add Redis Health Check
 * TASK-INFRA-007: Integrate with Shutdown Service
 * TASK-PERF-104: Add Database Pool Health Check
 *
 * Provides application health check capabilities using @nestjs/terminus.
 * Imports necessary dependencies for database and Redis health indicators.
 * Imports ShutdownModule for graceful shutdown integration.
 * Imports MonitoringModule for database pool health checks.
 */

import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseModule } from '../database/database.module';
import { RedisModule } from '../common/redis/redis.module';
import { ShutdownModule } from '../common/shutdown';
import { MonitoringModule } from '../database/monitoring/monitoring.module';
import { SdkAgentModule } from '../agents/sdk/sdk-agent.module';
import { HealthController } from './health.controller';
import { AiHealthController } from './ai-health.controller';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { PoolHealthIndicator } from '../database/monitoring/pool-health.indicator';

@Module({
  imports: [
    TerminusModule,
    DatabaseModule,
    RedisModule,
    ShutdownModule, // TASK-INFRA-007: Graceful shutdown integration
    MonitoringModule, // TASK-PERF-104: Database pool monitoring
    SdkAgentModule, // TASK-SDK-005: Claude API integration
  ],
  controllers: [HealthController, AiHealthController],
  providers: [
    DatabaseHealthIndicator,
    RedisHealthIndicator,
    PoolHealthIndicator,
  ],
  exports: [DatabaseHealthIndicator, RedisHealthIndicator, PoolHealthIndicator],
})
export class HealthModule {}
