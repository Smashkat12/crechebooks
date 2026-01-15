import { Module, Global } from '@nestjs/common';
import { RateLimitService } from './rate-limit.service';
import { RedisModule } from '../redis/redis.module';

/**
 * Rate Limit Module
 *
 * Provides rate limiting capabilities for the application.
 * This module is marked as @Global so RateLimitService can be injected
 * anywhere without re-importing the module.
 *
 * CRITICAL: Rate limiting depends on Redis.
 * If Redis is unavailable, rate limit operations will fail with clear errors.
 * This is intentional to prevent authentication abuse when protection is unavailable.
 */
@Global()
@Module({
  imports: [RedisModule],
  providers: [RateLimitService],
  exports: [RateLimitService],
})
export class RateLimitModule {}
