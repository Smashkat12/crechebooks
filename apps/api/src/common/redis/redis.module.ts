import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './redis.service';

/**
 * Global Redis Module
 *
 * Provides Redis connectivity for the entire application.
 * This module is marked as @Global so RedisService can be injected
 * anywhere without re-importing the module.
 *
 * CRITICAL: Redis is REQUIRED for distributed features like CSRF token storage.
 * If Redis is unavailable, the application will fail fast with clear error messages.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
