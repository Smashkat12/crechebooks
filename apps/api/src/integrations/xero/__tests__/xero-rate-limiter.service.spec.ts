/**
 * XeroRateLimiter Tests
 * TASK-XERO-008: Implement Distributed Rate Limiting for Xero API
 *
 * Unit tests for the Xero rate limiter service.
 * Tests cover:
 * - In-memory rate limiting (default fallback)
 * - Sliding window algorithm accuracy
 * - Rate limit enforcement
 * - Status checking without slot consumption
 * - Reset functionality
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { XeroRateLimiter, RateLimitResult } from '../xero-rate-limiter.service';

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue('OK'),
    status: 'close', // Default to closed for in-memory tests
    multi: jest.fn(),
    del: jest.fn().mockResolvedValue(1),
    zrange: jest.fn(),
  }));
});

describe('XeroRateLimiter', () => {
  let service: XeroRateLimiter;
  let configService: ConfigService;

  const createConfigService = (overrides: Record<string, unknown> = {}) => ({
    get: jest.fn().mockImplementation((key: string, defaultValue?: unknown) => {
      const config: Record<string, unknown> = {
        REDIS_URL: undefined, // Default to no Redis
        XERO_RATE_LIMIT: 60,
        XERO_RATE_WINDOW_SECONDS: 60,
        ...overrides,
      };
      return config[key] ?? defaultValue;
    }),
  });

  beforeEach(async () => {
    jest.useFakeTimers();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XeroRateLimiter,
        {
          provide: ConfigService,
          useValue: createConfigService(),
        },
      ],
    }).compile();

    service = module.get<XeroRateLimiter>(XeroRateLimiter);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    jest.useRealTimers();
    await service.onModuleDestroy();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with default rate limit values', () => {
      expect(service).toBeDefined();
    });

    it('should use in-memory when REDIS_URL not configured', async () => {
      const result = await service.acquireSlot('tenant-1');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59); // 60 - 1
    });
  });

  describe('acquireSlot (in-memory)', () => {
    it('should allow requests within rate limit', async () => {
      const tenantId = 'tenant-test-1';

      const result = await service.acquireSlot(tenantId);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59);
      expect(result.retryAfter).toBeUndefined();
    });

    it('should decrement remaining count with each request', async () => {
      const tenantId = 'tenant-test-2';

      const result1 = await service.acquireSlot(tenantId);
      const result2 = await service.acquireSlot(tenantId);
      const result3 = await service.acquireSlot(tenantId);

      expect(result1.remaining).toBe(59);
      expect(result2.remaining).toBe(58);
      expect(result3.remaining).toBe(57);
    });

    it('should reject requests when limit is reached', async () => {
      const tenantId = 'tenant-test-3';

      // Exhaust the rate limit (60 requests)
      for (let i = 0; i < 60; i++) {
        const result = await service.acquireSlot(tenantId);
        expect(result.allowed).toBe(true);
      }

      // 61st request should be rejected
      const result = await service.acquireSlot(tenantId);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeGreaterThan(0);
      expect(result.retryAfter).toBeLessThanOrEqual(60);
    });

    it('should provide accurate retryAfter value', async () => {
      const tenantId = 'tenant-test-4';

      // Make first request
      await service.acquireSlot(tenantId);

      // Advance time by 30 seconds
      jest.advanceTimersByTime(30000);

      // Fill remaining slots
      for (let i = 0; i < 59; i++) {
        await service.acquireSlot(tenantId);
      }

      // Should be rejected, retryAfter should be ~30 seconds
      const result = await service.acquireSlot(tenantId);

      expect(result.allowed).toBe(false);
      // First request was 30 seconds ago, so it expires in 30 seconds
      expect(result.retryAfter).toBeLessThanOrEqual(30);
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should allow requests again after window expires', async () => {
      const tenantId = 'tenant-test-5';

      // Exhaust the rate limit
      for (let i = 0; i < 60; i++) {
        await service.acquireSlot(tenantId);
      }

      // Verify limit is reached
      let result = await service.acquireSlot(tenantId);
      expect(result.allowed).toBe(false);

      // Advance time past the window (61 seconds)
      jest.advanceTimersByTime(61000);

      // Should now be allowed
      result = await service.acquireSlot(tenantId);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59);
    });

    it('should track rate limits per tenant separately', async () => {
      const tenant1 = 'tenant-a';
      const tenant2 = 'tenant-b';

      // Exhaust tenant1's limit
      for (let i = 0; i < 60; i++) {
        await service.acquireSlot(tenant1);
      }

      // Tenant1 should be limited
      const result1 = await service.acquireSlot(tenant1);
      expect(result1.allowed).toBe(false);

      // Tenant2 should still be allowed
      const result2 = await service.acquireSlot(tenant2);
      expect(result2.allowed).toBe(true);
      expect(result2.remaining).toBe(59);
    });
  });

  describe('getStatus', () => {
    it('should return status without consuming a slot', async () => {
      const tenantId = 'tenant-status-1';

      // Check status before any requests
      const status1 = await service.getStatus(tenantId);
      expect(status1.allowed).toBe(true);
      expect(status1.remaining).toBe(60);

      // Make a request
      await service.acquireSlot(tenantId);

      // Check status again
      const status2 = await service.getStatus(tenantId);
      expect(status2.allowed).toBe(true);
      expect(status2.remaining).toBe(59);

      // Verify slot wasn't consumed by getStatus
      const result = await service.acquireSlot(tenantId);
      expect(result.remaining).toBe(58); // Not 57
    });

    it('should report when limit is reached', async () => {
      const tenantId = 'tenant-status-2';

      // Exhaust the limit
      for (let i = 0; i < 60; i++) {
        await service.acquireSlot(tenantId);
      }

      const status = await service.getStatus(tenantId);

      expect(status.allowed).toBe(false);
      expect(status.remaining).toBe(0);
      expect(status.retryAfter).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should reset rate limit for a tenant', async () => {
      const tenantId = 'tenant-reset-1';

      // Exhaust the limit
      for (let i = 0; i < 60; i++) {
        await service.acquireSlot(tenantId);
      }

      // Verify limited
      let result = await service.acquireSlot(tenantId);
      expect(result.allowed).toBe(false);

      // Reset
      await service.reset(tenantId);

      // Should be allowed again
      result = await service.acquireSlot(tenantId);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59);
    });

    it('should only reset specified tenant', async () => {
      const tenant1 = 'tenant-reset-a';
      const tenant2 = 'tenant-reset-b';

      // Make requests for both tenants
      for (let i = 0; i < 60; i++) {
        await service.acquireSlot(tenant1);
        await service.acquireSlot(tenant2);
      }

      // Reset only tenant1
      await service.reset(tenant1);

      // Tenant1 should be allowed
      const result1 = await service.acquireSlot(tenant1);
      expect(result1.allowed).toBe(true);

      // Tenant2 should still be limited
      const result2 = await service.acquireSlot(tenant2);
      expect(result2.allowed).toBe(false);
    });
  });

  describe('sliding window behavior', () => {
    it('should implement sliding window, not fixed window', async () => {
      const tenantId = 'tenant-sliding-1';

      // Make 30 requests
      for (let i = 0; i < 30; i++) {
        await service.acquireSlot(tenantId);
      }

      // Advance time by 30 seconds (half window)
      jest.advanceTimersByTime(30000);

      // Make 30 more requests
      for (let i = 0; i < 30; i++) {
        await service.acquireSlot(tenantId);
      }

      // Should now be limited
      let result = await service.acquireSlot(tenantId);
      expect(result.allowed).toBe(false);

      // Advance time by another 30 seconds (first 30 requests expire)
      jest.advanceTimersByTime(30000);

      // Should now have 30 slots available (first 30 expired)
      result = await service.acquireSlot(tenantId);
      expect(result.allowed).toBe(true);
      // Remaining should be 29 (30 from second batch still in window, minus this new one)
      expect(result.remaining).toBe(29);
    });
  });

  describe('custom configuration', () => {
    it('should respect custom rate limit configuration', async () => {
      // Create new service with custom config
      const customModule = await Test.createTestingModule({
        providers: [
          XeroRateLimiter,
          {
            provide: ConfigService,
            useValue: createConfigService({
              XERO_RATE_LIMIT: 5,
              XERO_RATE_WINDOW_SECONDS: 10,
            }),
          },
        ],
      }).compile();

      const customService = customModule.get<XeroRateLimiter>(XeroRateLimiter);
      const tenantId = 'tenant-custom-1';

      // Should allow 5 requests
      for (let i = 0; i < 5; i++) {
        const result = await customService.acquireSlot(tenantId);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(4 - i);
      }

      // 6th request should be rejected
      const result = await customService.acquireSlot(tenantId);
      expect(result.allowed).toBe(false);

      await customService.onModuleDestroy();
    });
  });

  describe('cleanup', () => {
    it('should clean up on module destroy', async () => {
      const tenantId = 'tenant-cleanup-1';

      // Make some requests
      await service.acquireSlot(tenantId);
      await service.acquireSlot(tenantId);

      // Destroy module
      await service.onModuleDestroy();

      // Create new instance to verify cleanup
      const newModule = await Test.createTestingModule({
        providers: [
          XeroRateLimiter,
          {
            provide: ConfigService,
            useValue: createConfigService(),
          },
        ],
      }).compile();

      const newService = newModule.get<XeroRateLimiter>(XeroRateLimiter);

      // New instance should start fresh
      const result = await newService.acquireSlot(tenantId);
      expect(result.remaining).toBe(59); // Fresh start

      await newService.onModuleDestroy();
    });
  });

  describe('edge cases', () => {
    it('should handle empty tenant ID', async () => {
      const result = await service.acquireSlot('');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59);
    });

    it('should handle special characters in tenant ID', async () => {
      const tenantId = 'tenant:special/chars@test';

      const result = await service.acquireSlot(tenantId);

      expect(result.allowed).toBe(true);
    });

    it('should handle concurrent requests correctly', async () => {
      const tenantId = 'tenant-concurrent-1';

      // Simulate concurrent requests
      const promises = Array.from({ length: 10 }, () =>
        service.acquireSlot(tenantId),
      );

      const results = await Promise.all(promises);

      // All should be allowed
      results.forEach((result) => {
        expect(result.allowed).toBe(true);
      });

      // Remaining should decrement correctly
      // Note: In actual concurrent scenarios, order may vary
      const remainingValues = results.map((r) => r.remaining);
      expect(Math.min(...remainingValues)).toBeGreaterThanOrEqual(50);
    });

    it('should return minimum 1 for retryAfter', async () => {
      const tenantId = 'tenant-retry-min';

      // Exhaust limit
      for (let i = 0; i < 60; i++) {
        await service.acquireSlot(tenantId);
      }

      // Advance time to just before expiry
      jest.advanceTimersByTime(59500); // 59.5 seconds

      const result = await service.acquireSlot(tenantId);

      expect(result.allowed).toBe(false);
      expect(result.retryAfter).toBeGreaterThanOrEqual(1);
    });
  });
});
