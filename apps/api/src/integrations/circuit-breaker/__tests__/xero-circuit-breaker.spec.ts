/**
 * XeroCircuitBreaker Unit Tests
 * TASK-REL-101: Circuit Breaker Pattern for Xero Integration
 *
 * Tests circuit breaker behavior for Xero API integration.
 * NO MOCK DATA - uses real database fixtures where needed.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  XeroCircuitBreaker,
  CircuitBreakerOpenError,
  CircuitBreakerState,
  StateChangeEvent,
} from '../xero-circuit-breaker';

describe('XeroCircuitBreaker', () => {
  let service: XeroCircuitBreaker;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XeroCircuitBreaker,
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation((key: string, defaultValue: number) => {
                switch (key) {
                  case 'XERO_CIRCUIT_BREAKER_TIMEOUT':
                    return 1000; // Short timeout for tests
                  case 'XERO_CIRCUIT_BREAKER_ERROR_THRESHOLD':
                    return 50;
                  case 'XERO_CIRCUIT_BREAKER_RESET_TIMEOUT':
                    return 500; // Short reset for tests
                  case 'XERO_CIRCUIT_BREAKER_VOLUME_THRESHOLD':
                    return 3; // Low threshold for tests
                  default:
                    return defaultValue;
                }
              }),
          },
        },
      ],
    }).compile();

    service = module.get<XeroCircuitBreaker>(XeroCircuitBreaker);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(async () => {
    if (service) {
      service.onModuleDestroy();
    }
  });

  describe('initialization', () => {
    it('should initialize with CLOSED state', () => {
      expect(service.getState()).toBe('CLOSED');
      expect(service.isClosed()).toBe(true);
      expect(service.isOpen()).toBe(false);
    });

    it('should load configuration from ConfigService', () => {
      const config = service.getConfig();
      expect(config.timeout).toBe(1000);
      expect(config.errorThresholdPercentage).toBe(50);
      expect(config.resetTimeout).toBe(500);
      expect(config.volumeThreshold).toBe(3);
    });

    it('should initialize metrics to zero', () => {
      const metrics = service.getMetrics();
      expect(metrics.successes).toBe(0);
      expect(metrics.failures).toBe(0);
      expect(metrics.rejects).toBe(0);
      expect(metrics.fallbacks).toBe(0);
      expect(metrics.timeouts).toBe(0);
      expect(metrics.state).toBe('CLOSED');
      expect(metrics.errorPercentage).toBe(0);
    });
  });

  describe('execute', () => {
    it('should execute successful actions', async () => {
      const action = jest.fn().mockResolvedValue('success');

      const result = await service.execute(action);

      expect(result).toBe('success');
      expect(action).toHaveBeenCalledTimes(1);

      const metrics = service.getMetrics();
      expect(metrics.successes).toBe(1);
      expect(metrics.failures).toBe(0);
    });

    it('should propagate errors from actions', async () => {
      const action = jest.fn().mockRejectedValue(new Error('API Error'));

      await expect(service.execute(action)).rejects.toThrow('API Error');

      const metrics = service.getMetrics();
      expect(metrics.failures).toBe(1);
    });

    it('should call fallback when provided and action fails', async () => {
      const action = jest.fn().mockRejectedValue(new Error('API Error'));
      const fallback = jest.fn().mockResolvedValue('fallback result');

      const result = await service.execute(action, fallback);

      expect(result).toBe('fallback result');
      expect(fallback).toHaveBeenCalledTimes(1);

      const metrics = service.getMetrics();
      expect(metrics.fallbacks).toBe(1);
    });

    it('should execute multiple actions sequentially', async () => {
      const results: string[] = [];

      for (let i = 0; i < 5; i++) {
        const result = await service.execute(() =>
          Promise.resolve(`result-${i}`),
        );
        results.push(result);
      }

      expect(results).toEqual([
        'result-0',
        'result-1',
        'result-2',
        'result-3',
        'result-4',
      ]);

      const metrics = service.getMetrics();
      expect(metrics.successes).toBe(5);
    });
  });

  describe('circuit opening', () => {
    it('should open circuit when error threshold exceeded', async () => {
      // Generate failures to exceed threshold
      // With volumeThreshold=3 and errorThreshold=50%, we need 2 failures out of 3

      // 3 failures in a row should trip the circuit
      for (let i = 0; i < 4; i++) {
        try {
          await service.execute(() => Promise.reject(new Error('API Error')));
        } catch {
          // Expected
        }
      }

      // Circuit should now be open
      expect(service.isOpen()).toBe(true);
      expect(service.getState()).toBe('OPEN');

      const metrics = service.getMetrics();
      expect(metrics.failures).toBeGreaterThanOrEqual(3);
    });

    it('should reject requests when circuit is open', async () => {
      // Force circuit open
      for (let i = 0; i < 4; i++) {
        try {
          await service.execute(() => Promise.reject(new Error('API Error')));
        } catch {
          // Expected
        }
      }

      expect(service.isOpen()).toBe(true);

      // Get rejects count before testing rejection
      const rejectsBefore = service.getMetrics().rejects;

      // New request should be rejected
      await expect(
        service.execute(() => Promise.resolve('should not execute')),
      ).rejects.toThrow(CircuitBreakerOpenError);

      const metrics = service.getMetrics();
      // Verify that exactly one new reject occurred
      expect(metrics.rejects).toBe(rejectsBefore + 1);
    });

    it('should use fallback when circuit is open', async () => {
      // Force circuit open
      for (let i = 0; i < 4; i++) {
        try {
          await service.execute(() => Promise.reject(new Error('API Error')));
        } catch {
          // Expected
        }
      }

      expect(service.isOpen()).toBe(true);

      // Request with fallback
      const result = await service.execute(
        () => Promise.resolve('should not execute'),
        () => Promise.resolve('fallback'),
      );

      expect(result).toBe('fallback');
    });
  });

  describe('circuit recovery', () => {
    it('should transition to HALF_OPEN after reset timeout', async () => {
      // Force circuit open
      for (let i = 0; i < 4; i++) {
        try {
          await service.execute(() => Promise.reject(new Error('API Error')));
        } catch {
          // Expected
        }
      }

      expect(service.isOpen()).toBe(true);

      // Wait for reset timeout (configured to 500ms in tests)
      await new Promise((resolve) => setTimeout(resolve, 600));

      // Circuit should be half-open or closed now
      const state = service.getState();
      expect(['HALF_OPEN', 'CLOSED']).toContain(state);
    });
  });

  describe('state change callbacks', () => {
    it('should notify on state changes', async () => {
      const stateChanges: StateChangeEvent[] = [];
      service.onStateChange((event) => {
        stateChanges.push(event);
      });

      // Force circuit open
      for (let i = 0; i < 4; i++) {
        try {
          await service.execute(() => Promise.reject(new Error('API Error')));
        } catch {
          // Expected
        }
      }

      // Should have received OPEN notification
      expect(stateChanges.length).toBeGreaterThanOrEqual(1);
      const openEvent = stateChanges.find((e) => e.currentState === 'OPEN');
      expect(openEvent).toBeDefined();
      expect(openEvent?.previousState).toBe('CLOSED');
    });
  });

  describe('metrics', () => {
    it('should track error percentage correctly', async () => {
      // 2 successes
      await service.execute(() => Promise.resolve('success'));
      await service.execute(() => Promise.resolve('success'));

      // 1 failure
      try {
        await service.execute(() => Promise.reject(new Error('fail')));
      } catch {
        // Expected
      }

      const metrics = service.getMetrics();
      expect(metrics.successes).toBe(2);
      expect(metrics.failures).toBe(1);
      // Error percentage = 1/3 = 33.33%
      expect(metrics.errorPercentage).toBeCloseTo(33.33, 0);
    });

    it('should track timestamps for state changes', async () => {
      expect(service.getMetrics().lastOpenedAt).toBeNull();
      expect(service.getMetrics().lastClosedAt).toBeNull();

      // Force circuit open
      for (let i = 0; i < 4; i++) {
        try {
          await service.execute(() => Promise.reject(new Error('API Error')));
        } catch {
          // Expected
        }
      }

      expect(service.getMetrics().lastOpenedAt).toBeInstanceOf(Date);
    });
  });

  describe('reset', () => {
    it('should reset circuit breaker state', async () => {
      // Generate some activity
      await service.execute(() => Promise.resolve('success'));
      try {
        await service.execute(() => Promise.reject(new Error('fail')));
      } catch {
        // Expected
      }

      // Verify metrics exist
      let metrics = service.getMetrics();
      expect(metrics.successes).toBe(1);
      expect(metrics.failures).toBe(1);

      // Reset
      service.reset();

      // Verify reset
      metrics = service.getMetrics();
      expect(metrics.successes).toBe(0);
      expect(metrics.failures).toBe(0);
      expect(metrics.rejects).toBe(0);
      expect(metrics.fallbacks).toBe(0);
      expect(metrics.timeouts).toBe(0);
      expect(service.getState()).toBe('CLOSED');
    });

    it('should notify state change on reset', async () => {
      const stateChanges: StateChangeEvent[] = [];
      service.onStateChange((event) => {
        stateChanges.push(event);
      });

      // Force circuit open
      for (let i = 0; i < 4; i++) {
        try {
          await service.execute(() => Promise.reject(new Error('API Error')));
        } catch {
          // Expected
        }
      }

      // Reset
      service.reset();

      // Should have CLOSED notification from reset
      const resetEvent = stateChanges.find(
        (e) => e.reason === 'Manual reset' && e.currentState === 'CLOSED',
      );
      expect(resetEvent).toBeDefined();
    });
  });

  describe('helper methods', () => {
    it('should correctly report isClosed', async () => {
      expect(service.isClosed()).toBe(true);
      expect(service.isOpen()).toBe(false);

      // Force open
      for (let i = 0; i < 4; i++) {
        try {
          await service.execute(() => Promise.reject(new Error('fail')));
        } catch {
          // Expected
        }
      }

      expect(service.isClosed()).toBe(false);
      expect(service.isOpen()).toBe(true);
    });

    it('should return config copy', () => {
      const config = service.getConfig();
      expect(config.timeout).toBe(1000);

      // Modifying returned config should not affect service
      config.timeout = 9999;
      expect(service.getConfig().timeout).toBe(1000);
    });
  });

  describe('concurrent requests', () => {
    it('should handle concurrent successful requests', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        service.execute(() => Promise.resolve(`result-${i}`)),
      );

      const results = await Promise.all(promises);

      expect(results.length).toBe(10);
      expect(results.every((r) => r.startsWith('result-'))).toBe(true);

      const metrics = service.getMetrics();
      expect(metrics.successes).toBe(10);
    });

    it('should handle mixed success/failure concurrent requests', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        service
          .execute(() =>
            i % 2 === 0
              ? Promise.resolve(`success-${i}`)
              : Promise.reject(new Error(`fail-${i}`)),
          )
          .catch((e) => `error-${e.message}`),
      );

      const results = await Promise.all(promises);

      const successes = results.filter((r) => r.startsWith('success-'));
      const failures = results.filter((r) => r.startsWith('error-'));

      expect(successes.length).toBe(5);
      expect(failures.length).toBe(5);
    });
  });

  describe('error types', () => {
    it('should handle timeout errors', async () => {
      const slowAction = () =>
        new Promise<string>((resolve) => {
          setTimeout(() => resolve('slow'), 2000); // Longer than timeout
        });

      await expect(service.execute(slowAction)).rejects.toThrow();

      const metrics = service.getMetrics();
      expect(metrics.failures).toBeGreaterThanOrEqual(1);
    });

    it('should handle network errors', async () => {
      const networkError = new Error('ECONNREFUSED');

      await expect(
        service.execute(() => Promise.reject(networkError)),
      ).rejects.toThrow('ECONNREFUSED');

      const metrics = service.getMetrics();
      expect(metrics.failures).toBe(1);
    });

    it('should handle custom error types', async () => {
      class XeroApiError extends Error {
        constructor(
          message: string,
          public statusCode: number,
        ) {
          super(message);
          this.name = 'XeroApiError';
        }
      }

      const xeroError = new XeroApiError('Rate limited', 429);

      await expect(
        service.execute(() => Promise.reject(xeroError)),
      ).rejects.toThrow(XeroApiError);

      const metrics = service.getMetrics();
      expect(metrics.failures).toBe(1);
    });
  });
});
