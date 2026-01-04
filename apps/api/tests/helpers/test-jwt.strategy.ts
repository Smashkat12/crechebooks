/**
 * Test JWT Strategy
 * Validates test tokens signed with JWT_SECRET instead of Auth0 JWKS
 */
import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { IUser } from '../../src/database/entities/user.entity';
import { PrismaService } from '../../src/database/prisma/prisma.service';

export interface TestJwtPayload {
  sub: string;
  email: string;
  'https://crechebooks.co.za/user_id'?: string;
  'https://crechebooks.co.za/tenant_id'?: string;
  'https://crechebooks.co.za/role'?: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class TestJwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  private readonly logger = new Logger(TestJwtStrategy.name);

  constructor(private readonly prisma: PrismaService) {
    const jwtSecret =
      process.env.JWT_SECRET || 'test-jwt-secret-for-e2e-testing';

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: TestJwtPayload): Promise<IUser> {
    this.logger.debug(`Test JWT validating for: ${payload.sub}`);

    if (!payload.sub) {
      throw new UnauthorizedException('Invalid token: missing subject');
    }

    // Find user by Auth0 ID (set in test token)
    const user = await this.prisma.user.findUnique({
      where: { auth0Id: payload.sub },
    });

    if (!user) {
      this.logger.warn(`User not found for auth0Id: ${payload.sub}`);
      throw new UnauthorizedException('User account not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    this.logger.debug(`Test JWT validated for user: ${user.id}`);

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
}
