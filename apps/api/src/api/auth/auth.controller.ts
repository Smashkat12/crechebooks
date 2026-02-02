/**
 * Authentication Controller
 * TASK-UI-001: Set HttpOnly cookies for XSS protection
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBadRequestResponse,
  ApiUnauthorizedResponse,
  ApiTooManyRequestsResponse,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginRequestDto, LoginResponseDto } from './dto/login.dto';
import {
  CallbackRequestDto,
  AuthCallbackResponseDto,
} from './dto/callback.dto';
import { RefreshRequestDto, RefreshResponseDto } from './dto/refresh.dto';
import { DevLoginRequestDto, DevLoginResponseDto } from './dto/dev-login.dto';
import { Public } from './decorators/public.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import {
  RateLimit,
  RateLimitPresets,
} from '../../common/decorators/rate-limit.decorator';
import { StrictRateLimit } from '../../common/decorators/throttle.decorator';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { ACCESS_TOKEN_COOKIE } from './strategies/jwt.strategy';
import { ImpersonationService } from '../admin/impersonation.service';
import type { IUser } from '../../database/entities/user.entity';
import { UserRole } from '../../database/entities/user.entity';

@Controller('auth')
@ApiTags('Authentication')
@UseGuards(RateLimitGuard)
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly authService: AuthService,
    private readonly impersonationService: ImpersonationService,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @StrictRateLimit() // TASK-INFRA-003: Apply strict throttling (5 req/min)
  @RateLimit(RateLimitPresets.AUTH_LOGIN)
  @ApiOperation({
    summary: 'Initiate OAuth login flow',
    description: 'Returns Auth0 authorization URL to redirect user to',
  })
  @ApiResponse({
    status: 200,
    description: 'Authorization URL generated',
    type: LoginResponseDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid redirect URI',
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many login attempts. Try again later.',
  })
  async login(@Body() dto: LoginRequestDto): Promise<LoginResponseDto> {
    this.logger.debug(`Login initiated with redirect: ${dto.redirect_uri}`);
    const authUrl = await this.authService.getAuthorizationUrl(
      dto.redirect_uri,
    );
    return { auth_url: authUrl };
  }

  @Post('callback')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Handle OAuth callback',
    description:
      'Exchange authorization code for tokens and user info. TASK-UI-001: Sets HttpOnly cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'Authentication successful',
    type: AuthCallbackResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid authorization code or state',
  })
  async callback(
    @Body() dto: CallbackRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthCallbackResponseDto> {
    this.logger.debug('Processing OAuth callback');
    const result = await this.authService.handleCallback(dto.code, dto.state);

    // TASK-UI-001: Set HttpOnly cookie for XSS protection
    this.setAccessTokenCookie(res, result.accessToken, result.expiresIn);

    return {
      access_token: result.accessToken,
      refresh_token: result.refreshToken,
      expires_in: result.expiresIn,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        tenant_id: result.user.tenantId,
      },
    };
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description:
      'Exchange refresh token for a new access token. TASK-UI-001: Updates HttpOnly cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    type: RefreshResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired refresh token',
  })
  async refresh(
    @Body() dto: RefreshRequestDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<RefreshResponseDto> {
    this.logger.debug('Processing token refresh');
    const result = await this.authService.refreshAccessToken(dto.refresh_token);

    // TASK-UI-001: Update HttpOnly cookie with new access token
    this.setAccessTokenCookie(res, result.accessToken, result.expiresIn);

    return {
      access_token: result.accessToken,
      expires_in: result.expiresIn,
    };
  }

  @Post('dev-login')
  @Public()
  @HttpCode(HttpStatus.OK)
  @RateLimit(RateLimitPresets.AUTH_DEV_LOGIN)
  @ApiOperation({
    summary: 'Dev login (development only)',
    description:
      'Login with test credentials in development mode. Returns JWT token. TASK-UI-001: Sets HttpOnly cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    type: DevLoginResponseDto,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials or not in development mode',
  })
  @ApiTooManyRequestsResponse({
    description: 'Too many login attempts. Try again later.',
  })
  async devLogin(
    @Body() dto: DevLoginRequestDto,
    @Req() request: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DevLoginResponseDto> {
    this.logger.debug(`Dev login attempt for: ${dto.email}`);

    // Extract client IP for rate limiting tracking
    const clientIp = this.getClientIp(request);

    const result = await this.authService.devLogin(
      dto.email,
      dto.password,
      clientIp,
    );

    // TASK-UI-001: Set HttpOnly cookie for XSS protection
    this.setAccessTokenCookie(res, result.accessToken, result.expiresIn);

    return {
      access_token: result.accessToken,
      expires_in: result.expiresIn,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        tenant_id: result.user.tenantId,
      },
    };
  }

  /**
   * Extract client IP from request for rate limiting.
   */
  private getClientIp(request: Request): string {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }

    const realIp = request.headers['x-real-ip'];
    if (realIp && typeof realIp === 'string') {
      return realIp.trim();
    }

    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  /**
   * TASK-UI-001: Set HttpOnly cookie with access token
   * - HttpOnly: Prevents JavaScript access (XSS protection)
   * - Secure: Only sent over HTTPS in production
   * - SameSite: Strict for CSRF protection
   * - Path: /api to limit cookie scope
   */
  private setAccessTokenCookie(
    res: Response,
    accessToken: string,
    expiresInSeconds: number,
  ): void {
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      maxAge: expiresInSeconds * 1000, // Convert to milliseconds
      path: '/', // Allow all API routes and frontend
    });

    this.logger.debug('TASK-UI-001: Set HttpOnly access_token cookie');
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout user',
    description:
      'Clears the HttpOnly authentication cookie and ends any active impersonation session. ' +
      'TASK-UI-001: Cookie-based logout. TASK-ADMIN-001: Impersonation cleanup.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
  })
  async logout(
    @CurrentUser() user: IUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    this.logger.debug(`Processing logout request for user ${user?.id}`);

    // TASK-ADMIN-001: End any active impersonation session for SUPER_ADMIN users
    if (user?.role === UserRole.SUPER_ADMIN) {
      try {
        await this.impersonationService.endImpersonation(user.id);
        this.logger.debug(
          `Ended impersonation session for SUPER_ADMIN ${user.id} on logout`,
        );
      } catch (error) {
        // Log but don't fail logout if impersonation cleanup fails
        this.logger.warn(
          `Failed to end impersonation session on logout: ${error}`,
        );
      }
    }

    // TASK-UI-001: Clear HttpOnly cookie
    this.clearAccessTokenCookie(res);

    return {
      success: true,
      message: 'Logged out successfully',
    };
  }

  /**
   * TASK-UI-001: Clear HttpOnly cookies on logout
   * Also clears admin_token cookie used during impersonation
   */
  private clearAccessTokenCookie(res: Response): void {
    const isProduction = process.env.NODE_ENV === 'production';

    // Clear the main access token cookie
    res.clearCookie(ACCESS_TOKEN_COOKIE, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
    });

    // Also clear the admin_token cookie (used during impersonation)
    // This ensures clean state after logout even if user was impersonating
    res.clearCookie('admin_token', {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'lax',
      path: '/',
    });

    this.logger.debug(
      'TASK-UI-001: Cleared HttpOnly access_token and admin_token cookies',
    );
  }
}
