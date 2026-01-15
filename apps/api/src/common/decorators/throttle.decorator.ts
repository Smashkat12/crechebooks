/**
 * Throttle Decorators
 * TASK-INFRA-003: Custom rate limit decorators for endpoints
 *
 * These decorators provide convenient presets for common rate limiting scenarios.
 * They work alongside the existing @RateLimit decorator for Redis-based limiting.
 */

import { Throttle, SkipThrottle } from '@nestjs/throttler';

/**
 * Apply strict rate limiting (5 requests per minute)
 * Use on sensitive endpoints like login, password reset, registration
 */
export const StrictRateLimit = () =>
  Throttle({
    default: { limit: 5, ttl: 60000 }, // 5 per minute
  });

/**
 * Apply moderate rate limiting (20 requests per minute)
 * Use on endpoints that should be rate limited but not as strictly
 */
export const ModerateRateLimit = () =>
  Throttle({
    default: { limit: 20, ttl: 60000 }, // 20 per minute
  });

/**
 * Apply relaxed rate limiting (60 requests per minute)
 * Use on frequently accessed endpoints
 */
export const RelaxedRateLimit = () =>
  Throttle({
    default: { limit: 60, ttl: 60000 }, // 60 per minute
  });

/**
 * Skip rate limiting entirely
 * Use sparingly - only for health checks and critical system endpoints
 */
export const NoRateLimit = () => SkipThrottle();

/**
 * Apply short burst limiting (10 requests per second)
 * Use for endpoints that need burst protection
 */
export const BurstRateLimit = () =>
  Throttle({
    short: { limit: 10, ttl: 1000 }, // 10 per second
  });

/**
 * Apply long-term limiting (1000 requests per hour)
 * Use for overall API consumption limits
 */
export const HourlyRateLimit = () =>
  Throttle({
    long: { limit: 1000, ttl: 3600000 }, // 1000 per hour
  });

// Re-export original decorators for flexibility
export { Throttle, SkipThrottle };
