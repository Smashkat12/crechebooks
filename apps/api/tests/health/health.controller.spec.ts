/**
 * Health Controller Tests
 * TASK-INFRA-001: Add Database Health Check
 * TASK-INFRA-002: Add Redis Health Check
 * TASK-INFRA-007: Add Shutdown Service Integration
 *
 * Tests health check functionality using @nestjs/terminus.
 * Verifies proper HTTP status codes (200 for healthy, 503 for unhealthy).
 * Verifies 503 is returned during graceful shutdown.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { HttpException, HttpStatus } from '@nestjs/common';
import { HealthCheckService, HealthCheckResult } from '@nestjs/terminus';
import { HealthController } from '../../src/health/health.controller';
import { DatabaseHealthIndicator } from '../../src/health/indicators/database.health';
import { RedisHealthIndicator } from '../../src/health/indicators/redis.health';
import { PoolHealthIndicator } from '../../src/database/monitoring/pool-health.indicator';
import { ShutdownService } from '../../src/common/shutdown';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { RedisService } from '../../src/common/redis/redis.service';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: jest.Mocked<HealthCheckService>;
  let mockShutdownService: { isShuttingDown: boolean };

  beforeEach(async () => {
    const mockPrismaService = {
      $queryRaw: jest.fn(),
    };

    const mockRedisService = {
      isReady: jest.fn(),
      ping: jest.fn(),
    };

    const mockHealthCheckService = {
      check: jest.fn(),
    };

    // TASK-INFRA-007: Mock shutdown service
    mockShutdownService = {
      isShuttingDown: false,
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        {
          provide: HealthCheckService,
          useValue: mockHealthCheckService,
        },
        {
          provide: DatabaseHealthIndicator,
          useFactory: () =>
            new DatabaseHealthIndicator(
              mockPrismaService as unknown as PrismaService,
            ),
        },
        {
          provide: RedisHealthIndicator,
          useFactory: () =>
            new RedisHealthIndicator(
              mockRedisService as unknown as RedisService,
            ),
        },
        {
          provide: PoolHealthIndicator,
          useValue: {
            isHealthy: jest.fn().mockReturnValue({
              database_pool: { status: 'up' },
            }),
          },
        },
        {
          provide: ShutdownService,
          useValue: mockShutdownService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    healthCheckService = module.get(HealthCheckService);
  });

  describe('check (liveness)', () => {
    it('should return ok status', () => {
      const result = controller.check();

      expect(result.status).toBe('ok');
      expect(result.timestamp).toBeDefined();
      expect(typeof result.timestamp).toBe('string');
      expect(result.uptime).toBeGreaterThanOrEqual(0);
      expect(result.version).toBeDefined();
    });

    it('should return valid ISO timestamp', () => {
      const result = controller.check();

      // Verify it's a valid ISO date string
      const parsedDate = new Date(result.timestamp);
      expect(parsedDate.toISOString()).toBe(result.timestamp);
    });

    // TASK-INFRA-007: Shutdown integration tests
    it('should throw 503 when app is shutting down', () => {
      mockShutdownService.isShuttingDown = true;

      expect(() => controller.check()).toThrow(HttpException);

      try {
        controller.check();
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);

        const response = httpError.getResponse() as Record<string, unknown>;
        expect(response.status).toBe('shutting_down');
        expect(response.timestamp).toBeDefined();
        expect(response.uptime).toBeGreaterThanOrEqual(0);
        expect(response.version).toBeDefined();
      }
    });

    it('should return ok when shutdown service is not injected', async () => {
      // Create controller without shutdown service
      const mockHealthCheckService = { check: jest.fn() };
      const mockPrismaService = { $queryRaw: jest.fn() };
      const mockRedisService = { isReady: jest.fn(), ping: jest.fn() };

      const module = await Test.createTestingModule({
        controllers: [HealthController],
        providers: [
          { provide: HealthCheckService, useValue: mockHealthCheckService },
          {
            provide: DatabaseHealthIndicator,
            useFactory: () =>
              new DatabaseHealthIndicator(
                mockPrismaService as unknown as PrismaService,
              ),
          },
          {
            provide: RedisHealthIndicator,
            useFactory: () =>
              new RedisHealthIndicator(
                mockRedisService as unknown as RedisService,
              ),
          },
          {
            provide: PoolHealthIndicator,
            useValue: {
              isHealthy: jest.fn().mockReturnValue({
                database_pool: { status: 'up' },
              }),
            },
          },
          { provide: PrismaService, useValue: mockPrismaService },
          { provide: RedisService, useValue: mockRedisService },
          // Note: No ShutdownService provided
        ],
      }).compile();

      const controllerWithoutShutdown =
        module.get<HealthController>(HealthController);
      const result = controllerWithoutShutdown.check();

      expect(result.status).toBe('ok');
    });
  });

  describe('checkReadiness', () => {
    it('should call HealthCheckService.check with database and redis indicators', async () => {
      const mockResult: HealthCheckResult = {
        status: 'ok',
        info: {
          database: { status: 'up', responseTimeMs: 5 },
          redis: { status: 'up', responseTimeMs: 2 },
        },
        error: {},
        details: {
          database: { status: 'up', responseTimeMs: 5 },
          redis: { status: 'up', responseTimeMs: 2 },
        },
      };
      healthCheckService.check.mockResolvedValue(mockResult);

      const result = await controller.checkReadiness();

      expect(healthCheckService.check).toHaveBeenCalledWith([
        expect.any(Function),
        expect.any(Function),
        expect.any(Function),
      ]);
      expect(result).toEqual(mockResult);
    });
  });
});

describe('DatabaseHealthIndicator', () => {
  let indicator: DatabaseHealthIndicator;
  let mockPrismaService: { $queryRaw: jest.Mock };

  beforeEach(() => {
    mockPrismaService = {
      $queryRaw: jest.fn(),
    };

    indicator = new DatabaseHealthIndicator(
      mockPrismaService as unknown as PrismaService,
    );
  });

  describe('isHealthy', () => {
    it('should return healthy status when database responds', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ health_check: 1 }]);

      const result = await indicator.isHealthy('database');

      expect(result.database).toMatchObject({
        status: 'connected',
        responseTimeMs: expect.any(Number),
      });
    });

    it('should throw HealthCheckError when database query fails', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(
        new Error('Connection refused'),
      );

      await expect(indicator.isHealthy('database')).rejects.toThrow(
        'Database check failed',
      );
    });

    it('should throw HealthCheckError with disconnected status on failure', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(new Error('ECONNREFUSED'));

      try {
        await indicator.isHealthy('database');
        fail('Expected HealthCheckError to be thrown');
      } catch (error: unknown) {
        expect(error).toBeDefined();
        // HealthCheckError has causes property with the status
        const healthError = error as { causes: Record<string, unknown> };
        expect(healthError.causes).toBeDefined();
        expect(healthError.causes.database).toMatchObject({
          status: 'disconnected',
          error: expect.stringContaining('ECONNREFUSED'),
        });
      }
    });

    it('should respect custom timeout option', async () => {
      // Create a slow query that exceeds timeout
      const slowPromise = new Promise((resolve) => {
        setTimeout(() => resolve([{ health_check: 1 }]), 200);
      });
      mockPrismaService.$queryRaw.mockReturnValue(slowPromise);

      // Use very short timeout
      try {
        await indicator.isHealthy('database', { timeout: 50 });
        fail('Expected HealthCheckError to be thrown');
      } catch (error: unknown) {
        const healthError = error as {
          causes: Record<string, { error?: string }>;
        };
        expect(healthError.causes.database.error).toContain('timed out');
      }
    });

    it('should include responseTimeMs in result', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ health_check: 1 }]);

      const result = await indicator.isHealthy('database');

      expect(result.database.responseTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should handle non-Error exceptions', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue('Unknown string error');

      try {
        await indicator.isHealthy('database');
        fail('Expected error to be thrown');
      } catch (error: unknown) {
        const healthError = error as { causes: Record<string, unknown> };
        expect(healthError.causes.database).toMatchObject({
          status: 'disconnected',
          error: 'Unknown string error',
        });
      }
    });
  });
});

describe('RedisHealthIndicator', () => {
  let indicator: RedisHealthIndicator;
  let mockRedisService: { isReady: jest.Mock; ping: jest.Mock };

  beforeEach(() => {
    mockRedisService = {
      isReady: jest.fn(),
      ping: jest.fn(),
    };

    indicator = new RedisHealthIndicator(
      mockRedisService as unknown as RedisService,
    );
  });

  describe('isHealthy', () => {
    it('should return healthy status when Redis responds with PONG', async () => {
      mockRedisService.isReady.mockReturnValue(true);
      mockRedisService.ping.mockResolvedValue(true);

      const result = await indicator.isHealthy('redis');

      expect(result.redis).toMatchObject({
        status: 'connected',
        responseTimeMs: expect.any(Number),
      });
    });

    it('should throw HealthCheckError when Redis is not ready', async () => {
      mockRedisService.isReady.mockReturnValue(false);

      await expect(indicator.isHealthy('redis')).rejects.toThrow(
        'Redis check failed',
      );
    });

    it('should throw HealthCheckError when ping returns false', async () => {
      mockRedisService.isReady.mockReturnValue(true);
      mockRedisService.ping.mockResolvedValue(false);

      try {
        await indicator.isHealthy('redis');
        fail('Expected error to be thrown');
      } catch (error: unknown) {
        const healthError = error as { causes: Record<string, unknown> };
        expect(healthError.causes.redis).toMatchObject({
          status: 'disconnected',
          error: 'Redis PING did not receive PONG response',
        });
      }
    });

    it('should throw HealthCheckError when ping throws', async () => {
      mockRedisService.isReady.mockReturnValue(true);
      mockRedisService.ping.mockRejectedValue(new Error('Connection lost'));

      await expect(indicator.isHealthy('redis')).rejects.toThrow(
        'Redis check failed',
      );
    });

    it('should respect custom timeout option', async () => {
      mockRedisService.isReady.mockReturnValue(true);
      mockRedisService.ping.mockReturnValue(
        new Promise((resolve) => {
          setTimeout(() => resolve(true), 200);
        }),
      );

      try {
        await indicator.isHealthy('redis', { timeout: 50 });
        fail('Expected HealthCheckError to be thrown');
      } catch (error: unknown) {
        const healthError = error as {
          causes: Record<string, { error?: string }>;
        };
        expect(healthError.causes.redis.error).toContain('timed out');
      }
    });

    it('should include responseTimeMs in result', async () => {
      mockRedisService.isReady.mockReturnValue(true);
      mockRedisService.ping.mockResolvedValue(true);

      const result = await indicator.isHealthy('redis');

      expect(result.redis.responseTimeMs).toBeGreaterThanOrEqual(0);
    });
  });
});
