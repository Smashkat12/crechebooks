/**
 * Metrics Controller Tests
 * TASK-PERF-104: Database Connection Pool Monitoring
 */

import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from '../metrics.controller';
import {
  PoolMetricsService,
  ExtendedPoolMetrics,
} from '../../database/monitoring/pool-metrics.service';

describe('MetricsController', () => {
  let controller: MetricsController;
  let mockPoolMetricsService: {
    getPrometheusMetrics: jest.Mock;
    getExtendedMetrics: jest.Mock;
  };

  const mockPrometheusOutput = `# HELP prisma_pool_active_connections Number of active database connections
# TYPE prisma_pool_active_connections gauge
prisma_pool_active_connections 5
# HELP prisma_pool_idle_connections Number of idle connections
# TYPE prisma_pool_idle_connections gauge
prisma_pool_idle_connections 3`;

  const mockExtendedMetrics: ExtendedPoolMetrics = {
    activeConnections: 5,
    idleConnections: 3,
    totalConnections: 8,
    waitingRequests: 0,
    maxConnections: 10,
    utilizationPercent: 50,
    averageQueryTimeMs: 12.5,
    slowQueryCount: 2,
    totalQueriesTracked: 100,
    timestamp: new Date('2024-01-15T12:00:00Z'),
  };

  beforeEach(async () => {
    mockPoolMetricsService = {
      getPrometheusMetrics: jest.fn(() => mockPrometheusOutput),
      getExtendedMetrics: jest.fn(() => mockExtendedMetrics),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        {
          provide: PoolMetricsService,
          useValue: mockPoolMetricsService,
        },
      ],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMetrics', () => {
    it('should return Prometheus-formatted metrics string', () => {
      const result = controller.getMetrics();

      expect(result).toBe(mockPrometheusOutput);
      expect(mockPoolMetricsService.getPrometheusMetrics).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should return metrics with proper Prometheus format', () => {
      const result = controller.getMetrics();

      // Verify format includes required elements
      expect(result).toContain('# HELP');
      expect(result).toContain('# TYPE');
      expect(result).toContain('gauge');
    });
  });

  describe('getJsonMetrics', () => {
    it('should return extended metrics in JSON format', () => {
      const result = controller.getJsonMetrics();

      expect(result).toEqual(mockExtendedMetrics);
      expect(mockPoolMetricsService.getExtendedMetrics).toHaveBeenCalledTimes(
        1,
      );
    });

    it('should include all expected fields', () => {
      const result = controller.getJsonMetrics();

      expect(result).toHaveProperty('activeConnections');
      expect(result).toHaveProperty('idleConnections');
      expect(result).toHaveProperty('totalConnections');
      expect(result).toHaveProperty('waitingRequests');
      expect(result).toHaveProperty('maxConnections');
      expect(result).toHaveProperty('utilizationPercent');
      expect(result).toHaveProperty('averageQueryTimeMs');
      expect(result).toHaveProperty('slowQueryCount');
      expect(result).toHaveProperty('totalQueriesTracked');
      expect(result).toHaveProperty('timestamp');
    });

    it('should return numeric values for metrics', () => {
      const result = controller.getJsonMetrics();

      expect(typeof result.activeConnections).toBe('number');
      expect(typeof result.idleConnections).toBe('number');
      expect(typeof result.totalConnections).toBe('number');
      expect(typeof result.waitingRequests).toBe('number');
      expect(typeof result.maxConnections).toBe('number');
      expect(typeof result.utilizationPercent).toBe('number');
      expect(typeof result.averageQueryTimeMs).toBe('number');
      expect(typeof result.slowQueryCount).toBe('number');
    });
  });
});
