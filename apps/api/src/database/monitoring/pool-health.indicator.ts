/**
 * Pool Health Indicator
 * TASK-PERF-104: Database Connection Pool Monitoring
 *
 * Provides health check integration with @nestjs/terminus for the database
 * connection pool. Reports health status based on pool utilization thresholds.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { PoolMetricsService } from './pool-metrics.service';

/**
 * Health check options for pool indicator
 */
export interface PoolHealthOptions {
  warningThreshold?: number;
  criticalThreshold?: number;
}

@Injectable()
export class PoolHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(PoolHealthIndicator.name);

  // Default thresholds - can be overridden via options
  private readonly DEFAULT_WARNING_THRESHOLD = 80;
  private readonly DEFAULT_CRITICAL_THRESHOLD = 95;

  constructor(private readonly poolMetrics: PoolMetricsService) {
    super();
  }

  /**
   * Check if the database pool is healthy
   *
   * @param key - The key to use in the health check result
   * @param options - Optional configuration for thresholds
   * @returns Health indicator result
   * @throws HealthCheckError if pool utilization exceeds critical threshold
   */
  async isHealthy(
    key: string = 'database_pool',
    options?: PoolHealthOptions,
  ): Promise<HealthIndicatorResult> {
    const warningThreshold =
      options?.warningThreshold ?? this.DEFAULT_WARNING_THRESHOLD;
    const criticalThreshold =
      options?.criticalThreshold ?? this.DEFAULT_CRITICAL_THRESHOLD;

    const metrics = this.poolMetrics.getMetrics();
    const utilization = metrics.utilizationPercent;

    const details = {
      utilization: `${utilization}%`,
      active: metrics.activeConnections,
      idle: metrics.idleConnections,
      total: metrics.totalConnections,
      waiting: metrics.waitingRequests,
      max: metrics.maxConnections,
      status: this.getStatusLabel(
        utilization,
        warningThreshold,
        criticalThreshold,
      ),
    };

    // Critical: exceeds critical threshold - report unhealthy
    if (utilization >= criticalThreshold) {
      this.logger.error(
        `Pool utilization CRITICAL: ${utilization}% (threshold: ${criticalThreshold}%)`,
        { metrics: details },
      );
      throw new HealthCheckError(
        `Database pool utilization at ${utilization}% exceeds critical threshold of ${criticalThreshold}%`,
        this.getStatus(key, false, details),
      );
    }

    // Check for waiting requests - this is always concerning
    if (metrics.waitingRequests > 0) {
      this.logger.warn(
        `Pool has ${metrics.waitingRequests} waiting requests - connections exhausted`,
        { metrics: details },
      );
      // Don't fail but mark as degraded in details
      details.status = 'degraded';
    }

    // Warning: exceeds warning threshold but below critical (still healthy but log warning)
    if (utilization >= warningThreshold) {
      this.logger.warn(
        `Pool utilization HIGH: ${utilization}% (warning threshold: ${warningThreshold}%)`,
        { metrics: details },
      );
      details.status = 'warning';
    }

    return this.getStatus(key, true, details);
  }

  /**
   * Get a descriptive status label based on utilization
   */
  private getStatusLabel(
    utilization: number,
    warningThreshold: number,
    criticalThreshold: number,
  ): string {
    if (utilization >= criticalThreshold) {
      return 'critical';
    }
    if (utilization >= warningThreshold) {
      return 'warning';
    }
    return 'healthy';
  }
}
