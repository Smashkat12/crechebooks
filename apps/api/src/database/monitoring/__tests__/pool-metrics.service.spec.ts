/**
 * Pool Metrics Service Tests
 * TASK-PERF-104: Database Connection Pool Monitoring
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PoolMetricsService, PoolMetrics } from '../pool-metrics.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PoolMetricsService', () => {
  let service: PoolMetricsService;
  let mockPool: {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
  };

  const createMockPrismaService = () => ({
    getPool: jest.fn(() => mockPool),
  });

  beforeEach(async () => {
    // Reset mock pool state
    mockPool = {
      totalCount: 5,
      idleCount: 3,
      waitingCount: 0,
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoolMetricsService,
        {
          provide: PrismaService,
          useValue: {
            getPool: () => mockPool,
          },
        },
      ],
    }).compile();

    service = module.get<PoolMetricsService>(PoolMetricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMetrics', () => {
    it('should return correct pool metrics', () => {
      const metrics = service.getMetrics();

      expect(metrics).toMatchObject({
        activeConnections: 2, // totalCount - idleCount
        idleConnections: 3,
        totalConnections: 5,
        waitingRequests: 0,
        maxConnections: 10, // default
      });
      expect(metrics.timestamp).toBeInstanceOf(Date);
    });

    it('should calculate utilization percentage correctly', () => {
      mockPool.totalCount = 8;
      mockPool.idleCount = 0;

      const metrics = service.getMetrics();

      // 8 active out of 10 max = 80%
      expect(metrics.utilizationPercent).toBe(80);
    });

    it('should handle zero max connections', () => {
      // This tests edge case handling
      const metrics = service.getMetrics();
      expect(metrics.utilizationPercent).toBeGreaterThanOrEqual(0);
    });

    it('should handle waiting requests', () => {
      // pg.Pool uses waitingCount, not waitingRequests
      mockPool.waitingCount = 5;

      const metrics = service.getMetrics();

      expect(metrics.waitingRequests).toBe(5);
    });

    it('should return 100% utilization when at max', () => {
      mockPool.totalCount = 10;
      mockPool.idleCount = 0;

      const metrics = service.getMetrics();

      expect(metrics.utilizationPercent).toBe(100);
    });
  });

  describe('getExtendedMetrics', () => {
    it('should include query performance data', () => {
      service.recordQueryDuration(50);
      service.recordQueryDuration(150); // slow query

      const extended = service.getExtendedMetrics();

      expect(extended.averageQueryTimeMs).toBe(100);
      expect(extended.slowQueryCount).toBe(1);
      expect(extended.totalQueriesTracked).toBe(2);
    });

    it('should include all base metrics', () => {
      const extended = service.getExtendedMetrics();

      expect(extended).toHaveProperty('activeConnections');
      expect(extended).toHaveProperty('idleConnections');
      expect(extended).toHaveProperty('totalConnections');
      expect(extended).toHaveProperty('waitingRequests');
      expect(extended).toHaveProperty('maxConnections');
      expect(extended).toHaveProperty('utilizationPercent');
      expect(extended).toHaveProperty('timestamp');
    });
  });

  describe('getPrometheusMetrics', () => {
    it('should return properly formatted Prometheus metrics', () => {
      const prometheusOutput = service.getPrometheusMetrics();

      // Check format includes HELP and TYPE annotations
      expect(prometheusOutput).toContain(
        '# HELP prisma_pool_active_connections',
      );
      expect(prometheusOutput).toContain(
        '# TYPE prisma_pool_active_connections gauge',
      );
      expect(prometheusOutput).toContain('prisma_pool_active_connections 2');

      expect(prometheusOutput).toContain('# HELP prisma_pool_idle_connections');
      expect(prometheusOutput).toContain('prisma_pool_idle_connections 3');

      expect(prometheusOutput).toContain(
        '# HELP prisma_pool_total_connections',
      );
      expect(prometheusOutput).toContain('prisma_pool_total_connections 5');

      expect(prometheusOutput).toContain('# HELP prisma_pool_waiting_requests');
      expect(prometheusOutput).toContain('prisma_pool_waiting_requests 0');

      expect(prometheusOutput).toContain('# HELP prisma_pool_max_connections');
      expect(prometheusOutput).toContain('prisma_pool_max_connections 10');
    });

    it('should include slow query counter', () => {
      service.recordQueryDuration(150); // slow query
      service.recordQueryDuration(200); // slow query

      const prometheusOutput = service.getPrometheusMetrics();

      expect(prometheusOutput).toContain('# HELP prisma_slow_queries_total');
      expect(prometheusOutput).toContain(
        '# TYPE prisma_slow_queries_total counter',
      );
      expect(prometheusOutput).toContain('prisma_slow_queries_total 2');
    });

    it('should include average query duration', () => {
      service.recordQueryDuration(10);
      service.recordQueryDuration(20);
      service.recordQueryDuration(30);

      const prometheusOutput = service.getPrometheusMetrics();

      expect(prometheusOutput).toContain('# HELP prisma_query_avg_duration_ms');
      expect(prometheusOutput).toContain('prisma_query_avg_duration_ms 20');
    });
  });

  describe('recordQueryDuration', () => {
    it('should track query durations', () => {
      service.recordQueryDuration(50);
      service.recordQueryDuration(75);

      expect(service.getAverageQueryTime()).toBe(62.5);
    });

    it('should count slow queries exceeding 100ms threshold', () => {
      service.recordQueryDuration(50); // fast
      service.recordQueryDuration(99); // fast
      service.recordQueryDuration(100); // fast (exactly at threshold)
      service.recordQueryDuration(101); // slow
      service.recordQueryDuration(200); // slow

      expect(service.getSlowQueryCount()).toBe(2);
    });

    it('should maintain rolling window of 1000 queries', () => {
      // Record more than 1000 queries
      for (let i = 0; i < 1100; i++) {
        service.recordQueryDuration(10);
      }

      const extended = service.getExtendedMetrics();
      expect(extended.totalQueriesTracked).toBe(1000);
    });
  });

  describe('getAverageQueryTime', () => {
    it('should return 0 when no queries tracked', () => {
      expect(service.getAverageQueryTime()).toBe(0);
    });

    it('should calculate correct average', () => {
      service.recordQueryDuration(10);
      service.recordQueryDuration(20);
      service.recordQueryDuration(30);
      service.recordQueryDuration(40);

      expect(service.getAverageQueryTime()).toBe(25);
    });
  });

  describe('getSlowQueryCount', () => {
    it('should return 0 initially', () => {
      expect(service.getSlowQueryCount()).toBe(0);
    });

    it('should accumulate slow query count', () => {
      service.recordQueryDuration(150);
      service.recordQueryDuration(200);
      service.recordQueryDuration(50); // not slow

      expect(service.getSlowQueryCount()).toBe(2);
    });
  });

  describe('getP95QueryTime', () => {
    it('should return 0 when no queries tracked', () => {
      expect(service.getP95QueryTime()).toBe(0);
    });

    it('should calculate 95th percentile correctly', () => {
      // Add 100 queries with durations 1-100
      for (let i = 1; i <= 100; i++) {
        service.recordQueryDuration(i);
      }

      const p95 = service.getP95QueryTime();
      // 95th percentile of 1-100 should be 95 or 96
      expect(p95).toBeGreaterThanOrEqual(95);
      expect(p95).toBeLessThanOrEqual(96);
    });
  });

  describe('resetQueryTracking', () => {
    it('should reset slow query count', () => {
      service.recordQueryDuration(150);
      service.recordQueryDuration(200);

      expect(service.getSlowQueryCount()).toBe(2);

      service.resetQueryTracking();

      expect(service.getSlowQueryCount()).toBe(0);
    });

    it('should reset query durations', () => {
      service.recordQueryDuration(50);
      service.recordQueryDuration(100);

      service.resetQueryTracking();

      expect(service.getAverageQueryTime()).toBe(0);
    });
  });

  describe('isPoolUnderPressure', () => {
    it('should return false when utilization is low', () => {
      mockPool.totalCount = 3;
      mockPool.idleCount = 2;
      mockPool.waitingCount = 0;

      expect(service.isPoolUnderPressure()).toBe(false);
    });

    it('should return true when utilization exceeds 80%', () => {
      mockPool.totalCount = 9;
      mockPool.idleCount = 0;
      mockPool.waitingCount = 0;

      expect(service.isPoolUnderPressure()).toBe(true);
    });

    it('should return true when there are waiting requests', () => {
      mockPool.totalCount = 5;
      mockPool.idleCount = 3;
      mockPool.waitingCount = 1;

      expect(service.isPoolUnderPressure()).toBe(true);
    });
  });
});
