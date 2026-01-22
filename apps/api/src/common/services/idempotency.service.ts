/**
 * Idempotency Service
 * TASK-INFRA-006: Webhook Idempotency Deduplication
 *
 * @description Redis-backed idempotency service for preventing duplicate
 * processing of retried webhooks. Uses atomic SET NX operations to ensure
 * only one request with a given key is processed.
 *
 * CRITICAL: Graceful degradation when Redis is unavailable - allows processing.
 * CRITICAL: Uses appropriate TTL (24-48 hours) for webhook retry windows.
 */

import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Result of an idempotency check
 */
export interface IdempotencyResult {
  /** True if this is a new request that should be processed */
  isNew: boolean;
  /** Stored result from a previous identical request, if available */
  storedResult?: unknown;
  /** Timestamp when the original request was processed */
  processedAt?: string;
}

/**
 * Data stored for each idempotent request
 */
export interface IdempotencyEntry {
  /** Timestamp when the request was first processed */
  processedAt: string;
  /** Optional result from processing the request */
  result?: unknown;
  /** Request metadata for debugging */
  metadata?: Record<string, unknown>;
}

@Injectable()
export class IdempotencyService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(IdempotencyService.name);
  private redis: Redis | null = null;
  private isConnected = false;

  /** Redis key prefix for idempotency entries */
  private readonly KEY_PREFIX = 'idempotency:';

  /** Default TTL in seconds (24 hours - covers most webhook retry windows) */
  private readonly DEFAULT_TTL: number;

  constructor(private readonly configService: ConfigService) {
    // Allow configuration of TTL via environment variable
    this.DEFAULT_TTL = this.configService.get<number>('IDEMPOTENCY_TTL', 86400); // 24 hours default
  }

  async onModuleInit(): Promise<void> {
    await this.connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.disconnect();
  }

  /**
   * Establish connection to Redis.
   * Graceful degradation: if Redis is not configured, idempotency is disabled.
   */
  private async connect(): Promise<void> {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    const redisHost = this.configService.get<string>('REDIS_HOST');
    const redisPort = this.configService.get<number>('REDIS_PORT');

    // Check if Redis is configured
    if (!redisUrl && !redisHost) {
      this.logger.warn(
        'IdempotencyService: Redis not configured (REDIS_URL or REDIS_HOST required). ' +
          'Webhook idempotency checking is DISABLED. ' +
          'Duplicate webhooks may be processed multiple times.',
      );
      return;
    }

    try {
      if (redisUrl) {
        this.redis = new Redis(redisUrl, {
          maxRetriesPerRequest: 3,
          lazyConnect: false,
          enableReadyCheck: true,
        });
      } else {
        const password = this.configService.get<string>('REDIS_PASSWORD');
        this.redis = new Redis({
          host: redisHost,
          port: redisPort || 6379,
          password: password || undefined,
          maxRetriesPerRequest: 3,
          lazyConnect: false,
          enableReadyCheck: true,
        });
      }

      this.redis.on('ready', () => {
        this.isConnected = true;
        this.logger.log('IdempotencyService: Redis connection ready');
      });

      this.redis.on('error', (err: Error) => {
        this.isConnected = false;
        this.logger.error(
          `IdempotencyService: Redis error - ${err.message}. ` +
            'Idempotency checking may be temporarily unavailable.',
        );
      });

      this.redis.on('close', () => {
        this.isConnected = false;
        this.logger.warn('IdempotencyService: Redis connection closed');
      });

      // Wait for initial connection
      await this.waitForConnection(3000);
      this.logger.log(
        `IdempotencyService initialized with ${this.DEFAULT_TTL}s TTL`,
      );
    } catch (error) {
      this.redis = null;
      this.isConnected = false;
      this.logger.warn(
        `IdempotencyService: Failed to connect to Redis - ${error instanceof Error ? error.message : String(error)}. ` +
          'Webhook idempotency checking is DISABLED.',
      );
    }
  }

  /**
   * Wait for Redis connection with timeout
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

      this.redis?.once('ready', () => {
        clearTimeout(timeout);
        resolve();
      });

      this.redis?.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  /**
   * Disconnect from Redis gracefully
   */
  private async disconnect(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
        this.logger.log(
          'IdempotencyService: Redis connection closed gracefully',
        );
      } catch (error) {
        this.logger.warn(
          `IdempotencyService: Error closing Redis - ${error instanceof Error ? error.message : String(error)}`,
        );
        this.redis.disconnect();
      }
      this.redis = null;
      this.isConnected = false;
    }
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.redis !== null && this.isConnected;
  }

  /**
   * Atomically check if a request is new and mark it as being processed.
   * Uses Redis SET NX (set if not exists) for atomic check-and-set.
   *
   * @param key - Unique idempotency key for the request
   * @param ttl - Optional TTL override in seconds
   * @returns true if this is a new request, false if duplicate
   *
   * GRACEFUL DEGRADATION: Returns true (allow processing) if Redis unavailable
   */
  async checkAndSet(key: string, ttl?: number): Promise<boolean> {
    if (!this.redis || !this.isConnected) {
      this.logger.debug(
        `IdempotencyService: Redis unavailable, allowing request: ${key}`,
      );
      return true; // Graceful degradation - allow processing
    }

    const fullKey = `${this.KEY_PREFIX}${key}`;
    const entry: IdempotencyEntry = {
      processedAt: new Date().toISOString(),
    };

    try {
      // SET NX EX - atomic set-if-not-exists with expiry
      const result = await this.redis.set(
        fullKey,
        JSON.stringify(entry),
        'EX',
        ttl || this.DEFAULT_TTL,
        'NX',
      );

      const isNew = result === 'OK';

      if (!isNew) {
        this.logger.log(
          `IdempotencyService: Duplicate request detected: ${key}`,
        );
      } else {
        this.logger.debug(`IdempotencyService: New request registered: ${key}`);
      }

      return isNew;
    } catch (error) {
      this.logger.error(
        `IdempotencyService: Error checking key "${key}" - ${error instanceof Error ? error.message : String(error)}. ` +
          'Allowing request to proceed.',
      );
      return true; // Graceful degradation - allow processing on error
    }
  }

  /**
   * Check if a request with the given key has already been processed.
   *
   * @param key - Unique idempotency key to check
   * @returns true if already processed, false if new
   *
   * GRACEFUL DEGRADATION: Returns false (not processed) if Redis unavailable
   */
  async isProcessed(key: string): Promise<boolean> {
    if (!this.redis || !this.isConnected) {
      return false; // Graceful degradation - assume not processed
    }

    const fullKey = `${this.KEY_PREFIX}${key}`;

    try {
      const exists = await this.redis.exists(fullKey);
      return exists === 1;
    } catch (error) {
      this.logger.error(
        `IdempotencyService: Error checking existence of key "${key}" - ${error instanceof Error ? error.message : String(error)}`,
      );
      return false; // Graceful degradation
    }
  }

  /**
   * Mark a request as processed and optionally store the result.
   * Use this after successful processing to enable returning cached results.
   *
   * @param key - Unique idempotency key
   * @param result - Optional result to store for later retrieval
   * @param ttl - Optional TTL override in seconds
   * @param metadata - Optional metadata for debugging
   */
  async markProcessed(
    key: string,
    result?: unknown,
    ttl?: number,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    if (!this.redis || !this.isConnected) {
      return; // Graceful degradation - nothing to store
    }

    const fullKey = `${this.KEY_PREFIX}${key}`;
    const entry: IdempotencyEntry = {
      processedAt: new Date().toISOString(),
      result: result ?? null,
      metadata,
    };

    try {
      await this.redis.set(
        fullKey,
        JSON.stringify(entry),
        'EX',
        ttl || this.DEFAULT_TTL,
      );
      this.logger.debug(
        `IdempotencyService: Marked processed with result: ${key}`,
      );
    } catch (error) {
      this.logger.error(
        `IdempotencyService: Error storing result for key "${key}" - ${error instanceof Error ? error.message : String(error)}`,
      );
      // Don't throw - graceful degradation
    }
  }

  /**
   * Get the stored result from a previously processed request.
   *
   * @param key - Unique idempotency key
   * @returns The stored result, or null if not found
   */
  async getStoredResult(key: string): Promise<unknown> {
    if (!this.redis || !this.isConnected) {
      return null; // Graceful degradation
    }

    const fullKey = `${this.KEY_PREFIX}${key}`;

    try {
      const value = await this.redis.get(fullKey);
      if (!value) {
        return null;
      }

      const entry: IdempotencyEntry = JSON.parse(value);
      return entry.result ?? null;
    } catch (error) {
      this.logger.error(
        `IdempotencyService: Error retrieving result for key "${key}" - ${error instanceof Error ? error.message : String(error)}`,
      );
      return null; // Graceful degradation
    }
  }

  /**
   * Get full idempotency check result including metadata.
   *
   * @param key - Unique idempotency key
   * @returns Full idempotency result with status and stored data
   */
  async check(key: string): Promise<IdempotencyResult> {
    if (!this.redis || !this.isConnected) {
      return { isNew: true }; // Graceful degradation
    }

    const fullKey = `${this.KEY_PREFIX}${key}`;

    try {
      const value = await this.redis.get(fullKey);

      if (!value) {
        return { isNew: true };
      }

      const entry: IdempotencyEntry = JSON.parse(value);
      return {
        isNew: false,
        storedResult: entry.result,
        processedAt: entry.processedAt,
      };
    } catch (error) {
      this.logger.error(
        `IdempotencyService: Error checking key "${key}" - ${error instanceof Error ? error.message : String(error)}`,
      );
      return { isNew: true }; // Graceful degradation
    }
  }

  /**
   * Delete an idempotency entry (for testing or manual cleanup).
   *
   * @param key - Unique idempotency key
   * @returns true if deleted, false if not found
   */
  async delete(key: string): Promise<boolean> {
    if (!this.redis || !this.isConnected) {
      return false;
    }

    const fullKey = `${this.KEY_PREFIX}${key}`;

    try {
      const result = await this.redis.del(fullKey);
      return result > 0;
    } catch (error) {
      this.logger.error(
        `IdempotencyService: Error deleting key "${key}" - ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    }
  }

  /**
   * Get the TTL remaining for an idempotency key.
   *
   * @param key - Unique idempotency key
   * @returns TTL in seconds, -1 if no TTL, -2 if key doesn't exist
   */
  async getTTL(key: string): Promise<number> {
    if (!this.redis || !this.isConnected) {
      return -2; // Key doesn't exist
    }

    const fullKey = `${this.KEY_PREFIX}${key}`;

    try {
      return await this.redis.ttl(fullKey);
    } catch (error) {
      this.logger.error(
        `IdempotencyService: Error getting TTL for key "${key}" - ${error instanceof Error ? error.message : String(error)}`,
      );
      return -2;
    }
  }

  /**
   * Generate a standard idempotency key for webhook requests.
   * Combines provider, event type, and unique identifier.
   *
   * @param provider - Webhook provider (e.g., 'sendgrid', 'whatsapp')
   * @param eventId - Unique event identifier
   * @param eventType - Optional event type for additional uniqueness
   * @returns Formatted idempotency key
   */
  static generateKey(
    provider: string,
    eventId: string,
    eventType?: string,
  ): string {
    const parts = [provider, eventId];
    if (eventType) {
      parts.push(eventType);
    }
    return parts.join(':');
  }
}
