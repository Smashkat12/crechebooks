/**
 * Pool Metrics Service
 * TASK-PERF-104: Database Connection Pool Monitoring
 *
 * Collects and exposes metrics from the pg.Pool used by PrismaService.
 * Provides both JSON metrics and Prometheus-formatted output for monitoring.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Pool } from 'pg';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Pool metrics in JSON format
 */
export interface PoolMetrics {
  activeConnections: number;
  idleConnections: number;
  totalConnections: number;
  waitingRequests: number;
  maxConnections: number;
  utilizationPercent: number;
  timestamp: Date;
}

/**
 * Extended metrics including query performance data
 */
export interface ExtendedPoolMetrics extends PoolMetrics {
  averageQueryTimeMs: number;
  slowQueryCount: number;
  totalQueriesTracked: number;
}

/**
 * Prometheus metric format
 */
export interface PrometheusMetric {
  name: string;
  type: 'gauge' | 'counter' | 'histogram';
  help: string;
  value: number;
  labels?: Record<string, string>;
}

@Injectable()
export class PoolMetricsService {
  private readonly logger = new Logger(PoolMetricsService.name);
  private readonly maxConnections: number;
  private slowQueryCount = 0;
  private queryDurations: number[] = [];
  private readonly slowQueryThresholdMs = 100;
  private readonly maxTrackedDurations = 1000;

  constructor(private readonly prisma: PrismaService) {
    // Default pg pool size is 10, can be configured via DATABASE_POOL_SIZE
    this.maxConnections = parseInt(process.env.DATABASE_POOL_SIZE || '10', 10);
    this.logger.log(
      `Pool metrics service initialized with max connections: ${this.maxConnections}`,
    );
  }

  /**
   * Get the pg.Pool instance from PrismaService
   * Uses the public getPool() method
   */
  private getPool(): Pool {
    return this.prisma.getPool();
  }

  /**
   * Get basic pool metrics
   */
  getMetrics(): PoolMetrics {
    const pool = this.getPool();

    const totalConnections = pool.totalCount;
    const idleConnections = pool.idleCount;
    const activeConnections = totalConnections - idleConnections;
    const waitingRequests = pool.waitingCount;

    const utilizationPercent =
      this.maxConnections > 0
        ? Math.round((activeConnections / this.maxConnections) * 100)
        : 0;

    return {
      activeConnections,
      idleConnections,
      totalConnections,
      waitingRequests,
      maxConnections: this.maxConnections,
      utilizationPercent,
      timestamp: new Date(),
    };
  }

  /**
   * Get extended metrics including query performance data
   */
  getExtendedMetrics(): ExtendedPoolMetrics {
    const metrics = this.getMetrics();

    return {
      ...metrics,
      averageQueryTimeMs: this.getAverageQueryTime(),
      slowQueryCount: this.slowQueryCount,
      totalQueriesTracked: this.queryDurations.length,
    };
  }

  /**
   * Generate Prometheus-formatted metrics string
   */
  getPrometheusMetrics(): string {
    const metrics = this.getMetrics();
    const lines: string[] = [];

    // Helper to add metric with HELP and TYPE annotations
    const addMetric = (
      name: string,
      type: string,
      help: string,
      value: number,
      labels?: Record<string, string>,
    ) => {
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${type}`);

      if (labels && Object.keys(labels).length > 0) {
        const labelStr = Object.entries(labels)
          .map(([k, v]) => `${k}="${v}"`)
          .join(',');
        lines.push(`${name}{${labelStr}} ${value}`);
      } else {
        lines.push(`${name} ${value}`);
      }
    };

    // Connection pool metrics
    addMetric(
      'prisma_pool_active_connections',
      'gauge',
      'Number of active database connections currently in use',
      metrics.activeConnections,
    );

    addMetric(
      'prisma_pool_idle_connections',
      'gauge',
      'Number of idle connections available in the pool',
      metrics.idleConnections,
    );

    addMetric(
      'prisma_pool_total_connections',
      'gauge',
      'Total number of connections in the pool (active + idle)',
      metrics.totalConnections,
    );

    addMetric(
      'prisma_pool_waiting_requests',
      'gauge',
      'Number of requests waiting for an available connection',
      metrics.waitingRequests,
    );

    addMetric(
      'prisma_pool_max_connections',
      'gauge',
      'Maximum number of connections allowed in the pool',
      metrics.maxConnections,
    );

    addMetric(
      'prisma_pool_utilization_percent',
      'gauge',
      'Current pool utilization as a percentage of max connections',
      metrics.utilizationPercent,
    );

    // Query performance metrics
    addMetric(
      'prisma_slow_queries_total',
      'counter',
      `Total count of queries exceeding ${this.slowQueryThresholdMs}ms threshold`,
      this.slowQueryCount,
    );

    addMetric(
      'prisma_query_avg_duration_ms',
      'gauge',
      'Average query duration in milliseconds (rolling window)',
      Math.round(this.getAverageQueryTime() * 100) / 100,
    );

    addMetric(
      'prisma_queries_tracked_total',
      'gauge',
      'Total number of queries in the rolling tracking window',
      this.queryDurations.length,
    );

    return lines.join('\n');
  }

  /**
   * Record a query duration for tracking
   * @param durationMs Query duration in milliseconds
   */
  recordQueryDuration(durationMs: number): void {
    // Track slow queries
    if (durationMs > this.slowQueryThresholdMs) {
      this.slowQueryCount++;
      this.logger.debug(`Slow query detected: ${durationMs}ms`);
    }

    // Maintain rolling window of query durations
    this.queryDurations.push(durationMs);
    if (this.queryDurations.length > this.maxTrackedDurations) {
      this.queryDurations.shift();
    }
  }

  /**
   * Get average query time from tracked queries
   */
  getAverageQueryTime(): number {
    if (this.queryDurations.length === 0) return 0;
    const sum = this.queryDurations.reduce((a, b) => a + b, 0);
    return sum / this.queryDurations.length;
  }

  /**
   * Get total slow query count
   */
  getSlowQueryCount(): number {
    return this.slowQueryCount;
  }

  /**
   * Get the 95th percentile query time
   */
  getP95QueryTime(): number {
    if (this.queryDurations.length === 0) return 0;
    const sorted = [...this.queryDurations].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * 0.95);
    return sorted[index] || 0;
  }

  /**
   * Reset query tracking (useful for testing or periodic resets)
   */
  resetQueryTracking(): void {
    this.slowQueryCount = 0;
    this.queryDurations = [];
    this.logger.debug('Query tracking reset');
  }

  /**
   * Check if pool is under pressure (high utilization or waiting requests)
   */
  isPoolUnderPressure(): boolean {
    const metrics = this.getMetrics();
    return metrics.utilizationPercent > 80 || metrics.waitingRequests > 0;
  }
}
