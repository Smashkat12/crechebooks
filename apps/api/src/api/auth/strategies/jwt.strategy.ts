import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';
import { IUser, UserRole } from '../../../database/entities/user.entity';
import { PrismaService } from '../../../database/prisma/prisma.service';

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

    // Support local development without Auth0
    const isLocalDev = nodeEnv === 'development' && !domain && jwtSecret;

    if (!domain && !isLocalDev) {
      throw new Error(
        'AUTH0_DOMAIN environment variable is required in production. ' +
          'For local development, set NODE_ENV=development and JWT_SECRET.',
      );
    }

    const strategyOptions = isLocalDev
      ? {
          jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
          secretOrKey: jwtSecret,
          algorithms: ['HS256'],
        }
      : {
          jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
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
  }

  async validate(payload: JwtPayload): Promise<IUser> {
    this.logger.debug(`Validating JWT for sub: ${payload.sub}`);

    if (!payload.sub) {
      this.logger.warn('JWT validation failed: missing sub claim');
      throw new UnauthorizedException('Invalid token: missing subject');
    }

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
}
