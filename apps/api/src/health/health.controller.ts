/**
 * Health Check Controller
 * TASK-INFRA-001: Add Database Health Check
 * TASK-INFRA-002: Add Redis Health Check
 * TASK-INFRA-007: Integrate with Shutdown Service for graceful shutdown
 * TASK-PERF-104: Add Database Pool Health Check
 *
 * Provides health check endpoints for monitoring using @nestjs/terminus:
 * - GET /health - Basic liveness check (fast, no external checks)
 * - GET /health/ready - Readiness check with database, Redis, and pool connectivity
 *
 * The /health/ready endpoint returns:
 * - HTTP 200 when all components are healthy
 * - HTTP 503 when any component is unhealthy (via Terminus @HealthCheck decorator)
 *
 * The /health endpoint returns:
 * - HTTP 200 when app is running and not shutting down
 * - HTTP 503 when app is shutting down (TASK-INFRA-007)
 *
 * This follows Kubernetes health check patterns:
 * - Liveness: Is the app running? (use /health)
 * - Readiness: Is the app ready to receive traffic? (use /health/ready)
 */

import {
  Controller,
  Get,
  Logger,
  HttpStatus,
  HttpException,
  Optional,
} from '@nestjs/common';
import {
  HealthCheckService,
  HealthCheck,
  HealthCheckResult,
} from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../api/auth/decorators/public.decorator';
import { DatabaseHealthIndicator } from './indicators/database.health';
import { RedisHealthIndicator } from './indicators/redis.health';
import { PoolHealthIndicator } from '../database/monitoring/pool-health.indicator';
import { ShutdownService } from '../common/shutdown';

interface LivenessResponse {
  status: 'ok' | 'shutting_down';
  timestamp: string;
  uptime: number;
  version: string;
}

@Controller('health')
@Public()
@SkipThrottle() // TASK-INFRA-003: Health checks should never be rate limited
export class HealthController {
  private readonly logger = new Logger(HealthController.name);
  private readonly startTime = Date.now();

  constructor(
    private readonly health: HealthCheckService,
    private readonly databaseHealth: DatabaseHealthIndicator,
    private readonly redisHealth: RedisHealthIndicator,
    private readonly poolHealth: PoolHealthIndicator,
    @Optional() private readonly shutdownService?: ShutdownService,
  ) {}

  /**
   * Basic liveness check - returns immediately without external checks.
   * Use this for Kubernetes liveness probes.
   * GET /health
   *
   * Returns HTTP 200 if the application is running and not shutting down.
   * Returns HTTP 503 if the application is in shutdown mode (TASK-INFRA-007).
   *
   * During shutdown, load balancers should stop sending traffic to this instance.
   */
  @Get()
  check(): LivenessResponse {
    // TASK-INFRA-007: Return 503 during graceful shutdown
    if (this.shutdownService?.isShuttingDown) {
      throw new HttpException(
        {
          status: 'shutting_down',
          timestamp: new Date().toISOString(),
          uptime: Math.floor((Date.now() - this.startTime) / 1000),
          version: process.env.npm_package_version || '1.0.0',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      version: process.env.npm_package_version || '1.0.0',
    };
  }

  /**
   * Readiness check - verifies database, Redis, and pool connectivity.
   * Use this for Kubernetes readiness probes and load balancer health checks.
   * GET /health/ready
   *
   * Returns:
   * - HTTP 200 with status "ok" when all components are healthy
   * - HTTP 503 with status "error" when any component is unhealthy
   *
   * The @HealthCheck() decorator automatically returns HTTP 503 on failure.
   */
  @Get('ready')
  @HealthCheck()
  async checkReadiness(): Promise<HealthCheckResult> {
    return this.health.check([
      // Database health check with 3 second timeout
      () => this.databaseHealth.isHealthy('database', { timeout: 3000 }),
      // Redis health check with 3 second timeout
      () => this.redisHealth.isHealthy('redis', { timeout: 3000 }),
      // TASK-PERF-104: Database pool health check
      () => this.poolHealth.isHealthy('database_pool'),
    ]);
  }
}
