import {
  Injectable,
  UnauthorizedException,
  Logger,
  InternalServerErrorException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import { IUser } from '../../database/entities/user.entity';
import { PrismaService } from '../../database/prisma/prisma.service';
import { CsrfStoreService } from './csrf-store.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { TooManyRequestsException } from '../../shared/exceptions';
import { JWT_EXPIRATION_DEFAULT } from './auth.module';

interface DevUserConfig {
  passwordHash: string;
  name: string;
  role: string;
}

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
    private readonly csrfStore: CsrfStoreService,
    private readonly rateLimitService: RateLimitService,
  ) {
    this.auth0Domain = this.configService.get<string>('AUTH0_DOMAIN') || '';
    this.auth0ClientId =
      this.configService.get<string>('AUTH0_CLIENT_ID') || '';
    this.auth0ClientSecret =
      this.configService.get<string>('AUTH0_CLIENT_SECRET') || '';
    this.auth0Audience = this.configService.get<string>('AUTH0_AUDIENCE') || '';
    // TASK-SEC-001: Parse JWT_EXPIRATION as number, use default for development (8 hours)
    const jwtExpirationStr = this.configService.get<string>('JWT_EXPIRATION');
    this.jwtExpiration = jwtExpirationStr
      ? parseInt(jwtExpirationStr, 10) || JWT_EXPIRATION_DEFAULT
      : JWT_EXPIRATION_DEFAULT;

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
  async getAuthorizationUrl(redirectUri: string): Promise<string> {
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

    // Store state in Redis with 5 minute TTL
    // NO FALLBACK - if Redis is unavailable, this will throw
    try {
      await this.csrfStore.storeState(state, redirectUri, 300);
    } catch (error) {
      this.logger.error(
        `Failed to store CSRF state in Redis: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        'Authentication service temporarily unavailable. Please try again.',
      );
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.auth0ClientId,
      redirect_uri: redirectUri,
      scope: 'openid profile email offline_access',
      state,
      audience: this.auth0Audience,
      prompt: 'login', // Force Auth0 to show login screen, allowing user to choose account
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

    // Validate and consume state from Redis (atomic get + delete)
    // NO FALLBACK - if Redis is unavailable, this will throw
    let storedState;
    try {
      storedState = await this.csrfStore.validateAndConsume(state);
    } catch (error) {
      this.logger.error(
        `Failed to validate CSRF state from Redis: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        'Authentication service temporarily unavailable. Please try again.',
      );
    }

    if (!storedState) {
      this.logger.warn('OAuth callback with invalid or expired state');
      throw new UnauthorizedException('OAuth state expired or invalid');
    }

    if (storedState.expiresAt < Date.now()) {
      this.logger.warn('OAuth callback with expired state');
      throw new UnauthorizedException('OAuth state expired or invalid');
    }

    const redirectUri = storedState.redirectUri;

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

    // Find user by auth0Id first
    let user = await this.prisma.user.findUnique({
      where: { auth0Id: userInfo.sub },
    });

    // If not found by auth0Id, try to find by email and link the account
    if (!user && userInfo.email) {
      const userByEmail = await this.prisma.user.findFirst({
        where: { email: userInfo.email },
      });

      if (userByEmail) {
        // Check if this user has a temporary auth0Id (from signup before Auth0 integration)
        const hasTempAuth0Id =
          userByEmail.auth0Id?.startsWith('auth0|temp-') ||
          userByEmail.auth0Id?.startsWith('dev-');

        if (hasTempAuth0Id) {
          // Link the existing account to the real Auth0 ID
          this.logger.log(
            `Linking existing user ${userByEmail.id} (${userByEmail.email}) ` +
              `from temp auth0Id to real Auth0: ${userInfo.sub}`,
          );

          user = await this.prisma.user.update({
            where: { id: userByEmail.id },
            data: { auth0Id: userInfo.sub },
          });

          // Log the account linking for audit
          if (user.tenantId) {
            await this.prisma.auditLog.create({
              data: {
                tenantId: user.tenantId,
                userId: user.id,
                entityType: 'USER',
                entityId: user.id,
                action: 'UPDATE',
                beforeValue: { auth0Id: userByEmail.auth0Id },
                afterValue: {
                  auth0Id: userInfo.sub,
                  linkedAt: new Date().toISOString(),
                },
                changeSummary: 'Linked Auth0 account on first SSO login',
              },
            });
          }
        } else {
          // User exists with a different auth0Id - could be a duplicate account
          this.logger.warn(
            `User found by email ${userInfo.email} but has different auth0Id: ` +
              `database=${userByEmail.auth0Id}, auth0=${userInfo.sub}`,
          );
          throw new UnauthorizedException(
            'User account configuration mismatch. Please contact support.',
          );
        }
      }
    }

    if (!user) {
      this.logger.warn(
        `No user found for auth0Id: ${userInfo.sub} or email: ${userInfo.email}`,
      );
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
        currentTenantId: user.currentTenantId,
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
      currentTenantId: user.currentTenantId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * Update user profile
   * TASK-FIX-002: Profile Update Implementation
   */
  async updateProfile(
    userId: string,
    dto: { name?: string; email?: string },
  ): Promise<{ id: string; name: string; email: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      this.logger.error(`User not found for profile update: ${userId}`);
      throw new NotFoundException('User not found');
    }

    // If email is changing, check if it's already in use by another user
    if (dto.email && dto.email !== user.email) {
      const existingUser = await this.prisma.user.findFirst({
        where: {
          email: dto.email,
          id: { not: userId },
        },
      });
      if (existingUser) {
        this.logger.warn(
          `Email already in use during profile update: ${dto.email}`,
        );
        throw new ConflictException('Email already in use');
      }
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.email && { email: dto.email }),
      },
    });

    this.logger.log(`Profile updated for user ${userId}`);

    return {
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email,
    };
  }

  /**
   * JWT-based login - for development or JWT auth provider mode
   * Generates a JWT token for configured users without Auth0
   * Credentials are sourced from environment variables, never hardcoded
   *
   * Available when:
   * - NODE_ENV=development with DEV_AUTH_ENABLED=true
   * - AUTH_PROVIDER=jwt with DEV_AUTH_ENABLED=true (any environment)
   *
   * @param email - User email
   * @param password - User password
   * @param clientIp - Client IP address for rate limiting (optional)
   */
  async devLogin(
    email: string,
    password: string,
    clientIp?: string,
  ): Promise<AuthResult> {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const jwtSecret = this.configService.get<string>('JWT_SECRET');
    const devAuthEnabled = this.configService.get<string>('DEV_AUTH_ENABLED');
    const authProvider =
      this.configService.get<string>('AUTH_PROVIDER') || 'auth0';

    // Allow login when:
    // 1. Development mode with DEV_AUTH_ENABLED=true
    // 2. JWT auth provider with DEV_AUTH_ENABLED=true (any environment)
    const isDevelopmentMode =
      nodeEnv === 'development' && devAuthEnabled === 'true';
    const isJwtProviderMode =
      authProvider === 'jwt' && devAuthEnabled === 'true';

    if ((!isDevelopmentMode && !isJwtProviderMode) || !jwtSecret) {
      this.logger.error(
        `Login attempted but not allowed. NODE_ENV=${nodeEnv}, AUTH_PROVIDER=${authProvider}, DEV_AUTH_ENABLED=${devAuthEnabled}`,
      );
      throw new UnauthorizedException(
        'Login is only available in development mode with DEV_AUTH_ENABLED=true, ' +
          'or in production with AUTH_PROVIDER=jwt and DEV_AUTH_ENABLED=true',
      );
    }

    // Rate limiting identifiers
    const ipKey = clientIp ? `ip:${clientIp}` : null;
    const emailKey = `email:${email}`;

    // Check if account is locked (by email or IP)
    try {
      if (ipKey) {
        const ipLocked = await this.rateLimitService.isAccountLocked(ipKey);
        if (ipLocked) {
          const remaining =
            await this.rateLimitService.getLockoutRemaining(ipKey);
          this.logger.warn(`Dev login blocked - IP locked: ${clientIp}`);
          throw new TooManyRequestsException(
            'Too many failed attempts. Account temporarily locked.',
            remaining,
            { reason: 'ip_locked' },
          );
        }
      }

      const emailLocked = await this.rateLimitService.isAccountLocked(emailKey);
      if (emailLocked) {
        const remaining =
          await this.rateLimitService.getLockoutRemaining(emailKey);
        this.logger.warn(`Dev login blocked - email locked: ${email}`);
        throw new TooManyRequestsException(
          'Too many failed attempts. Account temporarily locked.',
          remaining,
          { reason: 'email_locked' },
        );
      }
    } catch (error) {
      if (error instanceof TooManyRequestsException) {
        throw error;
      }
      this.logger.error(
        `Rate limit check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new InternalServerErrorException(
        'Authentication service temporarily unavailable',
      );
    }

    // First, check for trial users (signed up via the public signup form)
    const existingUser = await this.prisma.user.findFirst({
      where: { email },
      include: { tenant: true },
    });

    if (existingUser) {
      // Check if this is a trial user - look for password hash in audit log
      const signupAuditLog = await this.prisma.auditLog.findFirst({
        where: {
          userId: existingUser.id,
          action: 'TRIAL_SIGNUP',
        },
        orderBy: { createdAt: 'desc' },
      });

      if (signupAuditLog?.afterValue) {
        const afterValue = signupAuditLog.afterValue as {
          hashedPassword?: string;
        };
        if (afterValue.hashedPassword) {
          // Verify password against stored hash
          const isPasswordValid = await bcrypt.compare(
            password,
            afterValue.hashedPassword,
          );

          if (isPasswordValid) {
            // Clear failed attempts on successful login
            await this.clearFailedAttemptsOnSuccess(ipKey, emailKey);

            // Generate JWT token for trial user
            const payload = {
              sub: existingUser.id,
              email: existingUser.email,
              tenantId: existingUser.tenantId,
              role: existingUser.role,
            };

            const accessToken = this.jwtService.sign(payload, {
              expiresIn: this.jwtExpiration,
            });

            // Update last login
            await this.prisma.user.update({
              where: { id: existingUser.id },
              data: { lastLoginAt: new Date() },
            });

            this.logger.log(`Trial user login successful for: ${email}`);

            return {
              accessToken,
              refreshToken: '',
              expiresIn: this.jwtExpiration,
              user: {
                id: existingUser.id,
                tenantId: existingUser.tenantId,
                auth0Id: existingUser.auth0Id,
                email: existingUser.email,
                name: existingUser.name,
                role: existingUser.role,
                isActive: existingUser.isActive,
                lastLoginAt: existingUser.lastLoginAt,
                currentTenantId: existingUser.currentTenantId,
                createdAt: existingUser.createdAt,
                updatedAt: existingUser.updatedAt,
              },
            };
          }
        }
      }
    }

    // Fall back to dev users from environment variables
    const validDevUsers = this.getDevUsersFromEnv();

    const devUser = validDevUsers.get(email);
    if (!devUser) {
      this.logger.warn(`Invalid dev login attempt for unknown email: ${email}`);
      await this.handleFailedAttempt(ipKey, emailKey);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Compare password using bcrypt
    const isPasswordValid = await bcrypt.compare(
      password,
      devUser.passwordHash,
    );
    if (!isPasswordValid) {
      this.logger.warn(
        `Invalid dev login attempt - wrong password for: ${email}`,
      );
      await this.handleFailedAttempt(ipKey, emailKey);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Clear failed attempts on successful login
    await this.clearFailedAttemptsOnSuccess(ipKey, emailKey);

    // Find or create the dev user in database
    let user = await this.prisma.user.findFirst({
      where: { email },
    });

    if (!user) {
      // Use the Elle Elephant Creche tenant which has our imported data
      const ELLE_ELEPHANT_TENANT_ID = 'ee937a14-3c81-4e74-ab10-8d2936c5bc2e';
      let devTenant = await this.prisma.tenant.findUnique({
        where: { id: ELLE_ELEPHANT_TENANT_ID },
      });

      // Fallback: look for any existing dev tenant
      if (!devTenant) {
        devTenant = await this.prisma.tenant.findFirst({
          where: { email: 'dev@crechebooks.co.za' },
        });
      }

      if (!devTenant) {
        devTenant = await this.prisma.tenant.create({
          data: {
            id: ELLE_ELEPHANT_TENANT_ID,
            name: 'Elle Elephant Creche',
            email: 'katlego@elleelephant.co.za',
            addressLine1: '3215 H Swala',
            city: 'Mabopane',
            province: 'Gauteng',
            postalCode: '0190',
            phone: '+27739356753',
          },
        });
        this.logger.log(`Created Elle Elephant tenant: ${devTenant.id}`);
      }

      user = await this.prisma.user.create({
        data: {
          tenantId: devTenant.id,
          auth0Id: `dev-${email.replace('@', '-at-').replace('.', '-dot-')}`,
          email,
          name: devUser.name,
          role: devUser.role as any,
          isActive: true,
        },
      });
      this.logger.log(`Created dev user: ${user.id}`);
    }

    // Generate JWT token
    const payload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: this.jwtExpiration,
    });

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    this.logger.log(`Dev login successful for: ${email}`);

    return {
      accessToken,
      refreshToken: '', // No refresh token for dev login
      expiresIn: this.jwtExpiration,
      user: {
        id: user.id,
        tenantId: user.tenantId,
        auth0Id: user.auth0Id,
        email: user.email,
        name: user.name,
        role: user.role,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
        currentTenantId: user.currentTenantId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    };
  }

  /**
   * Get dev users from environment variables
   * Each dev user is configured via DEV_USER_{N}_EMAIL, DEV_USER_{N}_PASSWORD_HASH, etc.
   */
  private getDevUsersFromEnv(): Map<string, DevUserConfig> {
    const devUsers = new Map<string, DevUserConfig>();

    // Support up to 10 dev users (configurable via environment)
    for (let i = 1; i <= 10; i++) {
      const email = this.configService.get<string>(`DEV_USER_${i}_EMAIL`);
      const passwordHash = this.configService.get<string>(
        `DEV_USER_${i}_PASSWORD_HASH`,
      );
      const name = this.configService.get<string>(`DEV_USER_${i}_NAME`);
      const role = this.configService.get<string>(`DEV_USER_${i}_ROLE`);

      if (email && passwordHash && name && role) {
        devUsers.set(email, { passwordHash, name, role });
      }
    }

    if (devUsers.size === 0) {
      this.logger.error(
        'FATAL: No dev users configured but dev auth is enabled. ' +
          'Set DEV_USER_1_EMAIL, DEV_USER_1_PASSWORD_HASH, DEV_USER_1_NAME, DEV_USER_1_ROLE in .env',
      );
      throw new InternalServerErrorException(
        'Dev auth is enabled but no dev users are configured. Check server logs.',
      );
    }

    return devUsers;
  }

  /**
   * Handle a failed login attempt by tracking it and applying exponential backoff.
   *
   * @param ipKey - IP-based rate limit key (optional)
   * @param emailKey - Email-based rate limit key
   */
  private async handleFailedAttempt(
    ipKey: string | null,
    emailKey: string,
  ): Promise<void> {
    try {
      // Track failed attempt for both IP and email
      const results = await Promise.all([
        ipKey ? this.rateLimitService.trackFailedAttempt(ipKey) : null,
        this.rateLimitService.trackFailedAttempt(emailKey),
      ]);

      // Get the highest backoff from both keys
      const ipResult = results[0];
      const emailResult = results[1];

      const maxBackoff = Math.max(
        ipResult?.backoffSeconds || 0,
        emailResult?.backoffSeconds || 0,
      );

      // Apply exponential backoff delay if needed
      if (maxBackoff > 0) {
        this.logger.debug(`Applying exponential backoff: ${maxBackoff}s`);
        await this.delay(maxBackoff * 1000);
      }

      // Log lockout status
      if (ipResult?.isLocked) {
        this.logger.warn(
          `IP locked after ${ipResult.attempts} failed attempts`,
        );
      }
      if (emailResult?.isLocked) {
        this.logger.warn(
          `Email locked after ${emailResult.attempts} failed attempts`,
        );
      }
    } catch (error) {
      // Log but don't fail the request if rate limit tracking fails
      this.logger.error(
        `Failed to track failed attempt: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Clear failed attempts on successful login.
   *
   * @param ipKey - IP-based rate limit key (optional)
   * @param emailKey - Email-based rate limit key
   */
  private async clearFailedAttemptsOnSuccess(
    ipKey: string | null,
    emailKey: string,
  ): Promise<void> {
    try {
      await Promise.all([
        ipKey ? this.rateLimitService.clearFailedAttempts(ipKey) : null,
        this.rateLimitService.clearFailedAttempts(emailKey),
      ]);
      this.logger.debug(`Cleared failed attempts for ${emailKey}`);
    } catch (error) {
      // Log but don't fail the request if clearing fails
      this.logger.error(
        `Failed to clear failed attempts: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Delay execution for exponential backoff.
   *
   * @param ms - Milliseconds to delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
