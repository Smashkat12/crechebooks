import {
  Injectable,
  UnauthorizedException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { IUser } from '../../database/entities/user.entity';
import { PrismaService } from '../../database/prisma/prisma.service';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthResult extends AuthTokens {
  user: IUser;
}

interface Auth0TokenResponse {
  access_token: string;
  refresh_token?: string;
  id_token?: string;
  token_type: string;
  expires_in: number;
}

interface Auth0UserInfo {
  sub: string;
  email: string;
  name: string;
  picture?: string;
}

// State storage for CSRF protection (in production, use Redis)
const stateStore = new Map<
  string,
  { redirectUri: string; expiresAt: number }
>();

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly auth0Domain: string;
  private readonly auth0ClientId: string;
  private readonly auth0ClientSecret: string;
  private readonly auth0Audience: string;
  private readonly jwtExpiration: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {
    this.auth0Domain = this.configService.get<string>('AUTH0_DOMAIN') || '';
    this.auth0ClientId =
      this.configService.get<string>('AUTH0_CLIENT_ID') || '';
    this.auth0ClientSecret =
      this.configService.get<string>('AUTH0_CLIENT_SECRET') || '';
    this.auth0Audience = this.configService.get<string>('AUTH0_AUDIENCE') || '';
    this.jwtExpiration =
      this.configService.get<number>('JWT_EXPIRATION') || 86400;

    if (!this.auth0Domain) {
      this.logger.error('AUTH0_DOMAIN environment variable is required');
    }
    if (!this.auth0ClientId) {
      this.logger.error('AUTH0_CLIENT_ID environment variable is required');
    }
  }

  /**
   * Generate Auth0 authorization URL for OAuth login flow
   */
  getAuthorizationUrl(redirectUri: string): string {
    this.logger.debug(
      `Generating authorization URL for redirect: ${redirectUri}`,
    );

    if (!this.auth0Domain || !this.auth0ClientId) {
      this.logger.error('Auth0 configuration missing');
      throw new InternalServerErrorException(
        'Authentication service not configured',
      );
    }

    // Generate CSRF state token
    const state = crypto.randomBytes(32).toString('hex');

    // Store state with expiration (5 minutes)
    stateStore.set(state, {
      redirectUri,
      expiresAt: Date.now() + 5 * 60 * 1000,
    });

    // Clean up expired states
    this.cleanupExpiredStates();

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.auth0ClientId,
      redirect_uri: redirectUri,
      scope: 'openid profile email offline_access',
      state,
      audience: this.auth0Audience,
    });

    const authUrl = `https://${this.auth0Domain}/authorize?${params.toString()}`;
    this.logger.debug('Authorization URL generated successfully');

    return authUrl;
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(code: string, state: string): Promise<AuthResult> {
    this.logger.debug('Processing OAuth callback');

    // Validate state
    const storedState = stateStore.get(state);
    if (!storedState) {
      this.logger.warn('OAuth callback with invalid state');
      throw new UnauthorizedException('OAuth state expired or invalid');
    }

    if (storedState.expiresAt < Date.now()) {
      stateStore.delete(state);
      this.logger.warn('OAuth callback with expired state');
      throw new UnauthorizedException('OAuth state expired or invalid');
    }

    const redirectUri = storedState.redirectUri;
    stateStore.delete(state);

    // Exchange code for tokens
    let tokenResponse: Auth0TokenResponse;
    try {
      const response = await fetch(`https://${this.auth0Domain}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          client_id: this.auth0ClientId,
          client_secret: this.auth0ClientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.error(
          `Auth0 token exchange failed: ${response.status} - ${errorData}`,
        );
        throw new UnauthorizedException('Invalid authorization code');
      }

      tokenResponse = (await response.json()) as Auth0TokenResponse;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.error('Auth0 token exchange error', error);
      throw new UnauthorizedException('Failed to exchange authorization code');
    }

    // Get user info from Auth0
    let userInfo: Auth0UserInfo;
    try {
      const response = await fetch(`https://${this.auth0Domain}/userinfo`, {
        headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
      });

      if (!response.ok) {
        this.logger.error(`Auth0 userinfo failed: ${response.status}`);
        throw new UnauthorizedException('Failed to retrieve user information');
      }

      userInfo = (await response.json()) as Auth0UserInfo;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.error('Auth0 userinfo error', error);
      throw new UnauthorizedException('Failed to retrieve user information');
    }

    // Find or validate user
    const user = await this.prisma.user.findUnique({
      where: { auth0Id: userInfo.sub },
    });

    if (!user) {
      this.logger.warn(`No user found for auth0Id: ${userInfo.sub}`);
      throw new UnauthorizedException('User account not found');
    }

    if (!user.isActive) {
      this.logger.warn(`Inactive user login attempt: ${user.id}`);
      throw new UnauthorizedException('User account is deactivated');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.debug(`User authenticated successfully: ${user.id}`);

    return {
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || '',
      expiresIn: tokenResponse.expires_in,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        auth0Id: user.auth0Id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string; expiresIn: number }> {
    this.logger.debug('Processing token refresh');

    if (!refreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    try {
      const response = await fetch(`https://${this.auth0Domain}/oauth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: this.auth0ClientId,
          client_secret: this.auth0ClientSecret,
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        const errorData = await response.text();
        this.logger.warn(
          `Token refresh failed: ${response.status} - ${errorData}`,
        );
        throw new UnauthorizedException('Invalid or expired refresh token');
      }

      const tokenResponse = (await response.json()) as Auth0TokenResponse;
      this.logger.debug('Token refresh successful');

      return {
        accessToken: tokenResponse.access_token,
        expiresIn: tokenResponse.expires_in,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.error('Token refresh error', error);
      throw new UnauthorizedException('Failed to refresh token');
    }
  }

  /**
   * Validate user exists by auth0Id
   */
  async validateUser(auth0Id: string): Promise<IUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { auth0Id },
    });

    if (!user) return null;

    return {
      id: user.id,
      tenantId: user.tenantId,
      auth0Id: user.auth0Id,
      email: user.email,
      name: user.name,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Clean up expired state tokens
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    for (const [key, value] of stateStore.entries()) {
      if (value.expiresAt < now) {
        stateStore.delete(key);
      }
    }
  }
}
