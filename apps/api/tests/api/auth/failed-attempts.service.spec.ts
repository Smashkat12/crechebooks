/**
 * Failed Attempts Service Tests
 *
 * TASK-SEC-004: Comprehensive tests for authentication rate limiting
 * and failed attempts tracking functionality.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import {
  FailedAttemptsService,
  AttemptInfo,
  LockStatus,
} from '../../../src/api/auth/failed-attempts.service';
import {
  RateLimitService,
  FailedAttemptResult,
} from '../../../src/common/rate-limit/rate-limit.service';

describe('FailedAttemptsService', () => {
  let service: FailedAttemptsService;
  let rateLimitService: jest.Mocked<RateLimitService>;
  let configService: jest.Mocked<ConfigService>;

  // Mock configuration values
  const mockConfig = {
    AUTH_MAX_FAILED_ATTEMPTS: 5,
    AUTH_LOCKOUT_DURATION_SECONDS: 900, // 15 minutes
    AUTH_ATTEMPT_WINDOW_SECONDS: 900,
    AUTH_BACKOFF_THRESHOLD: 2,
    AUTH_BACKOFF_BASE_DELAY_MS: 1000,
    AUTH_BACKOFF_MAX_DELAY_MS: 30000,
  };

  beforeEach(async () => {
    // Create mock RateLimitService
    const mockRateLimitService = {
      trackFailedAttempt: jest.fn(),
      isAccountLocked: jest.fn(),
      getLockoutRemaining: jest.fn(),
      clearFailedAttempts: jest.fn(),
      unlockAccount: jest.fn(),
      checkRateLimit: jest.fn(),
      lockAccount: jest.fn(),
    };

    // Create mock ConfigService
    const mockConfigService = {
      get: jest.fn((key: string) => mockConfig[key as keyof typeof mockConfig]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FailedAttemptsService,
        {
          provide: RateLimitService,
          useValue: mockRateLimitService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<FailedAttemptsService>(FailedAttemptsService);
    rateLimitService = module.get(RateLimitService);
    configService = module.get(ConfigService);
  });

  describe('recordFailedAttempt', () => {
    it('should track failed attempts and return attempt info', async () => {
      const mockResult: FailedAttemptResult = {
        attempts: 1,
        backoffSeconds: 0,
        isLocked: false,
      };
      rateLimitService.trackFailedAttempt.mockResolvedValue(mockResult);

      const result = await service.recordFailedAttempt('test@example.com');

      expect(rateLimitService.trackFailedAttempt).toHaveBeenCalledWith(
        'test@example.com',
      );
      expect(result.count).toBe(1);
      expect(result.isLocked).toBe(false);
      expect(result.backoffSeconds).toBe(0);
      expect(result.lockedUntil).toBeUndefined();
    });

    it('should lock account after max attempts reached', async () => {
      const mockResult: FailedAttemptResult = {
        attempts: 5,
        backoffSeconds: 30,
        isLocked: true,
      };
      rateLimitService.trackFailedAttempt.mockResolvedValue(mockResult);

      const result = await service.recordFailedAttempt('test@example.com');

      expect(result.count).toBe(5);
      expect(result.isLocked).toBe(true);
      expect(result.lockedUntil).toBeDefined();
      expect(result.lockedUntil).toBeGreaterThan(Date.now());
    });

    it('should reset count after window expires (handled by underlying service)', async () => {
      // First call returns high count
      rateLimitService.trackFailedAttempt.mockResolvedValueOnce({
        attempts: 4,
        backoffSeconds: 8,
        isLocked: false,
      });

      await service.recordFailedAttempt('test@example.com');

      // Simulate window expiration (underlying service handles this)
      rateLimitService.trackFailedAttempt.mockResolvedValueOnce({
        attempts: 1,
        backoffSeconds: 0,
        isLocked: false,
      });

      const result = await service.recordFailedAttempt('test@example.com');

      expect(result.count).toBe(1);
      expect(result.backoffSeconds).toBe(0);
    });

    it('should normalize identifiers with prefixes', async () => {
      rateLimitService.trackFailedAttempt.mockResolvedValue({
        attempts: 1,
        backoffSeconds: 0,
        isLocked: false,
      });

      await service.recordFailedAttempt('email:test@example.com');
      expect(rateLimitService.trackFailedAttempt).toHaveBeenCalledWith(
        'email:test@example.com',
      );

      await service.recordFailedAttempt('ip:192.168.1.1');
      expect(rateLimitService.trackFailedAttempt).toHaveBeenCalledWith(
        'ip:192.168.1.1',
      );
    });

    it('should throw error when Redis is unavailable', async () => {
      rateLimitService.trackFailedAttempt.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      await expect(
        service.recordFailedAttempt('test@example.com'),
      ).rejects.toThrow('Redis connection failed');
    });
  });

  describe('isLocked', () => {
    it('should return locked status when account is locked', async () => {
      rateLimitService.isAccountLocked.mockResolvedValue(true);
      rateLimitService.getLockoutRemaining.mockResolvedValue(600);

      const result = await service.isLocked('test@example.com');

      expect(result.locked).toBe(true);
      expect(result.remainingTime).toBe(600);
      expect(result.reason).toBeDefined();
    });

    it('should return not locked when account is not locked', async () => {
      rateLimitService.isAccountLocked.mockResolvedValue(false);

      const result = await service.isLocked('test@example.com');

      expect(result.locked).toBe(false);
      expect(result.remainingTime).toBeUndefined();
    });

    it('should return not locked after lockout expires', async () => {
      // First call - locked
      rateLimitService.isAccountLocked.mockResolvedValueOnce(true);
      rateLimitService.getLockoutRemaining.mockResolvedValueOnce(600);

      let result = await service.isLocked('test@example.com');
      expect(result.locked).toBe(true);

      // After lockout expires
      rateLimitService.isAccountLocked.mockResolvedValueOnce(false);

      result = await service.isLocked('test@example.com');
      expect(result.locked).toBe(false);
    });

    it('should throw error when Redis is unavailable', async () => {
      rateLimitService.isAccountLocked.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      await expect(service.isLocked('test@example.com')).rejects.toThrow(
        'Redis connection failed',
      );
    });
  });

  describe('getBackoffDelay', () => {
    it('should return 0 for first 2 attempts (threshold)', () => {
      expect(service.getBackoffDelay(1)).toBe(0);
      expect(service.getBackoffDelay(2)).toBe(0);
    });

    it('should return exponential delays after threshold', () => {
      // With threshold=2:
      // attempt 3 = 1s (baseDelay * 2^0)
      // attempt 4 = 2s (baseDelay * 2^1)
      // attempt 5 = 4s (baseDelay * 2^2)
      // attempt 6 = 8s (baseDelay * 2^3)
      // attempt 7 = 16s (baseDelay * 2^4)
      expect(service.getBackoffDelay(3)).toBe(1000);
      expect(service.getBackoffDelay(4)).toBe(2000);
      expect(service.getBackoffDelay(5)).toBe(4000);
      expect(service.getBackoffDelay(6)).toBe(8000);
      expect(service.getBackoffDelay(7)).toBe(16000);
    });

    it('should cap at 30 seconds maximum', () => {
      // With baseDelay=1000ms and maxDelay=30000ms
      // attempt 8 = 32s, but capped at 30s
      expect(service.getBackoffDelay(8)).toBe(30000);
      expect(service.getBackoffDelay(10)).toBe(30000);
      expect(service.getBackoffDelay(100)).toBe(30000);
    });
  });

  describe('clearAttempts', () => {
    it('should clear failed attempts on successful login', async () => {
      rateLimitService.clearFailedAttempts.mockResolvedValue(undefined);

      await service.clearAttempts('test@example.com');

      expect(rateLimitService.clearFailedAttempts).toHaveBeenCalledWith(
        'test@example.com',
      );
    });

    it('should throw error when Redis is unavailable', async () => {
      rateLimitService.clearFailedAttempts.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      await expect(service.clearAttempts('test@example.com')).rejects.toThrow(
        'Redis connection failed',
      );
    });
  });

  describe('unlockAccount', () => {
    it('should unlock a locked account', async () => {
      rateLimitService.unlockAccount.mockResolvedValue(undefined);

      await service.unlockAccount('test@example.com');

      expect(rateLimitService.unlockAccount).toHaveBeenCalledWith(
        'test@example.com',
      );
    });

    it('should throw error when Redis is unavailable', async () => {
      rateLimitService.unlockAccount.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      await expect(service.unlockAccount('test@example.com')).rejects.toThrow(
        'Redis connection failed',
      );
    });
  });

  describe('checkCombinedLockStatus', () => {
    it('should return locked if email is locked', async () => {
      rateLimitService.isAccountLocked
        .mockResolvedValueOnce(true) // email check
        .mockResolvedValueOnce(false); // ip check
      rateLimitService.getLockoutRemaining.mockResolvedValue(600);

      const result = await service.checkCombinedLockStatus(
        'test@example.com',
        '192.168.1.1',
      );

      expect(result.locked).toBe(true);
      expect(result.remainingTime).toBe(600);
    });

    it('should return locked if IP is locked', async () => {
      rateLimitService.isAccountLocked
        .mockResolvedValueOnce(false) // email check
        .mockResolvedValueOnce(true); // ip check
      rateLimitService.getLockoutRemaining.mockResolvedValue(300);

      const result = await service.checkCombinedLockStatus(
        'test@example.com',
        '192.168.1.1',
      );

      expect(result.locked).toBe(true);
      expect(result.remainingTime).toBe(300);
    });

    it('should return not locked if neither is locked', async () => {
      rateLimitService.isAccountLocked.mockResolvedValue(false);

      const result = await service.checkCombinedLockStatus(
        'test@example.com',
        '192.168.1.1',
      );

      expect(result.locked).toBe(false);
    });

    it('should work without IP address', async () => {
      rateLimitService.isAccountLocked.mockResolvedValue(false);

      const result = await service.checkCombinedLockStatus('test@example.com');

      expect(result.locked).toBe(false);
      // Should only check email once
      expect(rateLimitService.isAccountLocked).toHaveBeenCalledTimes(1);
    });
  });

  describe('recordCombinedFailedAttempt', () => {
    it('should record attempts for both email and IP', async () => {
      rateLimitService.trackFailedAttempt
        .mockResolvedValueOnce({
          attempts: 2,
          backoffSeconds: 0,
          isLocked: false,
        })
        .mockResolvedValueOnce({
          attempts: 3,
          backoffSeconds: 1,
          isLocked: false,
        });

      const result = await service.recordCombinedFailedAttempt(
        'test@example.com',
        '192.168.1.1',
      );

      expect(rateLimitService.trackFailedAttempt).toHaveBeenCalledTimes(2);
      expect(result.count).toBe(3); // Max of both
      expect(result.backoffSeconds).toBe(1); // Max of both
      expect(result.isLocked).toBe(false);
    });

    it('should return locked if either is locked', async () => {
      rateLimitService.trackFailedAttempt
        .mockResolvedValueOnce({
          attempts: 5,
          backoffSeconds: 30,
          isLocked: true,
        })
        .mockResolvedValueOnce({
          attempts: 2,
          backoffSeconds: 0,
          isLocked: false,
        });

      const result = await service.recordCombinedFailedAttempt(
        'test@example.com',
        '192.168.1.1',
      );

      expect(result.isLocked).toBe(true);
      expect(result.lockedUntil).toBeDefined();
    });

    it('should work without IP address', async () => {
      rateLimitService.trackFailedAttempt.mockResolvedValue({
        attempts: 1,
        backoffSeconds: 0,
        isLocked: false,
      });

      const result =
        await service.recordCombinedFailedAttempt('test@example.com');

      expect(rateLimitService.trackFailedAttempt).toHaveBeenCalledTimes(1);
      expect(result.count).toBe(1);
    });
  });

  describe('clearCombinedAttempts', () => {
    it('should clear attempts for both email and IP', async () => {
      rateLimitService.clearFailedAttempts.mockResolvedValue(undefined);

      await service.clearCombinedAttempts('test@example.com', '192.168.1.1');

      expect(rateLimitService.clearFailedAttempts).toHaveBeenCalledTimes(2);
      expect(rateLimitService.clearFailedAttempts).toHaveBeenCalledWith(
        'email:test@example.com',
      );
      expect(rateLimitService.clearFailedAttempts).toHaveBeenCalledWith(
        'ip:192.168.1.1',
      );
    });

    it('should work without IP address', async () => {
      rateLimitService.clearFailedAttempts.mockResolvedValue(undefined);

      await service.clearCombinedAttempts('test@example.com');

      expect(rateLimitService.clearFailedAttempts).toHaveBeenCalledTimes(1);
      expect(rateLimitService.clearFailedAttempts).toHaveBeenCalledWith(
        'email:test@example.com',
      );
    });
  });

  describe('getConfig', () => {
    it('should return the current configuration', () => {
      const config = service.getConfig();

      expect(config.maxAttempts).toBe(5);
      expect(config.lockoutDuration).toBe(900000); // 900 seconds in ms
      expect(config.backoffThreshold).toBe(2);
      expect(config.baseDelay).toBe(1000);
      expect(config.maxDelay).toBe(30000);
    });

    it('should return a copy of the configuration (immutable)', () => {
      const config1 = service.getConfig();
      const config2 = service.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('onModuleInit', () => {
    it('should initialize without errors', async () => {
      await expect(service.onModuleInit()).resolves.not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle brute force attack scenario', async () => {
      // Simulate 5 consecutive failed attempts
      const attempts: AttemptInfo[] = [];

      for (let i = 1; i <= 5; i++) {
        const isLocked = i >= 5;
        rateLimitService.trackFailedAttempt.mockResolvedValueOnce({
          attempts: i,
          backoffSeconds: i > 2 ? Math.pow(2, i - 3) : 0,
          isLocked,
        });

        const result = await service.recordFailedAttempt(
          'attacker@example.com',
        );
        attempts.push(result);
      }

      // First 2 attempts: no backoff
      expect(attempts[0].backoffSeconds).toBe(0);
      expect(attempts[1].backoffSeconds).toBe(0);

      // Subsequent attempts: exponential backoff
      expect(attempts[2].backoffSeconds).toBe(1);
      expect(attempts[3].backoffSeconds).toBe(2);

      // 5th attempt: locked
      expect(attempts[4].isLocked).toBe(true);
    });

    it('should handle successful login after failed attempts', async () => {
      // Record some failed attempts
      rateLimitService.trackFailedAttempt.mockResolvedValue({
        attempts: 3,
        backoffSeconds: 1,
        isLocked: false,
      });

      await service.recordFailedAttempt('user@example.com');

      // Successful login - clear attempts
      rateLimitService.clearFailedAttempts.mockResolvedValue(undefined);
      await service.clearAttempts('user@example.com');

      expect(rateLimitService.clearFailedAttempts).toHaveBeenCalledWith(
        'user@example.com',
      );
    });

    it('should handle admin unlock scenario', async () => {
      // User is locked
      rateLimitService.isAccountLocked.mockResolvedValueOnce(true);
      rateLimitService.getLockoutRemaining.mockResolvedValue(600);

      let status = await service.isLocked('user@example.com');
      expect(status.locked).toBe(true);

      // Admin unlocks the account
      rateLimitService.unlockAccount.mockResolvedValue(undefined);
      await service.unlockAccount('user@example.com');

      // User is no longer locked
      rateLimitService.isAccountLocked.mockResolvedValueOnce(false);
      status = await service.isLocked('user@example.com');
      expect(status.locked).toBe(false);
    });
  });
});
