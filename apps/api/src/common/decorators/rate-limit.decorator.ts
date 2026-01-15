import { SetMetadata } from '@nestjs/common';

/**
 * Rate limit configuration options for the @RateLimit decorator.
 */
export interface RateLimitOptions {
  /**
   * Maximum number of requests allowed in the time window.
   */
  limit: number;

  /**
   * Time window duration in seconds.
   */
  windowSeconds: number;

  /**
   * Prefix for the rate limit key in Redis.
   * The final key will be: {keyPrefix}:{identifier}
   */
  keyPrefix: string;

  /**
   * Whether to use the user ID (if authenticated) instead of IP for rate limiting.
   * Default: false (uses IP address)
   */
  useUserId?: boolean;

  /**
   * Skip rate limiting for certain conditions.
   * If true, requests won't be rate limited.
   * Default: false
   */
  skipIf?: () => boolean;

  /**
   * Custom error message when rate limit is exceeded.
   */
  errorMessage?: string;
}

/**
 * Metadata key for rate limit options.
 */
export const RATE_LIMIT_KEY = 'rate_limit';

/**
 * Rate limit decorator for controller methods.
 *
 * Apply to endpoints that need rate limiting protection.
 *
 * @example
 * ```typescript
 * @RateLimit({ limit: 5, windowSeconds: 900, keyPrefix: 'auth:login' })
 * @Post('login')
 * async login(@Body() dto: LoginDto) { ... }
 * ```
 *
 * @param options - Rate limit configuration
 */
export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_KEY, options);

/**
 * Predefined rate limit configurations for common use cases.
 */
export const RateLimitPresets = {
  /**
   * Standard authentication endpoint rate limit.
   * 5 attempts per 15 minutes.
   */
  AUTH_LOGIN: {
    limit: 5,
    windowSeconds: 900,
    keyPrefix: 'ratelimit:auth:login',
  } as RateLimitOptions,

  /**
   * Registration endpoint rate limit.
   * 3 attempts per hour.
   */
  AUTH_REGISTER: {
    limit: 3,
    windowSeconds: 3600,
    keyPrefix: 'ratelimit:auth:register',
  } as RateLimitOptions,

  /**
   * Password reset endpoint rate limit.
   * 3 attempts per hour.
   */
  AUTH_FORGOT_PASSWORD: {
    limit: 3,
    windowSeconds: 3600,
    keyPrefix: 'ratelimit:auth:forgot-password',
  } as RateLimitOptions,

  /**
   * Dev login endpoint rate limit (development only).
   * 5 attempts per 15 minutes.
   */
  AUTH_DEV_LOGIN: {
    limit: 5,
    windowSeconds: 900,
    keyPrefix: 'ratelimit:auth:dev-login',
  } as RateLimitOptions,

  /**
   * API general rate limit.
   * 100 requests per minute.
   */
  API_GENERAL: {
    limit: 100,
    windowSeconds: 60,
    keyPrefix: 'ratelimit:api:general',
  } as RateLimitOptions,

  /**
   * Strict rate limit for sensitive operations.
   * 10 requests per hour.
   */
  SENSITIVE_OPERATION: {
    limit: 10,
    windowSeconds: 3600,
    keyPrefix: 'ratelimit:sensitive',
  } as RateLimitOptions,
} as const;
