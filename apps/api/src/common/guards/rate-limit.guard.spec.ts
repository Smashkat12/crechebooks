import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import { RATE_LIMIT_KEY } from '../decorators/rate-limit.decorator';
import { TooManyRequestsException } from '../../shared/exceptions';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let reflector: jest.Mocked<Reflector>;
  let rateLimitService: jest.Mocked<RateLimitService>;

  const mockRequest = {
    ip: '127.0.0.1',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    user: null,
  };

  const mockResponse = {
    setHeader: jest.fn(),
  };

  const mockExecutionContext = {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
      getResponse: () => mockResponse,
    }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;

  beforeEach(async () => {
    const mockReflector = {
      get: jest.fn(),
    };

    const mockRateLimitService = {
      checkRateLimit: jest.fn(),
      isAccountLocked: jest.fn(),
      getLockoutRemaining: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitGuard,
        { provide: Reflector, useValue: mockReflector },
        { provide: RateLimitService, useValue: mockRateLimitService },
      ],
    }).compile();

    guard = module.get<RateLimitGuard>(RateLimitGuard);
    reflector = module.get(Reflector);
    rateLimitService = module.get(RateLimitService);

    // Reset mocks
    mockResponse.setHeader.mockClear();
    mockRequest.headers = {};
    mockRequest.user = null;
  });

  describe('canActivate', () => {
    it('should allow request when no rate limit decorator', async () => {
      reflector.get.mockReturnValue(undefined);

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled();
    });

    it('should allow request when within rate limit', async () => {
      reflector.get.mockReturnValue({
        limit: 5,
        windowSeconds: 900,
        keyPrefix: 'test:login',
      });

      rateLimitService.isAccountLocked.mockResolvedValue(false);
      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 4,
        total: 5,
        windowSeconds: 900,
      });

      const result = await guard.canActivate(mockExecutionContext);

      expect(result).toBe(true);
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Limit',
        5,
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        4,
      );
    });

    it('should throw TooManyRequestsException when rate limit exceeded', async () => {
      reflector.get.mockReturnValue({
        limit: 5,
        windowSeconds: 900,
        keyPrefix: 'test:login',
      });

      rateLimitService.isAccountLocked.mockResolvedValue(false);
      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        retryAfter: 300,
        total: 5,
        windowSeconds: 900,
      });

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        TooManyRequestsException,
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', 300);
    });

    it('should throw when account is locked', async () => {
      reflector.get.mockReturnValue({
        limit: 5,
        windowSeconds: 900,
        keyPrefix: 'test:login',
      });

      rateLimitService.isAccountLocked.mockResolvedValue(true);
      rateLimitService.getLockoutRemaining.mockResolvedValue(1500);

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        TooManyRequestsException,
      );

      expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled();
    });

    it('should use X-Forwarded-For header for IP when present', async () => {
      mockRequest.headers = { 'x-forwarded-for': '192.168.1.100, 10.0.0.1' };

      reflector.get.mockReturnValue({
        limit: 5,
        windowSeconds: 900,
        keyPrefix: 'test:login',
      });

      rateLimitService.isAccountLocked.mockResolvedValue(false);
      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 4,
        total: 5,
        windowSeconds: 900,
      });

      await guard.canActivate(mockExecutionContext);

      expect(rateLimitService.isAccountLocked).toHaveBeenCalledWith(
        'ip:192.168.1.100',
      );
      expect(rateLimitService.checkRateLimit).toHaveBeenCalledWith(
        'test:login:ip:192.168.1.100',
        5,
        900,
      );
    });

    it('should use X-Real-IP header when X-Forwarded-For is not present', async () => {
      mockRequest.headers = { 'x-real-ip': '10.10.10.10' };

      reflector.get.mockReturnValue({
        limit: 5,
        windowSeconds: 900,
        keyPrefix: 'test:login',
      });

      rateLimitService.isAccountLocked.mockResolvedValue(false);
      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 4,
        total: 5,
        windowSeconds: 900,
      });

      await guard.canActivate(mockExecutionContext);

      expect(rateLimitService.checkRateLimit).toHaveBeenCalledWith(
        'test:login:ip:10.10.10.10',
        5,
        900,
      );
    });

    it('should use custom error message when provided', async () => {
      reflector.get.mockReturnValue({
        limit: 5,
        windowSeconds: 900,
        keyPrefix: 'test:login',
        errorMessage: 'Custom rate limit message',
      });

      rateLimitService.isAccountLocked.mockResolvedValue(false);
      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        retryAfter: 300,
        total: 5,
        windowSeconds: 900,
      });

      try {
        await guard.canActivate(mockExecutionContext);
      } catch (error) {
        expect(error).toBeInstanceOf(TooManyRequestsException);
        expect((error as TooManyRequestsException).message).toBe(
          'Custom rate limit message',
        );
      }
    });

    it('should throw when Redis is unavailable', async () => {
      reflector.get.mockReturnValue({
        limit: 5,
        windowSeconds: 900,
        keyPrefix: 'test:login',
      });

      rateLimitService.isAccountLocked.mockRejectedValue(
        new Error('Redis connection failed'),
      );

      await expect(guard.canActivate(mockExecutionContext)).rejects.toThrow(
        TooManyRequestsException,
      );
    });
  });
});
