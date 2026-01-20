/**
 * Pool Health Indicator Tests
 * TASK-PERF-104: Database Connection Pool Monitoring
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HealthCheckError } from '@nestjs/terminus';
import { PoolHealthIndicator } from '../pool-health.indicator';
import { PoolMetricsService, PoolMetrics } from '../pool-metrics.service';

describe('PoolHealthIndicator', () => {
  let indicator: PoolHealthIndicator;
  let mockPoolMetricsService: {
    getMetrics: jest.Mock<PoolMetrics>;
  };

  const createMockMetrics = (
    overrides: Partial<PoolMetrics> = {},
  ): PoolMetrics => ({
    activeConnections: 2,
    idleConnections: 3,
    totalConnections: 5,
    waitingRequests: 0,
    maxConnections: 10,
    utilizationPercent: 20,
    timestamp: new Date(),
    ...overrides,
  });

  beforeEach(async () => {
    mockPoolMetricsService = {
      getMetrics: jest.fn(() => createMockMetrics()),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PoolHealthIndicator,
        {
          provide: PoolMetricsService,
          useValue: mockPoolMetricsService,
        },
      ],
    }).compile();

    indicator = module.get<PoolHealthIndicator>(PoolHealthIndicator);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isHealthy', () => {
    it('should return healthy status when utilization is low', async () => {
      mockPoolMetricsService.getMetrics.mockReturnValue(
        createMockMetrics({ utilizationPercent: 30 }),
      );

      const result = await indicator.isHealthy('database_pool');

      expect(result).toEqual({
        database_pool: {
          status: 'up',
          utilization: '30%',
          active: 2,
          idle: 3,
          total: 5,
          waiting: 0,
          max: 10,
          status: 'healthy',
        },
      });
    });

    it('should return healthy with warning status when utilization exceeds 80%', async () => {
      mockPoolMetricsService.getMetrics.mockReturnValue(
        createMockMetrics({
          utilizationPercent: 85,
          activeConnections: 8,
          idleConnections: 0,
        }),
      );

      const result = await indicator.isHealthy('database_pool');

      // The indicator is still "healthy" (doesn't throw), but status field shows "warning"
      expect(result.database_pool).toMatchObject({
        utilization: '85%',
        status: 'warning',
      });
    });

    it('should throw HealthCheckError when utilization exceeds 95%', async () => {
      mockPoolMetricsService.getMetrics.mockReturnValue(
        createMockMetrics({
          utilizationPercent: 96,
          activeConnections: 10,
          idleConnections: 0,
        }),
      );

      await expect(indicator.isHealthy('database_pool')).rejects.toThrow(
        HealthCheckError,
      );
    });

    it('should throw HealthCheckError with correct message at critical threshold', async () => {
      mockPoolMetricsService.getMetrics.mockReturnValue(
        createMockMetrics({ utilizationPercent: 97 }),
      );

      try {
        await indicator.isHealthy('database_pool');
        fail('Expected HealthCheckError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HealthCheckError);
        expect((error as HealthCheckError).message).toContain('97%');
        expect((error as HealthCheckError).message).toContain('95%');
      }
    });

    it('should use custom key in result', async () => {
      const result = await indicator.isHealthy('custom_key');

      expect(result).toHaveProperty('custom_key');
      expect(result.custom_key.status).toBe('healthy');
    });

    it('should use default key when not provided', async () => {
      const result = await indicator.isHealthy();

      expect(result).toHaveProperty('database_pool');
    });

    it('should allow custom thresholds via options', async () => {
      mockPoolMetricsService.getMetrics.mockReturnValue(
        createMockMetrics({ utilizationPercent: 70 }),
      );

      // With default thresholds (80% warning), 70% should be healthy
      const result1 = await indicator.isHealthy('pool');
      expect(result1.pool.status).toBe('healthy');

      // With custom warning threshold of 60%, 70% should show warning
      const result2 = await indicator.isHealthy('pool', {
        warningThreshold: 60,
      });
      expect(result2.pool.status).toBe('warning');
    });

    it('should allow custom critical threshold via options', async () => {
      mockPoolMetricsService.getMetrics.mockReturnValue(
        createMockMetrics({ utilizationPercent: 85 }),
      );

      // With default critical threshold (95%), 85% should not throw
      await expect(indicator.isHealthy('pool')).resolves.toBeDefined();

      // With custom critical threshold of 80%, 85% should throw
      await expect(
        indicator.isHealthy('pool', { criticalThreshold: 80 }),
      ).rejects.toThrow(HealthCheckError);
    });

    it('should mark as degraded when there are waiting requests', async () => {
      mockPoolMetricsService.getMetrics.mockReturnValue(
        createMockMetrics({ waitingRequests: 2, utilizationPercent: 50 }),
      );

      const result = await indicator.isHealthy('pool');

      // The indicator is still "healthy" (doesn't throw), but status field shows "degraded"
      expect(result.pool).toMatchObject({
        waiting: 2,
        status: 'degraded',
      });
    });

    it('should include all metric details in result', async () => {
      mockPoolMetricsService.getMetrics.mockReturnValue(
        createMockMetrics({
          activeConnections: 4,
          idleConnections: 6,
          totalConnections: 10,
          waitingRequests: 0,
          maxConnections: 20,
          utilizationPercent: 20,
        }),
      );

      const result = await indicator.isHealthy('pool');

      expect(result.pool).toMatchObject({
        active: 4,
        idle: 6,
        total: 10,
        waiting: 0,
        max: 20,
        utilization: '20%',
      });
    });
  });

  describe('edge cases', () => {
    it('should handle exactly 80% utilization as warning', async () => {
      mockPoolMetricsService.getMetrics.mockReturnValue(
        createMockMetrics({ utilizationPercent: 80 }),
      );

      const result = await indicator.isHealthy('pool');

      expect(result.pool.status).toBe('warning');
    });

    it('should handle exactly 95% utilization as critical', async () => {
      mockPoolMetricsService.getMetrics.mockReturnValue(
        createMockMetrics({ utilizationPercent: 95 }),
      );

      await expect(indicator.isHealthy('pool')).rejects.toThrow(
        HealthCheckError,
      );
    });

    it('should handle 0% utilization', async () => {
      mockPoolMetricsService.getMetrics.mockReturnValue(
        createMockMetrics({
          activeConnections: 0,
          idleConnections: 10,
          utilizationPercent: 0,
        }),
      );

      const result = await indicator.isHealthy('pool');

      // With 0% utilization, result should be healthy
      expect(result.pool).toMatchObject({
        utilization: '0%',
        status: 'healthy',
      });
    });

    it('should handle 100% utilization as critical', async () => {
      mockPoolMetricsService.getMetrics.mockReturnValue(
        createMockMetrics({ utilizationPercent: 100 }),
      );

      await expect(indicator.isHealthy('pool')).rejects.toThrow(
        HealthCheckError,
      );
    });
  });
});
