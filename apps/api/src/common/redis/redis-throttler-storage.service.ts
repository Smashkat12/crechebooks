import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ThrottlerStorage } from '@nestjs/throttler';
import type { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface';

/**
 * Redis-backed throttler storage for distributed rate limiting.
 *
 * Uses atomic Lua scripts to ensure accurate rate limiting
 * across multiple application replicas.
 *
 * Falls back to letting the default in-memory storage handle it
 * if Redis is not configured (single-replica deployments).
 */
@Injectable()
export class RedisThrottlerStorageService
  implements ThrottlerStorage, OnModuleDestroy
{
  private readonly logger = new Logger(RedisThrottlerStorageService.name);
  private client: Redis;

  /**
   * Lua script for atomic increment with TTL and blocking support.
   * Returns: [totalHits, timeToExpire, isBlocked, timeToBlockExpire]
   */
  private static readonly INCREMENT_SCRIPT = `
    local key = KEYS[1]
    local blockKey = KEYS[2]
    local ttl = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local blockDuration = tonumber(ARGV[3])

    -- Check if blocked
    local blockTTL = redis.call('TTL', blockKey)
    if blockTTL > 0 then
      local totalHits = tonumber(redis.call('GET', key) or '0')
      return {totalHits, 0, 1, blockTTL}
    end

    -- Increment hit count
    local totalHits = redis.call('INCR', key)

    -- Set TTL on first hit
    if totalHits == 1 then
      redis.call('PEXPIRE', key, ttl)
    end

    local timeToExpire = redis.call('PTTL', key)

    -- Check if limit exceeded
    if totalHits > limit and blockDuration > 0 then
      redis.call('SET', blockKey, '1', 'PX', blockDuration)
      return {totalHits, timeToExpire, 1, blockDuration}
    end

    return {totalHits, timeToExpire, 0, 0}
  `;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('REDIS_HOST');
    const port = this.configService.get<number>('REDIS_PORT');
    const password = this.configService.get<string>('REDIS_PASSWORD');

    this.client = new Redis({
      host: host || 'localhost',
      port: port || 6379,
      password: password || undefined,
      maxRetriesPerRequest: 3,
      keyPrefix: 'throttle:',
      lazyConnect: false,
      enableReadyCheck: true,
      showFriendlyErrorStack: process.env.NODE_ENV !== 'production',
    });

    this.client.on('ready', () => {
      this.logger.log('Redis throttler storage connected');
    });

    this.client.on('error', (err: Error) => {
      this.logger.error(`Redis throttler storage error: ${err.message}`);
    });
  }

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const blockKey = `${key}:blocked`;

    try {
      const result = (await this.client.eval(
        RedisThrottlerStorageService.INCREMENT_SCRIPT,
        2,
        key,
        blockKey,
        ttl,
        limit,
        blockDuration,
      )) as number[];

      return {
        totalHits: result[0],
        timeToExpire: Math.max(0, result[1]),
        isBlocked: result[2] === 1,
        timeToBlockExpire: result[3],
      };
    } catch (error) {
      this.logger.error(
        `Redis throttle increment failed: ${error instanceof Error ? error.message : String(error)}. Allowing request through.`,
      );
      // On Redis failure, allow the request through rather than blocking all traffic
      return {
        totalHits: 1,
        timeToExpire: ttl,
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.client.quit();
      this.logger.log('Redis throttler storage disconnected');
    } catch {
      this.client.disconnect();
    }
  }
}
