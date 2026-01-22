/**
 * Redis Health Indicator
 * TASK-INFRA-002: Add Redis Health Check
 *
 * Provides Redis connectivity health checks using @nestjs/terminus.
 * Executes PING command to verify Redis is reachable and responsive.
 *
 * Features:
 * - Configurable timeout (default 3 seconds)
 * - Connection state verification
 * - Detailed error reporting
 * - Response time tracking
 * - Automatic HTTP 503 on failure via Terminus integration
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { RedisService } from '../../common/redis/redis.service';

export interface RedisHealthCheckOptions {
  /**
   * Timeout in milliseconds for the health check.
   * Default: 3000 (3 seconds)
   */
  timeout?: number;
}

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(RedisHealthIndicator.name);
  private readonly DEFAULT_TIMEOUT_MS = 3000;

  constructor(private readonly redis: RedisService) {
    super();
  }

  /**
   * Check Redis connectivity by executing PING command.
   *
   * @param key - The key to use in the health check result (e.g., 'redis')
   * @param options - Optional configuration including timeout
   * @returns HealthIndicatorResult on success
   * @throws HealthCheckError on failure (Terminus returns HTTP 503)
   */
  async isHealthy(
    key: string,
    options?: RedisHealthCheckOptions,
  ): Promise<HealthIndicatorResult> {
    const timeoutMs = options?.timeout ?? this.DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();

    try {
      // First check if client is connected
      if (!this.redis.isReady()) {
        throw new Error('Redis client not connected');
      }

      // Execute ping with timeout
      const pongReceived = await this.executeWithTimeout(timeoutMs);

      if (!pongReceived) {
        throw new Error('Redis PING did not receive PONG response');
      }

      const responseTimeMs = Date.now() - startTime;

      this.logger.debug(`Redis health check passed in ${responseTimeMs}ms`);

      return this.getStatus(key, true, {
        status: 'connected',
        responseTimeMs,
      });
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown Redis error';

      this.logger.error(
        `Redis health check failed after ${responseTimeMs}ms: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Throw HealthCheckError for Terminus to return HTTP 503
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, {
          status: 'disconnected',
          responseTimeMs,
          error: errorMessage,
        }),
      );
    }
  }

  /**
   * Execute Redis PING with timeout protection.
   * Prevents health check from hanging indefinitely if Redis is unresponsive.
   */
  private executeWithTimeout(timeoutMs: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Redis health check timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.redis
        .ping()
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error: unknown) => {
          clearTimeout(timeoutId);
          reject(error instanceof Error ? error : new Error(String(error)));
        });
    });
  }
}
