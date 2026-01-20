/**
 * Metrics Controller
 * TASK-PERF-104: Database Connection Pool Monitoring
 *
 * Exposes Prometheus-formatted metrics endpoint for external monitoring systems.
 * This endpoint is public (no auth required) and not rate-limited to allow
 * frequent scraping by Prometheus.
 */

import { Controller, Get, Header, Logger } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiProduces,
} from '@nestjs/swagger';
import { Public } from '../api/auth/decorators/public.decorator';
import { SkipThrottle } from '@nestjs/throttler';
import { PoolMetricsService } from '../database/monitoring/pool-metrics.service';

@Controller('metrics')
@ApiTags('Metrics')
@Public()
@SkipThrottle()
export class MetricsController {
  private readonly logger = new Logger(MetricsController.name);

  constructor(private readonly poolMetrics: PoolMetricsService) {}

  /**
   * Prometheus metrics endpoint
   *
   * Returns metrics in Prometheus text exposition format (text/plain; version=0.0.4).
   * This endpoint is designed for Prometheus scraping and includes:
   * - Database connection pool metrics
   * - Query performance metrics
   *
   * @returns Prometheus-formatted metrics string
   */
  @Get()
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({
    summary: 'Prometheus metrics endpoint',
    description:
      'Returns application metrics in Prometheus text exposition format for monitoring and alerting',
  })
  @ApiProduces('text/plain')
  @ApiResponse({
    status: 200,
    description: 'Prometheus-formatted metrics',
    content: {
      'text/plain': {
        example: `# HELP prisma_pool_active_connections Number of active database connections
# TYPE prisma_pool_active_connections gauge
prisma_pool_active_connections 5`,
      },
    },
  })
  getMetrics(): string {
    return this.poolMetrics.getPrometheusMetrics();
  }

  /**
   * JSON metrics endpoint for debugging and dashboards
   *
   * Returns pool metrics in JSON format for easier consumption by
   * custom dashboards or debugging tools.
   *
   * @returns Pool metrics in JSON format
   */
  @Get('json')
  @ApiOperation({
    summary: 'JSON metrics endpoint',
    description:
      'Returns database pool metrics in JSON format for debugging and custom dashboards',
  })
  @ApiResponse({
    status: 200,
    description: 'JSON-formatted pool metrics',
    schema: {
      type: 'object',
      properties: {
        activeConnections: { type: 'number', example: 5 },
        idleConnections: { type: 'number', example: 3 },
        totalConnections: { type: 'number', example: 8 },
        waitingRequests: { type: 'number', example: 0 },
        maxConnections: { type: 'number', example: 10 },
        utilizationPercent: { type: 'number', example: 50 },
        averageQueryTimeMs: { type: 'number', example: 12.5 },
        slowQueryCount: { type: 'number', example: 2 },
        totalQueriesTracked: { type: 'number', example: 100 },
        timestamp: { type: 'string', format: 'date-time' },
      },
    },
  })
  getJsonMetrics() {
    return this.poolMetrics.getExtendedMetrics();
  }
}
