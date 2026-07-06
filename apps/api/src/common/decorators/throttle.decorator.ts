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

// Re-export original decorators for flexibility
export { Throttle, SkipThrottle };
