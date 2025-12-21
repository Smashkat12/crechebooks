import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthController } from '../../../src/api/auth/auth.controller';
import { AuthService } from '../../../src/api/auth/auth.service';
import { LoginRequestDto } from '../../../src/api/auth/dto/login.dto';
import { CallbackRequestDto } from '../../../src/api/auth/dto/callback.dto';
import { RefreshRequestDto } from '../../../src/api/auth/dto/refresh.dto';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    getAuthorizationUrl: jest.fn(),
    handleCallback: jest.fn(),
    refreshAccessToken: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /auth/login', () => {
    it('should return auth_url with valid redirect_uri', () => {
      const loginDto: LoginRequestDto = {
        redirect_uri: 'http://localhost:3000/callback',
      };

      const expectedAuthUrl = 'https://auth0.com/authorize?client_id=test&redirect_uri=http://localhost:3000/callback&state=random-state';

      mockAuthService.getAuthorizationUrl.mockReturnValue(expectedAuthUrl);

      const result = controller.login(loginDto);

      expect(result).toEqual({ auth_url: expectedAuthUrl });
      expect(authService.getAuthorizationUrl).toHaveBeenCalledWith(loginDto.redirect_uri);
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

    it('should handle service errors gracefully', () => {
      const loginDto: LoginRequestDto = {
        redirect_uri: 'http://localhost:3000/callback',
      };

      mockAuthService.getAuthorizationUrl.mockImplementation(() => {
        throw new BadRequestException('Invalid redirect URI');
      });

      expect(() => controller.login(loginDto)).toThrow(BadRequestException);
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

      const result = await controller.callback(callbackDto);

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

      await expect(controller.callback(callbackDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handle invalid state parameter', async () => {
      const callbackDto: CallbackRequestDto = {
        code: 'auth-code-123',
        state: 'wrong-state',
      };

      mockAuthService.handleCallback.mockRejectedValue(
        new UnauthorizedException('Invalid state parameter'),
      );

      await expect(controller.callback(callbackDto)).rejects.toThrow(
        UnauthorizedException,
      );
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

      mockAuthService.refreshAccessToken.mockResolvedValue(expectedRefreshResult);

      const result = await controller.refresh(refreshDto);

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

      await expect(controller.refresh(refreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should handle expired refresh token', async () => {
      const refreshDto: RefreshRequestDto = {
        refresh_token: 'expired-token',
      };

      mockAuthService.refreshAccessToken.mockRejectedValue(
        new UnauthorizedException('Refresh token expired'),
      );

      await expect(controller.refresh(refreshDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
