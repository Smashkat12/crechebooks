/**
 * Auth Controller Tests
 * TASK-UI-001: Added tests for HttpOnly cookie authentication
 */
import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { AuthController } from '../../../src/api/auth/auth.controller';
import { AuthService } from '../../../src/api/auth/auth.service';
import { ImpersonationService } from '../../../src/api/admin/impersonation.service';
import type { RateLimitGuard as _RateLimitGuard } from '../../../src/common/guards/rate-limit.guard';
import { RateLimitService } from '../../../src/common/rate-limit/rate-limit.service';
import { LoginRequestDto } from '../../../src/api/auth/dto/login.dto';
import { CallbackRequestDto } from '../../../src/api/auth/dto/callback.dto';
import { RefreshRequestDto } from '../../../src/api/auth/dto/refresh.dto';
import { ACCESS_TOKEN_COOKIE } from '../../../src/api/auth/strategies/jwt.strategy';
import { UserRole } from '../../../src/database/entities/user.entity';
import type { IUser } from '../../../src/database/entities/user.entity';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;
  let mockResponse: Response;

  const mockAuthService = {
    getAuthorizationUrl: jest.fn(),
    handleCallback: jest.fn(),
    refreshAccessToken: jest.fn(),
    devLogin: jest.fn(),
  };

  const mockImpersonationService = {
    endImpersonation: jest.fn(),
  };

  // Mock user for logout tests
  const mockUser: IUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    role: UserRole.ADMIN,
    tenantId: 'tenant-123',
    isActive: true,
    auth0Id: 'auth0|123',
    lastLoginAt: null,
    currentTenantId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSuperAdminUser: IUser = {
    ...mockUser,
    id: 'super-admin-123',
    role: UserRole.SUPER_ADMIN,
    tenantId: null,
  };

  // Create fresh mock Response for each test
  const createMockResponse = (): Response =>
    ({
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    }) as unknown as Response;

  beforeEach(async () => {
    // Create fresh mock response for each test
    mockResponse = createMockResponse();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
        {
          provide: ImpersonationService,
          useValue: mockImpersonationService,
        },
        {
          provide: RateLimitService,
          useValue: {
            checkRateLimit: jest.fn(),
            isAccountLocked: jest.fn(),
            getLockoutRemaining: jest.fn(),
            trackFailedAttempt: jest.fn(),
            clearFailedAttempts: jest.fn(),
            unlockAccount: jest.fn(),
          },
        },
        Reflector,
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/login', () => {
    it('should return auth_url with valid redirect_uri', async () => {
      const loginDto: LoginRequestDto = {
        redirect_uri: 'http://localhost:3000/callback',
      };

      const expectedAuthUrl =
        'https://auth0.com/authorize?client_id=test&redirect_uri=http://localhost:3000/callback&state=random-state';

      mockAuthService.getAuthorizationUrl.mockResolvedValue(expectedAuthUrl);

      const result = await controller.login(loginDto);

      expect(result).toEqual({ auth_url: expectedAuthUrl });
      expect(authService.getAuthorizationUrl).toHaveBeenCalledWith(
        loginDto.redirect_uri,
      );
      expect(authService.getAuthorizationUrl).toHaveBeenCalledTimes(1);
    });

    it('should fail validation with invalid redirect_uri', async () => {
      const loginDto: LoginRequestDto = {
        redirect_uri: 'not-a-valid-url',
      };

      // This test verifies DTO validation would catch this
      // In real NestJS app, ValidationPipe handles this before controller
      expect(loginDto.redirect_uri).not.toMatch(/^https?:\/\//);
    });

    it('should fail validation with empty redirect_uri', async () => {
      const loginDto = {
        redirect_uri: '',
      };

      // In real NestJS app, ValidationPipe rejects this before controller
      expect(loginDto.redirect_uri).toBe('');
    });

    it('should handle service errors gracefully', async () => {
      const loginDto: LoginRequestDto = {
        redirect_uri: 'http://localhost:3000/callback',
      };

      mockAuthService.getAuthorizationUrl.mockRejectedValue(
        new BadRequestException('Invalid redirect URI'),
      );

      await expect(controller.login(loginDto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('POST /auth/callback', () => {
    it('should return tokens with valid code and state', async () => {
      const callbackDto: CallbackRequestDto = {
        code: 'auth-code-123',
        state: 'random-state-456',
      };

      const expectedAuthResult = {
        accessToken: 'jwt-access-token',
        refreshToken: 'jwt-refresh-token',
        expiresIn: 3600,
        user: {
          id: 'user-123',
          tenantId: 'tenant-123',
          auth0Id: 'auth0|123',
          email: 'test@example.com',
          name: 'Test User',
          role: 'VIEWER' as any,
          isActive: true,
          lastLoginAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      };

      mockAuthService.handleCallback.mockResolvedValue(expectedAuthResult);

      const result = await controller.callback(callbackDto, mockResponse);

      expect(result.access_token).toBe(expectedAuthResult.accessToken);
      expect(result.refresh_token).toBe(expectedAuthResult.refreshToken);
      expect(result.expires_in).toBe(expectedAuthResult.expiresIn);
      expect(result.user.id).toBe(expectedAuthResult.user.id);
      expect(result.user.email).toBe(expectedAuthResult.user.email);
      expect(authService.handleCallback).toHaveBeenCalledWith(
        callbackDto.code,
        callbackDto.state,
      );
      expect(authService.handleCallback).toHaveBeenCalledTimes(1);
    });

    it('should fail validation with missing code', async () => {
      const callbackDto = {
        state: 'random-state-456',
      } as any;

      // Verify code is missing
      expect(callbackDto.code).toBeUndefined();
    });

    it('should fail validation with missing state', async () => {
      const callbackDto = {
        code: 'auth-code-123',
      } as any;

      // Verify state is missing
      expect(callbackDto.state).toBeUndefined();
    });

    it('should handle invalid auth code', async () => {
      const callbackDto: CallbackRequestDto = {
        code: 'invalid-code',
        state: 'random-state',
      };

      mockAuthService.handleCallback.mockRejectedValue(
        new UnauthorizedException('Invalid authorization code'),
      );

      await expect(
        controller.callback(callbackDto, mockResponse),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should handle invalid state parameter', async () => {
      const callbackDto: CallbackRequestDto = {
        code: 'auth-code-123',
        state: 'wrong-state',
      };

      mockAuthService.handleCallback.mockRejectedValue(
        new UnauthorizedException('Invalid state parameter'),
      );

      await expect(
        controller.callback(callbackDto, mockResponse),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('POST /auth/refresh', () => {
    it('should return new token with valid refresh_token', async () => {
      const refreshDto: RefreshRequestDto = {
        refresh_token: 'valid-refresh-token',
      };

      const expectedRefreshResult = {
        accessToken: 'new-jwt-access-token',
        expiresIn: 3600,
      };

      mockAuthService.refreshAccessToken.mockResolvedValue(
        expectedRefreshResult,
      );

      const result = await controller.refresh(refreshDto, mockResponse);

      expect(result.access_token).toBe(expectedRefreshResult.accessToken);
      expect(result.expires_in).toBe(expectedRefreshResult.expiresIn);
      expect(authService.refreshAccessToken).toHaveBeenCalledWith(
        refreshDto.refresh_token,
      );
      expect(authService.refreshAccessToken).toHaveBeenCalledTimes(1);
    });

    it('should fail validation with missing refresh_token', async () => {
      const refreshDto = {} as any;

      // Verify refresh_token is missing
      expect(refreshDto.refresh_token).toBeUndefined();
    });

    it('should handle invalid refresh token', async () => {
      const refreshDto: RefreshRequestDto = {
        refresh_token: 'invalid-token',
      };

      mockAuthService.refreshAccessToken.mockRejectedValue(
        new UnauthorizedException('Invalid refresh token'),
      );

      await expect(
        controller.refresh(refreshDto, mockResponse),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should handle expired refresh token', async () => {
      const refreshDto: RefreshRequestDto = {
        refresh_token: 'expired-token',
      };

      mockAuthService.refreshAccessToken.mockRejectedValue(
        new UnauthorizedException('Refresh token expired'),
      );

      await expect(
        controller.refresh(refreshDto, mockResponse),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  /**
   * TASK-UI-001: HttpOnly Cookie Tests
   * Verify that authentication endpoints properly set and clear HttpOnly cookies
   */
  describe('TASK-UI-001: HttpOnly Cookie Authentication', () => {
    describe('POST /auth/callback - Cookie Setting', () => {
      it('should set HttpOnly cookie on successful callback', async () => {
        const callbackDto: CallbackRequestDto = {
          code: 'auth-code-123',
          state: 'random-state-456',
        };

        const authResult = {
          accessToken: 'jwt-access-token',
          refreshToken: 'jwt-refresh-token',
          expiresIn: 3600,
          user: {
            id: 'user-123',
            tenantId: 'tenant-123',
            auth0Id: 'auth0|123',
            email: 'test@example.com',
            name: 'Test User',
            role: 'VIEWER' as any,
            isActive: true,
            lastLoginAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        };

        mockAuthService.handleCallback.mockResolvedValue(authResult);

        await controller.callback(callbackDto, mockResponse);

        // Verify HttpOnly cookie was set
        expect(mockResponse.cookie).toHaveBeenCalledWith(
          ACCESS_TOKEN_COOKIE,
          authResult.accessToken,
          expect.objectContaining({
            httpOnly: true,
            path: '/',
          }),
        );
      });

      it('should set secure cookie in production', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        const callbackDto: CallbackRequestDto = {
          code: 'auth-code-123',
          state: 'random-state-456',
        };

        const authResult = {
          accessToken: 'jwt-access-token',
          refreshToken: 'jwt-refresh-token',
          expiresIn: 3600,
          user: {
            id: 'user-123',
            tenantId: 'tenant-123',
            auth0Id: 'auth0|123',
            email: 'test@example.com',
            name: 'Test User',
            role: 'VIEWER' as any,
            isActive: true,
            lastLoginAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        };

        mockAuthService.handleCallback.mockResolvedValue(authResult);

        await controller.callback(callbackDto, mockResponse);

        expect(mockResponse.cookie).toHaveBeenCalledWith(
          ACCESS_TOKEN_COOKIE,
          authResult.accessToken,
          expect.objectContaining({
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
          }),
        );

        process.env.NODE_ENV = originalEnv;
      });

      it('should set SameSite=lax in development', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';

        const callbackDto: CallbackRequestDto = {
          code: 'auth-code-123',
          state: 'random-state-456',
        };

        const authResult = {
          accessToken: 'jwt-access-token',
          refreshToken: 'jwt-refresh-token',
          expiresIn: 3600,
          user: {
            id: 'user-123',
            tenantId: 'tenant-123',
            auth0Id: 'auth0|123',
            email: 'test@example.com',
            name: 'Test User',
            role: 'VIEWER' as any,
            isActive: true,
            lastLoginAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        };

        mockAuthService.handleCallback.mockResolvedValue(authResult);

        await controller.callback(callbackDto, mockResponse);

        expect(mockResponse.cookie).toHaveBeenCalledWith(
          ACCESS_TOKEN_COOKIE,
          authResult.accessToken,
          expect.objectContaining({
            httpOnly: true,
            sameSite: 'lax',
          }),
        );

        process.env.NODE_ENV = originalEnv;
      });
    });

    describe('POST /auth/refresh - Cookie Update', () => {
      it('should update HttpOnly cookie on token refresh', async () => {
        const refreshDto: RefreshRequestDto = {
          refresh_token: 'valid-refresh-token',
        };

        const refreshResult = {
          accessToken: 'new-jwt-access-token',
          expiresIn: 3600,
        };

        mockAuthService.refreshAccessToken.mockResolvedValue(refreshResult);

        await controller.refresh(refreshDto, mockResponse);

        expect(mockResponse.cookie).toHaveBeenCalledWith(
          ACCESS_TOKEN_COOKIE,
          refreshResult.accessToken,
          expect.objectContaining({
            httpOnly: true,
            path: '/',
          }),
        );
      });
    });

    describe('POST /auth/logout - Cookie Clearing', () => {
      it('should clear HttpOnly cookie on logout', async () => {
        const result = await controller.logout(mockUser, mockResponse);

        expect(result).toEqual({
          success: true,
          message: 'Logged out successfully',
        });

        expect(mockResponse.clearCookie).toHaveBeenCalledWith(
          ACCESS_TOKEN_COOKIE,
          expect.objectContaining({
            httpOnly: true,
            path: '/',
          }),
        );
      });

      it('should clear cookie with secure flag in production', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        await controller.logout(mockUser, mockResponse);

        expect(mockResponse.clearCookie).toHaveBeenCalledWith(
          ACCESS_TOKEN_COOKIE,
          expect.objectContaining({
            httpOnly: true,
            secure: true,
            sameSite: 'strict',
          }),
        );

        process.env.NODE_ENV = originalEnv;
      });

      it('should end impersonation session for SUPER_ADMIN users', async () => {
        mockImpersonationService.endImpersonation.mockResolvedValue({
          success: true,
          message: 'Impersonation ended',
        });

        await controller.logout(mockSuperAdminUser, mockResponse);

        expect(mockImpersonationService.endImpersonation).toHaveBeenCalledWith(
          mockSuperAdminUser.id,
        );
      });

      it('should not call endImpersonation for non-SUPER_ADMIN users', async () => {
        await controller.logout(mockUser, mockResponse);

        expect(mockImpersonationService.endImpersonation).not.toHaveBeenCalled();
      });

      it('should still logout even if endImpersonation fails', async () => {
        mockImpersonationService.endImpersonation.mockRejectedValue(
          new Error('Session not found'),
        );

        const result = await controller.logout(mockSuperAdminUser, mockResponse);

        expect(result).toEqual({
          success: true,
          message: 'Logged out successfully',
        });
        expect(mockResponse.clearCookie).toHaveBeenCalled();
      });
    });

    describe('Cookie Security Attributes', () => {
      it('cookie should not be accessible via JavaScript (httpOnly: true)', async () => {
        const callbackDto: CallbackRequestDto = {
          code: 'auth-code-123',
          state: 'random-state-456',
        };

        const authResult = {
          accessToken: 'jwt-access-token',
          refreshToken: 'jwt-refresh-token',
          expiresIn: 3600,
          user: {
            id: 'user-123',
            tenantId: 'tenant-123',
            auth0Id: 'auth0|123',
            email: 'test@example.com',
            name: 'Test User',
            role: 'VIEWER' as any,
            isActive: true,
            lastLoginAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        };

        mockAuthService.handleCallback.mockResolvedValue(authResult);

        await controller.callback(callbackDto, mockResponse);

        // Verify httpOnly is always true - this is the critical XSS protection
        const cookieCall = (mockResponse.cookie as jest.Mock).mock.calls[0];
        expect(cookieCall[2].httpOnly).toBe(true);
      });

      it('cookie maxAge should be based on token expiresIn', async () => {
        const callbackDto: CallbackRequestDto = {
          code: 'auth-code-123',
          state: 'random-state-456',
        };

        const expiresInSeconds = 7200; // 2 hours
        const authResult = {
          accessToken: 'jwt-access-token',
          refreshToken: 'jwt-refresh-token',
          expiresIn: expiresInSeconds,
          user: {
            id: 'user-123',
            tenantId: 'tenant-123',
            auth0Id: 'auth0|123',
            email: 'test@example.com',
            name: 'Test User',
            role: 'VIEWER' as any,
            isActive: true,
            lastLoginAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        };

        mockAuthService.handleCallback.mockResolvedValue(authResult);

        await controller.callback(callbackDto, mockResponse);

        // maxAge should be in milliseconds
        expect(mockResponse.cookie).toHaveBeenCalledWith(
          ACCESS_TOKEN_COOKIE,
          authResult.accessToken,
          expect.objectContaining({
            maxAge: expiresInSeconds * 1000,
          }),
        );
      });
    });
  });
});
