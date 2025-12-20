/**
 * Rate Limiter Tests
 * Tests rate limiting functionality without mocks
 */

import { RateLimiter } from '../../../src/mcp/xero-mcp/utils/rate-limiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter(5, 1000); // 5 requests per second for testing
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const limiter = new RateLimiter();
      expect(limiter.getRemainingRequests()).toBe(60);
    });

    it('should initialize with custom values', () => {
      const limiter = new RateLimiter(10, 5000);
      expect(limiter.getRemainingRequests()).toBe(10);
    });
  });

  describe('canProceed', () => {
    it('should return true when under limit', () => {
      expect(rateLimiter.canProceed()).toBe(true);
    });

    it('should return false when at limit', async () => {
      // Fill up the rate limiter
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquire();
      }
      expect(rateLimiter.canProceed()).toBe(false);
    });
  });

  describe('acquire', () => {
    it('should allow requests under limit', async () => {
      const startTime = Date.now();

      // Should complete quickly without waiting
      for (let i = 0; i < 3; i++) {
        await rateLimiter.acquire();
      }

      const elapsed = Date.now() - startTime;
      expect(elapsed).toBeLessThan(100); // Should be near-instant
    });

    it('should track current count correctly', async () => {
      expect(rateLimiter.getCurrentCount()).toBe(0);

      await rateLimiter.acquire();
      expect(rateLimiter.getCurrentCount()).toBe(1);

      await rateLimiter.acquire();
      expect(rateLimiter.getCurrentCount()).toBe(2);
    });
  });

  describe('getRemainingRequests', () => {
    it('should decrement with each request', async () => {
      expect(rateLimiter.getRemainingRequests()).toBe(5);

      await rateLimiter.acquire();
      expect(rateLimiter.getRemainingRequests()).toBe(4);

      await rateLimiter.acquire();
      expect(rateLimiter.getRemainingRequests()).toBe(3);
    });
  });

  describe('getTimeUntilNextSlot', () => {
    it('should return 0 when slots available', () => {
      expect(rateLimiter.getTimeUntilNextSlot()).toBe(0);
    });

    it('should return positive value when at limit', async () => {
      // Fill up the limiter
      for (let i = 0; i < 5; i++) {
        await rateLimiter.acquire();
      }

      const timeUntilSlot = rateLimiter.getTimeUntilNextSlot();
      expect(timeUntilSlot).toBeGreaterThan(0);
      expect(timeUntilSlot).toBeLessThanOrEqual(1000);
    });
  });

  describe('window expiration', () => {
    it('should reset after window expires', async () => {
      const quickLimiter = new RateLimiter(2, 100); // 100ms window

      // Fill it up
      await quickLimiter.acquire();
      await quickLimiter.acquire();
      expect(quickLimiter.canProceed()).toBe(false);

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      expect(quickLimiter.canProceed()).toBe(true);
      expect(quickLimiter.getCurrentCount()).toBe(0);
    });
  });
});
