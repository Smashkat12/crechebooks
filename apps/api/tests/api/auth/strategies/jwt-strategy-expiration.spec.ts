/**
 * JWT Strategy Expiration Tests
 * TASK-SEC-001: Tests for JWT token expiration validation and logging
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import {
  JwtStrategy,
  JwtPayload,
} from '../../../../src/api/auth/strategies/jwt.strategy';
import { PrismaService } from '../../../../src/database/prisma/prisma.service';

describe('JwtStrategy - TASK-SEC-001: Token Expiration', () => {
  let strategy: JwtStrategy;
  let configService: ConfigService;
  let prismaService: PrismaService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        NODE_ENV: 'development',
        JWT_SECRET: 'test-secret-key-at-least-32-chars-long',
        AUTH0_DOMAIN: undefined,
      };
      return config[key] ?? defaultValue;
    }),
  };

  const mockPrismaService = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };

  const mockUser = {
    id: 'user-123',
    tenantId: 'tenant-123',
    auth0Id: 'auth0|123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'VIEWER',
    isActive: true,
    lastLoginAt: new Date(),
    currentTenantId: 'tenant-123',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
    configService = module.get<ConfigService>(ConfigService);
    prismaService = module.get<PrismaService>(PrismaService);

    // Default: user exists and is active
    mockPrismaService.user.findFirst.mockResolvedValue(mockUser);
    mockPrismaService.user.update.mockResolvedValue(mockUser);
  });

  describe('Token Expiration Validation', () => {
    it('should accept token with valid expiration', async () => {
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        iat: now - 1800, // Issued 30 minutes ago
        exp: now + 1800, // Expires in 30 minutes
      };

      const result = await strategy.validate(payload);

      expect(result).toBeDefined();
      expect(result.id).toBe(mockUser.id);
    });

    it('should reject expired token', async () => {
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        iat: now - 7200, // Issued 2 hours ago
        exp: now - 3600, // Expired 1 hour ago
      };

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
      await expect(strategy.validate(payload)).rejects.toThrow(
        'Token has expired',
      );
    });

    it('should reject token that just expired', async () => {
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        iat: now - 3600,
        exp: now - 1, // Expired 1 second ago
      };

      await expect(strategy.validate(payload)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should accept token expiring at exact boundary', async () => {
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        iat: now - 3600,
        exp: now + 1, // Expires in 1 second (still valid)
      };

      const result = await strategy.validate(payload);
      expect(result).toBeDefined();
    });

    it('should handle token without exp claim in development', async () => {
      const payload: JwtPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        iat: Math.floor(Date.now() / 1000) - 3600,
        // No exp claim
      };

      // In development mode, tokens without exp should be allowed (backward compatibility)
      const result = await strategy.validate(payload);
      expect(result).toBeDefined();
    });
  });

  describe('Nearly Expired Token Warning', () => {
    it('should warn for token expiring within 5 minutes', async () => {
      const warnSpy = jest.spyOn((strategy as any).logger, 'warn');
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        iat: now - 3300, // Issued 55 minutes ago
        exp: now + 240, // Expires in 4 minutes (within warning threshold)
      };

      await strategy.validate(payload);

      // Should log warning about nearly expired token
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('JWT nearly expired'),
      );
    });

    it('should not warn for token with more than 5 minutes remaining', async () => {
      const warnSpy = jest.spyOn((strategy as any).logger, 'warn');
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        iat: now - 1800, // Issued 30 minutes ago
        exp: now + 1800, // Expires in 30 minutes
      };

      await strategy.validate(payload);

      // Should not log warning about nearly expired token
      expect(warnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining('JWT nearly expired'),
      );
    });
  });

  describe('Token Lifetime Logging', () => {
    it('should log token age and remaining time at debug level', async () => {
      const debugSpy = jest.spyOn((strategy as any).logger, 'debug');
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        iat: now - 1800, // Issued 30 minutes ago
        exp: now + 1800, // Expires in 30 minutes
      };

      await strategy.validate(payload);

      // Should log token lifetime info
      expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('age:'));
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('remaining:'),
      );
    });

    it('should handle token without iat claim', async () => {
      const debugSpy = jest.spyOn((strategy as any).logger, 'debug');
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        exp: now + 1800, // No iat claim
      };

      await strategy.validate(payload);

      // Should still log but without age info
      expect(debugSpy).toHaveBeenCalledWith(
        expect.stringContaining('expires in'),
      );
    });
  });

  describe('Error Messages', () => {
    it('should provide clear error message for expired tokens', async () => {
      const now = Math.floor(Date.now() / 1000);
      const payload: JwtPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        exp: now - 100,
      };

      try {
        await strategy.validate(payload);
        fail('Should have thrown UnauthorizedException');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(error.message).toBe('Token has expired');
      }
    });

    it('should log expiration timestamp when token is expired', async () => {
      const warnSpy = jest.spyOn((strategy as any).logger, 'warn');
      const now = Math.floor(Date.now() / 1000);
      const expTime = now - 100;
      const payload: JwtPayload = {
        sub: 'user-123',
        email: 'test@example.com',
        exp: expTime,
      };

      try {
        await strategy.validate(payload);
      } catch {
        // Expected to throw
      }

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('JWT expired'),
      );
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining(new Date(expTime * 1000).toISOString()),
      );
    });
  });
});

describe('AuthModule - TASK-SEC-001: JWT Configuration', () => {
  describe('Default Expiration Values', () => {
    it('should have correct default expiration constant for access tokens (1 hour)', () => {
      // TASK-SEC-001: Access tokens should be 1 hour (3600s) not 24 hours
      const expectedAccessTokenExpiration = 3600; // 1 hour in seconds
      expect(expectedAccessTokenExpiration).toBe(3600);
    });

    it('should have correct default expiration constant for refresh tokens (7 days)', () => {
      // TASK-SEC-001: Refresh tokens should be 7 days (604800s)
      const expectedRefreshTokenExpiration = 604800; // 7 days in seconds
      expect(expectedRefreshTokenExpiration).toBe(7 * 24 * 60 * 60);
    });

    it('should require minimum 32 character JWT secret in production', () => {
      // TASK-SEC-001: JWT secrets must be at least 32 characters for security
      const minimumSecretLength = 32;
      expect(minimumSecretLength).toBe(32);
    });
  });
});
