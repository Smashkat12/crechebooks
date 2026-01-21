/**
 * JWT Strategy for Authentication
 * TASK-UI-001: Support HttpOnly cookies for XSS protection
 * TASK-SEC-001: Added explicit expiration validation with logging
 *
 * Token extraction priority:
 * 1. HttpOnly cookie (access_token) - Most secure
 * 2. Authorization header (Bearer token) - For API clients
 */

import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { IUser, UserRole } from '../../../database/entities/user.entity';
import { PrismaService } from '../../../database/prisma/prisma.service';

/**
 * TASK-SEC-001: Token expiration warning threshold
 * Warn when token has less than 5 minutes remaining
 */
const TOKEN_EXPIRY_WARNING_THRESHOLD_SECONDS = 300; // 5 minutes

export interface JwtPayload {
  sub: string; // auth0Id or local userId
  email: string;
  'https://crechebooks.co.za/tenant_id'?: string;
  'https://crechebooks.co.za/role'?: string;
  tenantId?: string;
  role?: string;
  iat?: number;
  exp?: number;
  aud?: string | string[];
  iss?: string;
}

/**
 * TASK-UI-001: Cookie name for HttpOnly access token
 */
export const ACCESS_TOKEN_COOKIE = 'access_token';

/**
 * TASK-UI-001: Custom JWT extractor that checks HttpOnly cookie first,
 * then falls back to Authorization header for backward compatibility
 */
function extractJwtFromCookieOrHeader(req: Request): string | null {
  // First, try to extract from HttpOnly cookie (most secure)
  if (req.cookies && req.cookies[ACCESS_TOKEN_COOKIE]) {
    return req.cookies[ACCESS_TOKEN_COOKIE];
  }

  // Fall back to Authorization header for API clients
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  return null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  private readonly isLocalDev: boolean;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const domain = configService.get<string>('AUTH0_DOMAIN');
    const jwtSecret = configService.get<string>('JWT_SECRET');
    const nodeEnv = configService.get<string>('NODE_ENV');
    const devAuthEnabled = configService.get<string>('DEV_AUTH_ENABLED');

    // Support local development without Auth0
    // Also support DEV_AUTH_ENABLED=true for deployments without Auth0 configured
    const isLocalDev =
      (nodeEnv === 'development' || devAuthEnabled === 'true') &&
      !domain &&
      jwtSecret;

    if (!domain && !isLocalDev) {
      throw new Error(
        'AUTH0_DOMAIN environment variable is required in production. ' +
          'For local development, set NODE_ENV=development and JWT_SECRET. ' +
          'Alternatively, set DEV_AUTH_ENABLED=true with JWT_SECRET for deployments without Auth0.',
      );
    }

    // TASK-UI-001: Use custom extractor for both cookie and header support
    const strategyOptions = isLocalDev
      ? {
          jwtFromRequest: extractJwtFromCookieOrHeader,
          secretOrKey: jwtSecret,
          algorithms: ['HS256'],
        }
      : {
          jwtFromRequest: extractJwtFromCookieOrHeader,
          issuer: `https://${domain}/`,
          algorithms: ['RS256'],
          secretOrKeyProvider: passportJwtSecret({
            cache: true,
            rateLimit: true,
            jwksRequestsPerMinute: 5,
            jwksUri: `https://${domain}/.well-known/jwks.json`,
          }),
        };

    super(strategyOptions as StrategyOptionsWithRequest);

    this.isLocalDev = isLocalDev as boolean;
    if (this.isLocalDev) {
      this.logger.warn(
        'Running in LOCAL DEVELOPMENT mode with JWT_SECRET. Do NOT use in production!',
      );
    }
    this.logger.log(
      'JWT Strategy initialized with HttpOnly cookie support (TASK-UI-001)',
    );
  }

  async validate(payload: JwtPayload): Promise<IUser> {
    this.logger.debug(`Validating JWT for sub: ${payload.sub}`);

    if (!payload.sub) {
      this.logger.warn('JWT validation failed: missing sub claim');
      throw new UnauthorizedException('Invalid token: missing subject');
    }

    // TASK-SEC-001: Explicit expiration validation with logging
    this.validateJwtExpiration(payload);

    // In local dev mode, try to find by ID first, then by auth0Id
    let user: {
      id: string;
      tenantId: string;
      auth0Id: string | null;
      email: string;
      name: string | null;
      role: string;
      isActive: boolean;
      lastLoginAt: Date | null;
      currentTenantId: string | null;
      createdAt: Date;
      updatedAt: Date;
    } | null = null;

    if (this.isLocalDev) {
      // Try UUID lookup first (for dev tokens that use userId as sub)
      user = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: payload.sub },
            { auth0Id: payload.sub },
            { email: payload.email },
          ],
        },
      });
    } else {
      // Production mode: Find user by Auth0 ID
      user = await this.prisma.user.findUnique({
        where: { auth0Id: payload.sub },
      });
    }

    if (!user) {
      this.logger.warn(`User not found for sub: ${payload.sub}`);
      throw new UnauthorizedException('User account not found');
    }

    if (!user.isActive) {
      this.logger.warn(`Inactive user attempted login: ${user.id}`);
      throw new UnauthorizedException('User account is deactivated');
    }

    // Update last login timestamp (fire and forget)
    const userId = user.id;
    this.prisma.user
      .update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
      })
      .catch((err: unknown) => {
        this.logger.error(
          `Failed to update lastLoginAt for user ${userId}`,
          err,
        );
      });

    this.logger.debug(`JWT validated successfully for user: ${user.id}`);

    return {
      id: user.id,
      tenantId: user.tenantId,
      auth0Id: user.auth0Id ?? '',
      email: user.email,
      name: user.name ?? '',
      role: user.role as UserRole,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      currentTenantId: user.currentTenantId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  /**
   * TASK-SEC-001: Validate JWT expiration with explicit logging
   *
   * - Throws UnauthorizedException if token is expired
   * - Logs warning if token is near expiration (within 5 minutes)
   * - Logs token lifetime info for debugging
   *
   * @param payload - The JWT payload containing iat and exp claims
   * @throws UnauthorizedException if token is expired
   */
  private validateJwtExpiration(payload: JwtPayload): void {
    const now = Math.floor(Date.now() / 1000); // Current time in seconds

    // Check if exp claim exists
    if (!payload.exp) {
      this.logger.warn(`JWT missing exp claim for sub: ${payload.sub}`);
      // Allow tokens without exp in development for backward compatibility
      if (!this.isLocalDev) {
        throw new UnauthorizedException('Invalid token: missing expiration');
      }
      return;
    }

    // Check if token is expired
    if (payload.exp <= now) {
      const expiredAgo = now - payload.exp;
      this.logger.warn(
        `JWT expired ${expiredAgo}s ago for sub: ${payload.sub}, ` +
          `exp: ${new Date(payload.exp * 1000).toISOString()}`,
      );
      throw new UnauthorizedException('Token has expired');
    }

    // Calculate time remaining until expiration
    const timeRemaining = payload.exp - now;

    // Log warning for nearly-expired tokens
    if (timeRemaining <= TOKEN_EXPIRY_WARNING_THRESHOLD_SECONDS) {
      this.logger.warn(
        `JWT nearly expired for sub: ${payload.sub}, ` +
          `expires in ${timeRemaining}s (${Math.round(timeRemaining / 60)} minutes)`,
      );
    }

    // Log token lifetime info at debug level
    if (payload.iat) {
      const tokenAge = now - payload.iat;
      const totalLifetime = payload.exp - payload.iat;
      this.logger.debug(
        `JWT for sub: ${payload.sub} - age: ${tokenAge}s, ` +
          `remaining: ${timeRemaining}s, total lifetime: ${totalLifetime}s`,
      );
    } else {
      this.logger.debug(
        `JWT for sub: ${payload.sub} - expires in ${timeRemaining}s ` +
          `(${Math.round(timeRemaining / 60)} minutes)`,
      );
    }
  }
}
