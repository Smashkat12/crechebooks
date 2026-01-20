import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './database/prisma';
import { ApiModule } from './api/api.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { WebhookModule } from './webhooks/webhook.module';
import { MetricsModule } from './metrics/metrics.module';
import { JwtAuthGuard } from './api/auth/guards/jwt-auth.guard';
import { RolesGuard } from './api/auth/guards/roles.guard';
import { CustomThrottlerGuard } from './common/guards/throttle.guard';
import { LoggerModule } from './common/logger';
import { CircuitBreakerModule } from './integrations/circuit-breaker';
import { CspModule } from './api/csp';
import { WebSocketModule } from './websocket';
import { BankingModule } from './integrations/banking';

@Module({
  imports: [
    ConfigModule,
    // TASK-INFRA-005: Structured JSON logging with correlation ID
    LoggerModule,
    // TASK-REL-101: Circuit Breaker for Xero API
    CircuitBreakerModule,
    // TASK-INFRA-003: Global rate limiting with configurable throttlers
    ThrottlerModule.forRootAsync({
      imports: [],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'short',
            ttl: config.get<number>('THROTTLE_SHORT_TTL', 1000), // 1 second
            limit: config.get<number>('THROTTLE_SHORT_LIMIT', 10), // 10 per second
          },
          {
            name: 'medium',
            ttl: config.get<number>('THROTTLE_MEDIUM_TTL', 60000), // 1 minute
            limit: config.get<number>('THROTTLE_MEDIUM_LIMIT', 100), // 100 per minute
          },
          {
            name: 'long',
            ttl: config.get<number>('THROTTLE_LONG_TTL', 3600000), // 1 hour
            limit: config.get<number>('THROTTLE_LONG_LIMIT', 1000), // 1000 per hour
          },
        ],
        // Note: Redis storage can be enabled in production via env config
        // To enable Redis storage, install @nestjs/throttler-redis and configure:
        // storage: new ThrottlerStorageRedisService(redisConfig),
      }),
    }),
    PrismaModule,
    HealthModule,
    ApiModule,
    SchedulerModule,
    WebhookModule,
    MetricsModule, // TASK-PERF-104: Database pool metrics endpoint
    CspModule, // TASK-SEC-103: CSP configuration and violation reporting
    WebSocketModule, // TASK-FEAT-101: Real-time Dashboard WebSocket
    BankingModule, // TASK-INT-101: Bank API Integration (Stitch Open Banking)
  ],
  controllers: [],
  providers: [
    // TASK-INFRA-003: Apply throttler guard globally (first to block abusive traffic early)
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
    // Apply JwtAuthGuard globally - use @Public() to skip
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // Apply RolesGuard globally - use @Roles() to require specific roles
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
  ],
})
export class AppModule {}
