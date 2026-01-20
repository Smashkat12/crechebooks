/**
 * Monitoring Module
 * TASK-PERF-104: Database Connection Pool Monitoring
 *
 * Provides database pool monitoring capabilities including metrics collection
 * and health indicators. This module should be imported by both HealthModule
 * and MetricsModule.
 */

import { Module } from '@nestjs/common';
import { PoolMetricsService } from './pool-metrics.service';
import { PoolHealthIndicator } from './pool-health.indicator';
import { DatabaseModule } from '../database.module';

@Module({
  imports: [DatabaseModule],
  providers: [PoolMetricsService, PoolHealthIndicator],
  exports: [PoolMetricsService, PoolHealthIndicator],
})
export class MonitoringModule {}
