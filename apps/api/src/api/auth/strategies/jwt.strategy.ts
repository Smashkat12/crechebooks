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
import * as jwt from 'jsonwebtoken';
import { IUser, UserRole } from '../../../database/entities/user.entity';
import { PrismaService } from '../../../database/prisma/prisma.service';

/**
 * Type for passport-jwt secretOrKeyProvider callback
 */
type SecretCallback = (err: Error | null, secret?: string | Buffer) => void;

/**
 * TASK-SEC-001: Token expiration warning threshold
 * Warn when token has less than 5 minutes remaining
 */
const TOKEN_EXPIRY_WARNING_THRESHOLD_SECONDS = 300; // 5 minutes

/**
 * TASK-ADMIN-001: Impersonation context embedded in JWT
 */
export interface ImpersonationContext {
  sessionId: string;
  tenantId: string;
  role: string;
  startedAt: number;
  expiresAt: number;
}

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
  /**
   * TASK-ADMIN-001: Impersonation context for SUPER_ADMIN users
   */
  impersonation?: ImpersonationContext;
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
  private readonly jwtSecret: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const domain = configService.get<string>('AUTH0_DOMAIN');
    const jwtSecret = configService.get<string>('JWT_SECRET');
    const nodeEnv = configService.get<string>('NODE_ENV');
    const devAuthEnabled = configService.get<string>('DEV_AUTH_ENABLED');
    const authProvider = configService.get<string>('AUTH_PROVIDER') || 'auth0';

    // Support local JWT auth without Auth0 in these cases:
    // 1. NODE_ENV=development with JWT_SECRET
    // 2. DEV_AUTH_ENABLED=true with JWT_SECRET (no Auth0 domain)
    // 3. AUTH_PROVIDER=jwt with JWT_SECRET (explicit JWT mode)
    const isJwtMode =
      (authProvider === 'jwt' && jwtSecret) ||
      ((nodeEnv === 'development' || devAuthEnabled === 'true') &&
        !domain &&
        jwtSecret);

    if (!domain && !isJwtMode) {
      throw new Error(
        'AUTH0_DOMAIN environment variable is required in production. ' +
          'For local development, set NODE_ENV=development and JWT_SECRET. ' +
          'Alternatively, set AUTH_PROVIDER=jwt with JWT_SECRET for deployments without Auth0.',
      );
    }

    // TASK-UI-001: Use custom extractor for both cookie and header support
    // TASK-ADMIN-001: Support both Auth0 RS256 and local HS256 (impersonation) tokens
    let strategyOptions: Record<string, unknown>;

    if (isJwtMode) {
      // Pure JWT mode - all tokens use HS256 with JWT_SECRET
      strategyOptions = {
        jwtFromRequest: extractJwtFromCookieOrHeader,
        secretOrKey: jwtSecret,
        algorithms: ['HS256'],
      };
    } else {
      // Hybrid mode - Auth0 RS256 for normal tokens, HS256 for impersonation tokens
      // Create the Auth0 JWKS provider
      const auth0SecretProvider = passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${domain}/.well-known/jwks.json`,
      });

      // Custom secret provider that handles both token types
      // passport-jwt calls this with (request, rawJwtToken, done)
      const hybridSecretProvider = (
        req: Request,
        rawJwtToken: string,
        done: SecretCallback,
      ) => {
        try {
          // Decode token without verification to check if it's an impersonation token
          const decoded = jwt.decode(rawJwtToken) as JwtPayload | null;

          if (decoded?.impersonation && jwtSecret) {
            // This is an impersonation token - use JWT_SECRET with HS256
            Logger.debug(
              `Detected impersonation token for session ${decoded.impersonation.sessionId}`,
              'JwtStrategy',
            );
            done(null, jwtSecret);
          } else {
            // Regular Auth0 token - use JWKS
            // The passportJwtSecret returns a function compatible with passport-jwt
            (auth0SecretProvider as (req: Request, token: string, cb: SecretCallback) => void)(
              req,
              rawJwtToken,
              done,
            );
          }
        } catch (err) {
          // If decode fails, try Auth0 JWKS as fallback
          (auth0SecretProvider as (req: Request, token: string, cb: SecretCallback) => void)(
            req,
            rawJwtToken,
            done,
          );
        }
      };

      strategyOptions = {
        jwtFromRequest: extractJwtFromCookieOrHeader,
        // Don't enforce issuer - impersonation tokens have different issuer
        algorithms: ['RS256', 'HS256'], // Support both algorithms
        secretOrKeyProvider: hybridSecretProvider,
      };
    }

    super(strategyOptions as StrategyOptionsWithRequest);

    this.isLocalDev = isJwtMode as boolean;
    this.jwtSecret = jwtSecret;

    if (this.isLocalDev) {
      const modeDescription =
        authProvider === 'jwt' ? 'JWT provider mode' : 'local development mode';
      this.logger.log(`Running in ${modeDescription} with JWT_SECRET`);
    } else {
      this.logger.log(
        'JWT Strategy initialized with hybrid Auth0/impersonation support (TASK-ADMIN-001)',
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
      tenantId: string | null;
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

    // TASK-ADMIN-001: Include impersonation context if present
    const baseUser = {
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

    // If impersonation context exists in JWT, include it
    if (payload.impersonation) {
      this.logger.debug(
        `User ${user.id} has impersonation context: tenant ${payload.impersonation.tenantId} as ${payload.impersonation.role}`,
      );
      return {
        ...baseUser,
        impersonation: {
          sessionId: payload.impersonation.sessionId,
          tenantId: payload.impersonation.tenantId,
          role: payload.impersonation.role as UserRole,
          startedAt: payload.impersonation.startedAt,
          expiresAt: payload.impersonation.expiresAt,
        },
      };
    }

    return baseUser;
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
