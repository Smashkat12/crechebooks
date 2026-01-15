import { Test, TestingModule } from '@nestjs/testing';
import { RateLimitService, AUTH_RATE_LIMITS } from './rate-limit.service';
import { RedisService } from '../redis/redis.service';

describe('RateLimitService', () => {
  let service: RateLimitService;
  let redisService: jest.Mocked<RedisService>;

  // Mock Redis storage
  const mockStorage = new Map<string, string>();

  beforeEach(async () => {
    mockStorage.clear();

    const mockRedisService = {
      get: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(mockStorage.get(key) || null);
      }),
      set: jest.fn().mockImplementation((key: string, value: string) => {
        mockStorage.set(key, value);
        return Promise.resolve();
      }),
      delete: jest.fn().mockImplementation((key: string) => {
        const existed = mockStorage.has(key);
        mockStorage.delete(key);
        return Promise.resolve(existed);
      }),
      exists: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(mockStorage.has(key));
      }),
      ttl: jest.fn().mockImplementation((key: string) => {
        return Promise.resolve(mockStorage.has(key) ? 3600 : -2);
      }),
      isReady: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
      ],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
    redisService = module.get(RedisService);
  });

  describe('checkRateLimit', () => {
    it('should allow requests within the limit', async () => {
      const result = await service.checkRateLimit('test:ip:127.0.0.1', 5, 900);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.total).toBe(5);
      expect(result.windowSeconds).toBe(900);
    });

    it('should track multiple requests correctly', async () => {
      // Make 3 requests
      await service.checkRateLimit('test:ip:127.0.0.1', 5, 900);
      await service.checkRateLimit('test:ip:127.0.0.1', 5, 900);
      const result = await service.checkRateLimit('test:ip:127.0.0.1', 5, 900);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
    });

    it('should deny requests when limit is exceeded', async () => {
      const key = 'test:ip:192.168.1.1';

      // Make 5 requests to reach the limit
      for (let i = 0; i < 5; i++) {
        await service.checkRateLimit(key, 5, 900);
      }

      // 6th request should be denied
      const result = await service.checkRateLimit(key, 5, 900);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.retryAfter).toBeDefined();
      expect(result.retryAfter).toBeGreaterThan(0);
    });

    it('should use separate counters for different keys', async () => {
      const key1 = 'test:ip:10.0.0.1';
      const key2 = 'test:ip:10.0.0.2';

      // Exhaust limit for key1
      for (let i = 0; i < 5; i++) {
        await service.checkRateLimit(key1, 5, 900);
      }

      // key2 should still have full allowance
      const result = await service.checkRateLimit(key2, 5, 900);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4);
    });

    it('should throw error when Redis is unavailable', async () => {
      redisService.get.mockRejectedValue(new Error('Redis connection failed'));

      await expect(service.checkRateLimit('test:key', 5, 900)).rejects.toThrow(
        'Rate limit check failed',
      );
    });
  });

  describe('trackFailedAttempt', () => {
    it('should track first failed attempt with no backoff', async () => {
      const result = await service.trackFailedAttempt('ip:127.0.0.1');

      expect(result.attempts).toBe(1);
      expect(result.backoffSeconds).toBe(0);
      expect(result.isLocked).toBe(false);
    });

    it('should increment attempt count', async () => {
      await service.trackFailedAttempt('ip:127.0.0.1');
      await service.trackFailedAttempt('ip:127.0.0.1');
      const result = await service.trackFailedAttempt('ip:127.0.0.1');

      expect(result.attempts).toBe(3);
    });

    it('should apply exponential backoff after threshold', async () => {
      // First 3 attempts - no backoff (attempts 1, 2, 3)
      for (let i = 0; i < 3; i++) {
        const result = await service.trackFailedAttempt('ip:127.0.0.1');
        expect(result.backoffSeconds).toBe(0);
      }

      // 4th attempt (after 3 failures) - power = 4-3-1=0, 2^0=1 second backoff
      let result = await service.trackFailedAttempt('ip:127.0.0.1');
      expect(result.attempts).toBe(4);
      expect(result.backoffSeconds).toBe(1);

      // 5th attempt - power = 5-3-1=1, 2^1=2 second backoff
      result = await service.trackFailedAttempt('ip:127.0.0.1');
      expect(result.attempts).toBe(5);
      expect(result.backoffSeconds).toBe(2);

      // 6th attempt - power = 6-3-1=2, 2^2=4 second backoff
      result = await service.trackFailedAttempt('ip:127.0.0.1');
      expect(result.attempts).toBe(6);
      expect(result.backoffSeconds).toBe(4);
    });

    it('should cap backoff at maximum delay', async () => {
      // Make many failed attempts
      for (let i = 0; i < 15; i++) {
        await service.trackFailedAttempt('ip:127.0.0.1');
      }

      // Backoff should be capped at 30 seconds
      const result = await service.trackFailedAttempt('ip:127.0.0.1');
      expect(result.backoffSeconds).toBeLessThanOrEqual(30);
    });

    it('should lock account after lockout threshold', async () => {
      // Make 10 failed attempts
      let result;
      for (let i = 0; i < 10; i++) {
        result = await service.trackFailedAttempt('ip:127.0.0.1');
      }

      expect(result!.isLocked).toBe(true);

      // Verify account is locked
      const isLocked = await service.isAccountLocked('ip:127.0.0.1');
      expect(isLocked).toBe(true);
    });
  });

  describe('isAccountLocked', () => {
    it('should return false for unlocked account', async () => {
      const isLocked = await service.isAccountLocked('ip:127.0.0.1');
      expect(isLocked).toBe(false);
    });

    it('should return true for locked account', async () => {
      await service.lockAccount('ip:127.0.0.1', 1800);
      const isLocked = await service.isAccountLocked('ip:127.0.0.1');
      expect(isLocked).toBe(true);
    });
  });

  describe('lockAccount', () => {
    it('should lock account with specified duration', async () => {
      await service.lockAccount('email:test@example.com', 1800);

      expect(redisService.set).toHaveBeenCalledWith(
        'ratelimit:locked:email:test@example.com',
        expect.any(String),
        1800,
      );

      const isLocked = await service.isAccountLocked('email:test@example.com');
      expect(isLocked).toBe(true);
    });
  });

  describe('clearFailedAttempts', () => {
    it('should clear failed attempts for a key', async () => {
      // Track some failed attempts
      await service.trackFailedAttempt('ip:127.0.0.1');
      await service.trackFailedAttempt('ip:127.0.0.1');

      // Clear attempts
      await service.clearFailedAttempts('ip:127.0.0.1');

      // Next attempt should be fresh
      const result = await service.trackFailedAttempt('ip:127.0.0.1');
      expect(result.attempts).toBe(1);
    });
  });

  describe('unlockAccount', () => {
    it('should unlock account and clear failed attempts', async () => {
      // Lock account
      await service.lockAccount('email:test@example.com', 1800);

      // Track some failed attempts
      await service.trackFailedAttempt('email:test@example.com');

      // Unlock
      await service.unlockAccount('email:test@example.com');

      // Verify unlocked
      const isLocked = await service.isAccountLocked('email:test@example.com');
      expect(isLocked).toBe(false);
    });
  });

  describe('AUTH_RATE_LIMITS configuration', () => {
    it('should have correct login rate limit', () => {
      expect(AUTH_RATE_LIMITS.LOGIN.limit).toBe(5);
      expect(AUTH_RATE_LIMITS.LOGIN.windowSeconds).toBe(900); // 15 minutes
    });

    it('should have correct register rate limit', () => {
      expect(AUTH_RATE_LIMITS.REGISTER.limit).toBe(3);
      expect(AUTH_RATE_LIMITS.REGISTER.windowSeconds).toBe(3600); // 1 hour
    });

    it('should have correct forgot-password rate limit', () => {
      expect(AUTH_RATE_LIMITS.FORGOT_PASSWORD.limit).toBe(3);
      expect(AUTH_RATE_LIMITS.FORGOT_PASSWORD.windowSeconds).toBe(3600); // 1 hour
    });

    it('should have correct dev-login rate limit', () => {
      expect(AUTH_RATE_LIMITS.DEV_LOGIN.limit).toBe(5);
      expect(AUTH_RATE_LIMITS.DEV_LOGIN.windowSeconds).toBe(900); // 15 minutes
    });
  });
});
