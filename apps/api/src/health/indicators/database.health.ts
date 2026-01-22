/**
 * Database Health Indicator
 * TASK-INFRA-001: Add Database Health Check
 *
 * Provides database connectivity health checks using @nestjs/terminus.
 * Executes a simple SELECT 1 query to verify database is reachable and responsive.
 *
 * Features:
 * - Configurable timeout (default 3 seconds)
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
import { PrismaService } from '../../database/prisma/prisma.service';

export interface DatabaseHealthCheckOptions {
  /**
   * Timeout in milliseconds for the health check query.
   * Default: 3000 (3 seconds)
   */
  timeout?: number;
}

@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(DatabaseHealthIndicator.name);
  private readonly DEFAULT_TIMEOUT_MS = 3000;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  /**
   * Check database connectivity by executing SELECT 1.
   *
   * @param key - The key to use in the health check result (e.g., 'database')
   * @param options - Optional configuration including timeout
   * @returns HealthIndicatorResult on success
   * @throws HealthCheckError on failure (Terminus returns HTTP 503)
   */
  async isHealthy(
    key: string,
    options?: DatabaseHealthCheckOptions,
  ): Promise<HealthIndicatorResult> {
    const timeoutMs = options?.timeout ?? this.DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();

    try {
      // Execute query with timeout
      const result = await this.executeWithTimeout(timeoutMs);

      if (!result) {
        throw new Error('Database query returned no result');
      }

      const responseTimeMs = Date.now() - startTime;

      this.logger.debug(`Database health check passed in ${responseTimeMs}ms`);

      return this.getStatus(key, true, {
        status: 'connected',
        responseTimeMs,
      });
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown database error';

      this.logger.error(
        `Database health check failed after ${responseTimeMs}ms: ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      // Throw HealthCheckError for Terminus to return HTTP 503
      throw new HealthCheckError(
        'Database check failed',
        this.getStatus(key, false, {
          status: 'disconnected',
          responseTimeMs,
          error: errorMessage,
        }),
      );
    }
  }

  /**
   * Execute database query with timeout protection.
   * Prevents health check from hanging indefinitely if database is unresponsive.
   */
  private executeWithTimeout(timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(
          new Error(`Database health check timed out after ${timeoutMs}ms`),
        );
      }, timeoutMs);

      this.prisma.$queryRaw`SELECT 1 AS health_check`
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
