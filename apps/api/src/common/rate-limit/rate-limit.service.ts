import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Rate Limit Result returned by checkRateLimit
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter?: number;
  total: number;
  windowSeconds: number;
}

/**
 * Failed Attempt Result returned by trackFailedAttempt
 */
export interface FailedAttemptResult {
  attempts: number;
  backoffSeconds: number;
  isLocked: boolean;
}

/**
 * Rate Limit Configuration
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window */
  limit: number;
  /** Window duration in seconds */
  windowSeconds: number;
  /** Key prefix for Redis storage */
  keyPrefix: string;
}

/**
 * Authentication Rate Limit Configurations
 * These are the default configurations for auth endpoints
 */
export const AUTH_RATE_LIMITS = {
  LOGIN: {
    limit: 5,
    windowSeconds: 900, // 15 minutes
    keyPrefix: 'ratelimit:auth:login',
  },
  REGISTER: {
    limit: 3,
    windowSeconds: 3600, // 1 hour
    keyPrefix: 'ratelimit:auth:register',
  },
  FORGOT_PASSWORD: {
    limit: 3,
    windowSeconds: 3600, // 1 hour
    keyPrefix: 'ratelimit:auth:forgot-password',
  },
  DEV_LOGIN: {
    limit: 5,
    windowSeconds: 900, // 15 minutes
    keyPrefix: 'ratelimit:auth:dev-login',
  },
} as const;

/**
 * Exponential Backoff Configuration
 */
const BACKOFF_CONFIG = {
  /** Number of failures before backoff starts */
  THRESHOLD: 3,
  /** Base delay in seconds */
  BASE_DELAY: 1,
  /** Maximum delay in seconds */
  MAX_DELAY: 30,
  /** Account lockout threshold */
  LOCKOUT_THRESHOLD: 10,
  /** Account lockout duration in seconds (30 minutes) */
  LOCKOUT_DURATION: 1800,
};

/**
 * Rate Limit Service
 *
 * Implements sliding window rate limiting using Redis.
 *
 * CRITICAL: This service does NOT provide fallback behavior.
 * If Redis is unavailable, rate limiting operations will fail with clear errors.
 * This is intentional to prevent authentication abuse when protection is unavailable.
 */
@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);

  constructor(private readonly redisService: RedisService) {}

  /**
   * Check if a request is within rate limits using sliding window algorithm.
   *
   * @param key - Unique identifier for the rate limit (e.g., IP address, user ID)
   * @param limit - Maximum number of requests allowed in the window
   * @param windowSeconds - Time window in seconds
   * @returns RateLimitResult with allowed status and remaining requests
   * @throws Error if Redis is unavailable (NO FALLBACK)
   */
  async checkRateLimit(
    key: string,
    limit: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    const fullKey = `${key}:requests`;

    try {
      // Get current request count in the sliding window
      const currentCount = await this.getWindowCount(fullKey, windowStart);

      if (currentCount >= limit) {
        // Calculate retry-after time
        const oldestTimestamp = await this.getOldestTimestamp(
          fullKey,
          windowStart,
        );
        const retryAfter = oldestTimestamp
          ? Math.ceil((oldestTimestamp + windowSeconds * 1000 - now) / 1000)
          : windowSeconds;

        this.logger.warn(
          `Rate limit exceeded for ${key}: ${currentCount}/${limit} requests in ${windowSeconds}s window`,
        );

        return {
          allowed: false,
          remaining: 0,
          retryAfter: Math.max(1, retryAfter),
          total: limit,
          windowSeconds,
        };
      }

      // Record this request
      await this.recordRequest(fullKey, now, windowSeconds);

      // Clean up old entries
      await this.cleanupOldEntries(fullKey, windowStart);

      const remaining = limit - currentCount - 1;

      this.logger.debug(
        `Rate limit check for ${key}: ${currentCount + 1}/${limit} requests, ${remaining} remaining`,
      );

      return {
        allowed: true,
        remaining: Math.max(0, remaining),
        total: limit,
        windowSeconds,
      };
    } catch (error) {
      const errorMsg = `Rate limit check failed for ${key}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Track a failed authentication attempt with exponential backoff.
   *
   * @param key - Unique identifier (e.g., "ip:{ip}" or "email:{email}")
   * @returns FailedAttemptResult with attempts count and backoff delay
   * @throws Error if Redis is unavailable (NO FALLBACK)
   */
  async trackFailedAttempt(key: string): Promise<FailedAttemptResult> {
    const fullKey = `ratelimit:failed:${key}`;

    try {
      // Get current attempt count
      const currentValue = await this.redisService.get(fullKey);
      const currentAttempts = currentValue ? parseInt(currentValue, 10) : 0;
      const newAttempts = currentAttempts + 1;

      // Store incremented value with TTL
      // TTL extends on each failed attempt to maintain the counter
      const ttl = BACKOFF_CONFIG.LOCKOUT_DURATION * 2; // 1 hour TTL for tracking
      await this.redisService.set(fullKey, newAttempts.toString(), ttl);

      // Calculate backoff delay
      // Backoff starts AFTER THRESHOLD failures (at attempt THRESHOLD+1)
      // e.g., if THRESHOLD=3: attempt 4 gets 1s delay, attempt 5 gets 2s, attempt 6 gets 4s
      let backoffSeconds = 0;
      if (newAttempts > BACKOFF_CONFIG.THRESHOLD) {
        const power = newAttempts - BACKOFF_CONFIG.THRESHOLD - 1;
        backoffSeconds = Math.min(
          BACKOFF_CONFIG.BASE_DELAY * Math.pow(2, power),
          BACKOFF_CONFIG.MAX_DELAY,
        );
      }

      // Check if account should be locked
      const isLocked = newAttempts >= BACKOFF_CONFIG.LOCKOUT_THRESHOLD;

      if (isLocked) {
        await this.lockAccount(key, BACKOFF_CONFIG.LOCKOUT_DURATION);
        this.logger.warn(
          `Account locked after ${newAttempts} failed attempts: ${key}`,
        );
      } else if (backoffSeconds > 0) {
        this.logger.warn(
          `Failed attempt ${newAttempts} for ${key}, backoff: ${backoffSeconds}s`,
        );
      }

      return {
        attempts: newAttempts,
        backoffSeconds,
        isLocked,
      };
    } catch (error) {
      const errorMsg = `Failed to track failed attempt for ${key}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Check if an account/identifier is currently locked.
   *
   * @param identifier - Account identifier (email, IP, etc.)
   * @returns true if locked, false otherwise
   * @throws Error if Redis is unavailable (NO FALLBACK)
   */
  async isAccountLocked(identifier: string): Promise<boolean> {
    const lockKey = `ratelimit:locked:${identifier}`;

    try {
      const exists = await this.redisService.exists(lockKey);

      if (exists) {
        const ttl = await this.redisService.ttl(lockKey);
        this.logger.debug(`Account ${identifier} is locked, TTL: ${ttl}s`);
      }

      return exists;
    } catch (error) {
      const errorMsg = `Failed to check account lock for ${identifier}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Get remaining lockout time for an account.
   *
   * @param identifier - Account identifier
   * @returns Remaining seconds of lockout, or 0 if not locked
   * @throws Error if Redis is unavailable (NO FALLBACK)
   */
  async getLockoutRemaining(identifier: string): Promise<number> {
    const lockKey = `ratelimit:locked:${identifier}`;

    try {
      const ttl = await this.redisService.ttl(lockKey);
      // TTL returns -2 if key doesn't exist, -1 if no TTL
      return ttl > 0 ? ttl : 0;
    } catch (error) {
      const errorMsg = `Failed to get lockout remaining for ${identifier}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Lock an account for a specified duration.
   *
   * @param identifier - Account identifier
   * @param durationSeconds - Lock duration in seconds
   * @throws Error if Redis is unavailable (NO FALLBACK)
   */
  async lockAccount(
    identifier: string,
    durationSeconds: number,
  ): Promise<void> {
    const lockKey = `ratelimit:locked:${identifier}`;

    try {
      const lockData = JSON.stringify({
        lockedAt: Date.now(),
        duration: durationSeconds,
        reason: 'Too many failed attempts',
      });

      await this.redisService.set(lockKey, lockData, durationSeconds);

      this.logger.warn(`Account locked: ${identifier} for ${durationSeconds}s`);
    } catch (error) {
      const errorMsg = `Failed to lock account ${identifier}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Clear failed attempts for an identifier (call on successful login).
   *
   * @param key - Identifier to clear
   * @throws Error if Redis is unavailable (NO FALLBACK)
   */
  async clearFailedAttempts(key: string): Promise<void> {
    const fullKey = `ratelimit:failed:${key}`;

    try {
      const deleted = await this.redisService.delete(fullKey);

      if (deleted) {
        this.logger.debug(`Cleared failed attempts for ${key}`);
      }
    } catch (error) {
      const errorMsg = `Failed to clear failed attempts for ${key}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Unlock an account manually (admin function).
   *
   * @param identifier - Account identifier to unlock
   * @throws Error if Redis is unavailable (NO FALLBACK)
   */
  async unlockAccount(identifier: string): Promise<void> {
    const lockKey = `ratelimit:locked:${identifier}`;
    const failedKey = `ratelimit:failed:${identifier}`;

    try {
      await this.redisService.delete(lockKey);
      await this.redisService.delete(failedKey);

      this.logger.log(`Account unlocked manually: ${identifier}`);
    } catch (error) {
      const errorMsg = `Failed to unlock account ${identifier}: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Get the count of requests in the sliding window.
   * Uses Redis sorted sets for efficient sliding window implementation.
   */
  private async getWindowCount(
    key: string,
    windowStart: number,
  ): Promise<number> {
    // For simplicity with the current RedisService API, we'll use a list-based approach
    // In production, you might want to extend RedisService with ZRANGEBYSCORE support
    const data = await this.redisService.get(key);

    if (!data) {
      return 0;
    }

    try {
      const timestamps: number[] = JSON.parse(data);
      return timestamps.filter((ts) => ts > windowStart).length;
    } catch {
      return 0;
    }
  }

  /**
   * Get the oldest timestamp in the current window.
   */
  private async getOldestTimestamp(
    key: string,
    windowStart: number,
  ): Promise<number | null> {
    const data = await this.redisService.get(key);

    if (!data) {
      return null;
    }

    try {
      const timestamps: number[] = JSON.parse(data);
      const validTimestamps = timestamps.filter((ts) => ts > windowStart);
      return validTimestamps.length > 0 ? Math.min(...validTimestamps) : null;
    } catch {
      return null;
    }
  }

  /**
   * Record a request timestamp.
   */
  private async recordRequest(
    key: string,
    timestamp: number,
    windowSeconds: number,
  ): Promise<void> {
    const data = await this.redisService.get(key);
    let timestamps: number[] = [];

    if (data) {
      try {
        timestamps = JSON.parse(data);
      } catch {
        timestamps = [];
      }
    }

    timestamps.push(timestamp);

    // Store with TTL slightly longer than window to handle edge cases
    await this.redisService.set(
      key,
      JSON.stringify(timestamps),
      windowSeconds + 60,
    );
  }

  /**
   * Clean up timestamps older than the window start.
   */
  private async cleanupOldEntries(
    key: string,
    windowStart: number,
  ): Promise<void> {
    const data = await this.redisService.get(key);

    if (!data) {
      return;
    }

    try {
      const timestamps: number[] = JSON.parse(data);
      const validTimestamps = timestamps.filter((ts) => ts > windowStart);

      if (validTimestamps.length !== timestamps.length) {
        const ttl = await this.redisService.ttl(key);
        await this.redisService.set(
          key,
          JSON.stringify(validTimestamps),
          ttl > 0 ? ttl : undefined,
        );
      }
    } catch {
      // If parse fails, delete corrupted data
      await this.redisService.delete(key);
    }
  }
}
