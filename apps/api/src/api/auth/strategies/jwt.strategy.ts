import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy, StrategyOptionsWithRequest } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { ConfigService } from '@nestjs/config';
import { IUser } from '../../../database/entities/user.entity';
import { PrismaService } from '../../../database/prisma/prisma.service';

export interface JwtPayload {
  sub: string; // auth0Id
  email: string;
  'https://crechebooks.co.za/tenant_id'?: string;
  'https://crechebooks.co.za/role'?: string;
  iat?: number;
  exp?: number;
  aud?: string | string[];
  iss?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const domain = configService.get<string>('AUTH0_DOMAIN');
    if (!domain) {
      throw new Error('AUTH0_DOMAIN environment variable is required');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      issuer: `https://${domain}/`,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `https://${domain}/.well-known/jwks.json`,
      }),
    } as StrategyOptionsWithRequest);
  }

  async validate(payload: JwtPayload): Promise<IUser> {
    this.logger.debug(`Validating JWT for auth0Id: ${payload.sub}`);

    if (!payload.sub) {
      this.logger.warn('JWT validation failed: missing sub claim');
      throw new UnauthorizedException('Invalid token: missing subject');
    }

    // Find user by Auth0 ID
    const user = await this.prisma.user.findUnique({
      where: { auth0Id: payload.sub },
    });

    if (!user) {
      this.logger.warn(`User not found for auth0Id: ${payload.sub}`);
      throw new UnauthorizedException('User account not found');
    }

    if (!user.isActive) {
      this.logger.warn(`Inactive user attempted login: ${user.id}`);
      throw new UnauthorizedException('User account is deactivated');
    }

    // Update last login timestamp (fire and forget)
    this.prisma.user
      .update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      })
      .catch((err) => {
        this.logger.error(
          `Failed to update lastLoginAt for user ${user.id}`,
          err,
        );
      });

    this.logger.debug(`JWT validated successfully for user: ${user.id}`);

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
}
