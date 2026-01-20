/**
 * Metrics Module
 * TASK-PERF-104: Database Connection Pool Monitoring
 *
 * Provides the /metrics endpoint for Prometheus scraping and monitoring.
 * Imports MonitoringModule to access pool metrics service.
 */

import { Module } from '@nestjs/common';
import { MetricsController } from './metrics.controller';
import { MonitoringModule } from '../database/monitoring/monitoring.module';

@Module({
  imports: [MonitoringModule],
  controllers: [MetricsController],
})
export class MetricsModule {}
