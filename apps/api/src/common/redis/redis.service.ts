import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { RedisOptions } from 'ioredis';

/**
 * Redis Service for distributed storage operations.
 *
 * CRITICAL: This service does NOT provide fallback behavior.
 * If Redis is unavailable, operations will fail with clear errors.
 * This is intentional for distributed environments where consistency matters.
 */
@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: Redis | null = null;
  private isConnected = false;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Establish connection to Redis.
   * Throws if connection fails - NO FALLBACK.
   */
  private async connect(): Promise<void> {
    const host = this.configService.get<string>('REDIS_HOST');
    const port = this.configService.get<number>('REDIS_PORT');
    const password = this.configService.get<string>('REDIS_PASSWORD');

    if (!host || !port) {
      const errorMsg =
        'FATAL: Redis configuration missing. REDIS_HOST and REDIS_PORT are required. ' +
        'CSRF token storage requires Redis for distributed environments.';
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    const redisOptions: RedisOptions = {
      host,
      port,
      password: password || undefined,
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 3) {
          this.logger.error(
            `Redis connection failed after ${times} attempts. CSRF operations will fail.`,
          );
          return null; // Stop retrying, let operations fail
        }
        const delay = Math.min(times * 500, 2000);
        this.logger.warn(
          `Redis connection attempt ${times} failed. Retrying in ${delay}ms...`,
        );
        return delay;
      },
      reconnectOnError: (err: Error) => {
        this.logger.error(`Redis reconnection error: ${err.message}`);
        // Only reconnect on specific errors
        return err.message.includes('READONLY') ? 1 : false;
      },
      lazyConnect: false,
      enableReadyCheck: true,
      showFriendlyErrorStack: process.env.NODE_ENV !== 'production',
    };

    this.client = new Redis(redisOptions);

    this.client.on('connect', () => {
      this.logger.log(`Redis connecting to ${host}:${port}`);
    });

    this.client.on('ready', () => {
      this.isConnected = true;
      this.logger.log('Redis connection established and ready');
    });

    this.client.on('error', (err: Error) => {
      this.isConnected = false;
      this.logger.error(`Redis connection error: ${err.message}`, err.stack);
    });

    this.client.on('close', () => {
      this.isConnected = false;
      this.logger.warn('Redis connection closed');
    });

    this.client.on('reconnecting', () => {
      this.logger.log('Redis attempting to reconnect...');
    });

    // Wait for initial connection with timeout
    try {
      await this.waitForConnection(5000);
      this.logger.log('Redis service initialized successfully');
    } catch (error) {
      const errorMsg = `FATAL: Could not establish Redis connection within timeout. Error: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Wait for Redis connection to be ready
   */
  private async waitForConnection(timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        resolve();
        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error(`Redis connection timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      this.client?.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.client?.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Disconnect from Redis
   */
  private async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.logger.log('Redis connection closed gracefully');
      } catch (error) {
        this.logger.warn(
          `Error closing Redis connection: ${error instanceof Error ? error.message : String(error)}`,
        );
        this.client.disconnect();
      }
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * Ensure Redis client is connected and available.
   * Throws if not connected - NO FALLBACK.
   */
  private ensureConnected(): Redis {
    if (!this.client) {
      const errorMsg =
        'Redis client not initialized. Cannot perform operation.';
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    if (!this.isConnected) {
      const errorMsg =
        'Redis client not connected. Cannot perform operation. Check Redis server availability.';
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    return this.client;
  }

  /**
   * Get connection status
   */
  isReady(): boolean {
    return this.isConnected && this.client !== null;
  }

  /**
   * Set a key with value and optional TTL (in seconds)
   * Throws on failure - NO FALLBACK.
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const client = this.ensureConnected();

    try {
      if (ttlSeconds !== undefined && ttlSeconds > 0) {
        await client.setex(key, ttlSeconds, value);
        this.logger.debug(`Redis SET ${key} with TTL ${ttlSeconds}s`);
      } else {
        await client.set(key, value);
        this.logger.debug(`Redis SET ${key}`);
      }
    } catch (error) {
      const errorMsg = `Redis SET failed for key "${key}": ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Get a value by key
   * Returns null if key doesn't exist
   * Throws on connection failure - NO FALLBACK.
   */
  async get(key: string): Promise<string | null> {
    const client = this.ensureConnected();

    try {
      const value = await client.get(key);
      this.logger.debug(`Redis GET ${key}: ${value ? 'found' : 'not found'}`);
      return value;
    } catch (error) {
      const errorMsg = `Redis GET failed for key "${key}": ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Delete a key
   * Throws on connection failure - NO FALLBACK.
   */
  async delete(key: string): Promise<boolean> {
    const client = this.ensureConnected();

    try {
      const result = await client.del(key);
      this.logger.debug(
        `Redis DEL ${key}: ${result > 0 ? 'deleted' : 'not found'}`,
      );
      return result > 0;
    } catch (error) {
      const errorMsg = `Redis DEL failed for key "${key}": ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Check if a key exists
   * Throws on connection failure - NO FALLBACK.
   */
  async exists(key: string): Promise<boolean> {
    const client = this.ensureConnected();

    try {
      const result = await client.exists(key);
      return result > 0;
    } catch (error) {
      const errorMsg = `Redis EXISTS failed for key "${key}": ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Get TTL (time to live) for a key in seconds
   * Returns -1 if key has no TTL, -2 if key doesn't exist
   * Throws on connection failure - NO FALLBACK.
   */
  async ttl(key: string): Promise<number> {
    const client = this.ensureConnected();

    try {
      return await client.ttl(key);
    } catch (error) {
      const errorMsg = `Redis TTL failed for key "${key}": ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Ping Redis to check connectivity
   */
  async ping(): Promise<boolean> {
    try {
      const client = this.ensureConnected();
      const result = await client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Delete all keys matching a pattern
   *
   * CAUTION: Uses SCAN to iterate over keys matching the pattern.
   * This is safer than KEYS for production use but can still be slow
   * on very large datasets.
   *
   * @param pattern - Redis glob-style pattern (e.g., "csrf:user:123:*")
   * @returns Number of keys deleted
   *
   * @throws Error if Redis is unavailable
   */
  async deletePattern(pattern: string): Promise<number> {
    const client = this.ensureConnected();

    try {
      let deletedCount = 0;
      let cursor = '0';

      // Use SCAN to iterate safely through keys
      do {
        const [nextCursor, keys] = await client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          100,
        );
        cursor = nextCursor;

        if (keys.length > 0) {
          const deleted = await client.del(...keys);
          deletedCount += deleted;
          this.logger.debug(
            `Redis deletePattern: deleted ${deleted} keys matching ${pattern}`,
          );
        }
      } while (cursor !== '0');

      this.logger.debug(
        `Redis deletePattern completed: ${deletedCount} total keys deleted for pattern ${pattern}`,
      );
      return deletedCount;
    } catch (error) {
      const errorMsg = `Redis deletePattern failed for pattern "${pattern}": ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }
}
