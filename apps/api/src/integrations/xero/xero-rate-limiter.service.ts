/**
 * XeroRateLimiter
 * TASK-XERO-008: Implement Distributed Rate Limiting for Xero API
 *
 * Service for distributed rate limiting of Xero API calls.
 * Uses Redis for multi-instance coordination with in-memory fallback.
 *
 * Features:
 * - Sliding window algorithm for accurate rate limiting
 * - Redis-based distributed coordination across multiple instances
 * - Graceful fallback to in-memory when Redis unavailable
 * - Per-tenant rate limiting (60 requests per minute per tenant)
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Result of a rate limit check
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of remaining requests in the current window */
  remaining: number;
  /** Seconds to wait before retrying (only set if not allowed) */
  retryAfter?: number;
}

/**
 * Internal tracking for in-memory fallback
 */
interface InMemoryBucket {
  timestamps: number[];
  lastCleanup: number;
}

@Injectable()
export class XeroRateLimiter implements OnModuleDestroy {
  private readonly logger = new Logger(XeroRateLimiter.name);
  private redis: Redis | null = null;
  private readonly inMemoryFallback: Map<string, InMemoryBucket> = new Map();

  // Xero rate limit: 60 requests per minute per tenant
  private readonly LIMIT: number;
  private readonly WINDOW: number; // Window in seconds

  // Cleanup interval for in-memory fallback (every 5 minutes)
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {
    // Allow configuration override for testing
    this.LIMIT = this.configService.get<number>('XERO_RATE_LIMIT', 60);
    this.WINDOW = this.configService.get<number>(
      'XERO_RATE_WINDOW_SECONDS',
      60,
    );

    this.initRedis();
    this.startCleanupTimer();
  }

  /**
   * Initialize Redis connection for distributed rate limiting.
   * Falls back to in-memory if Redis is unavailable.
   */
  private initRedis(): void {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.log(
        'REDIS_URL not configured. Using in-memory rate limiting (not distributed).',
      );
      return;
    }

    try {
      this.redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        retryStrategy: (times: number) => {
          if (times > 3) {
            this.logger.warn(
              'Redis retry limit exceeded. Falling back to in-memory.',
            );
            return null; // Stop retrying
          }
          return Math.min(times * 100, 3000); // Exponential backoff
        },
        lazyConnect: true,
        enableReadyCheck: true,
        connectTimeout: 5000,
      });

      this.redis.on('error', (err: Error) => {
        this.logger.warn(
          `Redis connection error: ${err.message}. Using in-memory fallback.`,
        );
      });

      this.redis.on('connect', () => {
        this.logger.log('Redis connected for distributed rate limiting.');
      });

      this.redis.on('ready', () => {
        this.logger.log('Redis ready for distributed rate limiting.');
      });

      this.redis.on('close', () => {
        this.logger.warn('Redis connection closed.');
      });

      // Attempt connection (non-blocking)
      this.redis.connect().catch((err: Error) => {
        this.logger.warn(
          `Redis connection failed: ${err.message}. Using in-memory fallback.`,
        );
        this.redis = null;
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.logger.warn(
        `Redis initialization failed: ${error.message}. Using in-memory fallback.`,
      );
      this.redis = null;
    }
  }

  /**
   * Start periodic cleanup of stale in-memory entries.
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupInMemory();
    }, this.CLEANUP_INTERVAL_MS);

    // Ensure timer doesn't prevent process exit
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Clean up stale entries from in-memory fallback.
   */
  private cleanupInMemory(): void {
    const now = Date.now();
    const windowMs = this.WINDOW * 1000;
    let cleaned = 0;

    for (const [key, bucket] of this.inMemoryFallback.entries()) {
      // Remove timestamps outside the window
      bucket.timestamps = bucket.timestamps.filter((t) => t > now - windowMs);

      // Remove empty buckets that haven't been used recently
      if (
        bucket.timestamps.length === 0 &&
        now - bucket.lastCleanup > windowMs * 2
      ) {
        this.inMemoryFallback.delete(key);
        cleaned++;
      } else {
        bucket.lastCleanup = now;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Cleaned up ${cleaned} stale rate limit buckets.`);
    }
  }

  /**
   * Attempt to acquire a rate limit slot for the given tenant.
   * Uses Redis if available, otherwise falls back to in-memory.
   *
   * @param tenantId - The tenant ID to check rate limit for
   * @returns RateLimitResult indicating if request is allowed
   */
  async acquireSlot(tenantId: string): Promise<RateLimitResult> {
    if (this.isRedisReady()) {
      try {
        return await this.acquireSlotRedis(tenantId);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          `Redis rate limit check failed: ${error.message}. Falling back to in-memory.`,
        );
        return this.acquireSlotInMemory(tenantId);
      }
    }

    return this.acquireSlotInMemory(tenantId);
  }

  /**
   * Check if Redis is connected and ready.
   */
  private isRedisReady(): boolean {
    return this.redis !== null && this.redis.status === 'ready';
  }

  /**
   * Acquire slot using Redis with sliding window algorithm.
   * Uses MULTI/EXEC for atomic operations.
   *
   * @param tenantId - The tenant ID
   * @returns RateLimitResult
   */
  private async acquireSlotRedis(tenantId: string): Promise<RateLimitResult> {
    const key = `xero:rate:${tenantId}`;
    const now = Date.now();
    const windowStart = now - this.WINDOW * 1000;
    const uniqueId = `${now}-${Math.random().toString(36).substring(2, 9)}`;

    // Use MULTI for atomic operations
    const multi = this.redis!.multi();

    // Remove timestamps outside the sliding window
    multi.zremrangebyscore(key, 0, windowStart);

    // Count current requests in window
    multi.zcard(key);

    // Execute to get current count before deciding to add
    const countResults = await multi.exec();

    if (!countResults) {
      throw new Error('Redis MULTI returned null');
    }

    // countResults[1] contains [error, count] from zcard
    const countResult = countResults[1];
    if (countResult[0]) {
      throw countResult[0];
    }

    const currentCount = countResult[1] as number;

    // Check if we're at the limit
    if (currentCount >= this.LIMIT) {
      // Get the oldest entry to calculate retry time
      const oldest = await this.redis!.zrange(key, 0, 0, 'WITHSCORES');

      let retryAfter = this.WINDOW;
      if (oldest && oldest.length >= 2) {
        const oldestTimestamp = parseInt(oldest[1], 10);
        const oldestExpiry = oldestTimestamp + this.WINDOW * 1000;
        retryAfter = Math.max(1, Math.ceil((oldestExpiry - now) / 1000));
      }

      this.logger.warn(
        `Rate limit exceeded for tenant ${tenantId}. Retry after ${retryAfter}s.`,
      );

      return {
        allowed: false,
        remaining: 0,
        retryAfter,
      };
    }

    // Add new request timestamp and set TTL
    const addMulti = this.redis!.multi();
    addMulti.zadd(key, now, uniqueId);
    addMulti.expire(key, this.WINDOW + 10); // Add buffer to TTL

    await addMulti.exec();

    const remaining = Math.max(0, this.LIMIT - currentCount - 1);

    this.logger.debug(
      `Rate limit slot acquired for tenant ${tenantId}. Remaining: ${remaining}/${this.LIMIT}`,
    );

    return {
      allowed: true,
      remaining,
    };
  }

  /**
   * Acquire slot using in-memory sliding window.
   * Used as fallback when Redis is unavailable.
   *
   * @param tenantId - The tenant ID
   * @returns RateLimitResult
   */
  private acquireSlotInMemory(tenantId: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.WINDOW * 1000;

    // Get or create bucket for this tenant
    let bucket = this.inMemoryFallback.get(tenantId);
    if (!bucket) {
      bucket = { timestamps: [], lastCleanup: now };
      this.inMemoryFallback.set(tenantId, bucket);
    }

    // Remove timestamps outside the sliding window
    bucket.timestamps = bucket.timestamps.filter((t) => t > windowStart);

    // Check if we're at the limit
    if (bucket.timestamps.length >= this.LIMIT) {
      // Calculate retry time based on oldest timestamp
      const oldest = bucket.timestamps[0];
      const oldestExpiry = oldest + this.WINDOW * 1000;
      const retryAfter = Math.max(1, Math.ceil((oldestExpiry - now) / 1000));

      this.logger.warn(
        `Rate limit exceeded for tenant ${tenantId} (in-memory). Retry after ${retryAfter}s.`,
      );

      return {
        allowed: false,
        remaining: 0,
        retryAfter,
      };
    }

    // Add current timestamp
    bucket.timestamps.push(now);

    const remaining = this.LIMIT - bucket.timestamps.length;

    this.logger.debug(
      `Rate limit slot acquired for tenant ${tenantId} (in-memory). Remaining: ${remaining}/${this.LIMIT}`,
    );

    return {
      allowed: true,
      remaining,
    };
  }

  /**
   * Get current rate limit status for a tenant without consuming a slot.
   *
   * @param tenantId - The tenant ID
   * @returns Current remaining slots and whether requests would be allowed
   */
  async getStatus(tenantId: string): Promise<RateLimitResult> {
    if (this.isRedisReady()) {
      try {
        return await this.getStatusRedis(tenantId);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(
          `Redis status check failed: ${error.message}. Using in-memory.`,
        );
        return this.getStatusInMemory(tenantId);
      }
    }

    return this.getStatusInMemory(tenantId);
  }

  /**
   * Get status from Redis without consuming a slot.
   */
  private async getStatusRedis(tenantId: string): Promise<RateLimitResult> {
    const key = `xero:rate:${tenantId}`;
    const now = Date.now();
    const windowStart = now - this.WINDOW * 1000;

    // Clean up and count in one transaction
    const multi = this.redis!.multi();
    multi.zremrangebyscore(key, 0, windowStart);
    multi.zcard(key);

    const results = await multi.exec();
    if (!results) {
      throw new Error('Redis MULTI returned null');
    }

    const countResult = results[1];
    if (countResult[0]) {
      throw countResult[0];
    }

    const currentCount = countResult[1] as number;
    const remaining = Math.max(0, this.LIMIT - currentCount);

    if (currentCount >= this.LIMIT) {
      const oldest = await this.redis!.zrange(key, 0, 0, 'WITHSCORES');
      let retryAfter = this.WINDOW;

      if (oldest && oldest.length >= 2) {
        const oldestTimestamp = parseInt(oldest[1], 10);
        const oldestExpiry = oldestTimestamp + this.WINDOW * 1000;
        retryAfter = Math.max(1, Math.ceil((oldestExpiry - now) / 1000));
      }

      return { allowed: false, remaining: 0, retryAfter };
    }

    return { allowed: true, remaining };
  }

  /**
   * Get status from in-memory without consuming a slot.
   */
  private getStatusInMemory(tenantId: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.WINDOW * 1000;

    const bucket = this.inMemoryFallback.get(tenantId);
    if (!bucket) {
      return { allowed: true, remaining: this.LIMIT };
    }

    // Filter to current window
    const current = bucket.timestamps.filter((t) => t > windowStart);
    const remaining = Math.max(0, this.LIMIT - current.length);

    if (current.length >= this.LIMIT) {
      const oldest = current[0];
      const oldestExpiry = oldest + this.WINDOW * 1000;
      const retryAfter = Math.max(1, Math.ceil((oldestExpiry - now) / 1000));
      return { allowed: false, remaining: 0, retryAfter };
    }

    return { allowed: true, remaining };
  }

  /**
   * Reset rate limit for a tenant (for testing or administrative purposes).
   *
   * @param tenantId - The tenant ID to reset
   */
  async reset(tenantId: string): Promise<void> {
    if (this.isRedisReady()) {
      try {
        await this.redis!.del(`xero:rate:${tenantId}`);
        this.logger.log(`Rate limit reset for tenant ${tenantId} (Redis).`);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(`Failed to reset Redis rate limit: ${error.message}`);
      }
    }

    // Always clear in-memory too
    this.inMemoryFallback.delete(tenantId);
    this.logger.log(`Rate limit reset for tenant ${tenantId}.`);
  }

  /**
   * Cleanup resources on module destroy.
   */
  async onModuleDestroy(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.redis) {
      try {
        await this.redis.quit();
        this.logger.log('Redis connection closed gracefully.');
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(`Error closing Redis connection: ${error.message}`);
      }
      this.redis = null;
    }

    this.inMemoryFallback.clear();
  }
}
