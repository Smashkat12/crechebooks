import { Module, Logger, OnModuleInit } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { ParentAuthController } from './parent-auth.controller';
import { StaffAuthController } from './staff-auth.controller';
import { AuthService } from './auth.service';
import { MagicLinkService } from './services/magic-link.service';
import { StaffMagicLinkService } from './services/staff-magic-link.service';
import { Auth0ManagementService } from './services/auth0-management.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { ParentAuthGuard } from './guards/parent-auth.guard';
import { StaffAuthGuard } from './guards/staff-auth.guard';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { RateLimitModule } from '../../common/rate-limit/rate-limit.module';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { CsrfStoreService } from './csrf-store.service';
import { FailedAttemptsService } from './failed-attempts.service';
import { MailgunModule } from '../../integrations/mailgun/mailgun.module';

/**
 * TASK-SEC-001: JWT Token Expiration Security Defaults
 * - Access tokens: 8 hours (28800s) in development, 1 hour in production
 * - Refresh tokens: 7 days (604800s) - longer-lived for convenience
 * - Minimum JWT secret length: 32 characters in production
 *
 * AUTH_PROVIDER: Controls authentication method
 * - "auth0" (default in production): Uses Auth0 OAuth2/OIDC
 * - "jwt": Uses local JWT authentication with JWT_SECRET
 */
export const JWT_EXPIRATION_DEFAULT = 28800; // 8 hours in seconds (for development)
export const JWT_REFRESH_EXPIRATION_DEFAULT = 604800; // 7 days in seconds
export const JWT_SECRET_MIN_LENGTH = 32;
export type AuthProvider = 'auth0' | 'jwt';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const nodeEnv = configService.get<string>('NODE_ENV');
        const jwtSecret = configService.get<string>('JWT_SECRET');
        const auth0Secret = configService.get<string>('AUTH0_CLIENT_SECRET');
        const authProvider =
          configService.get<string>('AUTH_PROVIDER') || 'auth0';

        // Determine secret based on auth provider:
        // - AUTH_PROVIDER=jwt: Always use JWT_SECRET
        // - AUTH_PROVIDER=auth0 (default): Use AUTH0_CLIENT_SECRET in production, JWT_SECRET in dev
        let secret: string | undefined;
        if (authProvider === 'jwt') {
          secret = jwtSecret;
        } else {
          secret =
            nodeEnv === 'development' && jwtSecret ? jwtSecret : auth0Secret;
        }

        // TASK-SEC-001: Parse JWT_EXPIRATION as number, use default for development
        const jwtExpirationStr = configService.get<string>('JWT_EXPIRATION');
        const jwtExpiration = jwtExpirationStr
          ? parseInt(jwtExpirationStr, 10)
          : JWT_EXPIRATION_DEFAULT;

        return {
          secret,
          signOptions: {
            expiresIn: isNaN(jwtExpiration)
              ? JWT_EXPIRATION_DEFAULT
              : jwtExpiration,
          },
        };
      },
    }),
    PrismaModule,
    RedisModule,
    RateLimitModule,
    MailgunModule,
  ],
  controllers: [AuthController, ParentAuthController, StaffAuthController],
  providers: [
    AuthService,
    MagicLinkService,
    StaffMagicLinkService,
    Auth0ManagementService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    ParentAuthGuard,
    StaffAuthGuard,
    RateLimitGuard,
    CsrfStoreService,
    FailedAttemptsService,
  ],
  exports: [
    AuthService,
    MagicLinkService,
    StaffMagicLinkService,
    Auth0ManagementService,
    JwtAuthGuard,
    RolesGuard,
    ParentAuthGuard,
    StaffAuthGuard,
    RateLimitGuard,
    CsrfStoreService,
    FailedAttemptsService,
  ],
})
export class AuthModule implements OnModuleInit {
  private readonly logger = new Logger(AuthModule.name);

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    this.validateAuthConfiguration();
  }

  /**
   * Validate authentication configuration on startup
   * Fails fast in production if required env vars are missing
   *
   * Supports two auth providers:
   * - AUTH_PROVIDER=auth0 (default): Requires Auth0 configuration
   * - AUTH_PROVIDER=jwt: Uses local JWT authentication with JWT_SECRET
   */
  private validateAuthConfiguration(): void {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const isProduction = nodeEnv === 'production';
    const isDevelopment = nodeEnv === 'development';
    const authProvider =
      this.configService.get<string>('AUTH_PROVIDER') || 'auth0';

    // Production validation
    if (isProduction) {
      // Validate AUTH_PROVIDER value
      if (authProvider !== 'auth0' && authProvider !== 'jwt') {
        const errorMsg = `FATAL: Invalid AUTH_PROVIDER="${authProvider}". Must be "auth0" or "jwt".`;
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      if (authProvider === 'auth0') {
        // Auth0 provider requires full Auth0 configuration
        const requiredVars = [
          'AUTH0_DOMAIN',
          'AUTH0_CLIENT_ID',
          'AUTH0_CLIENT_SECRET',
          'AUTH0_AUDIENCE',
        ];

        const missingVars = requiredVars.filter(
          (varName) => !this.configService.get<string>(varName),
        );

        if (missingVars.length > 0) {
          const errorMsg =
            `FATAL: Missing required auth environment variables in production with AUTH_PROVIDER=auth0: ${missingVars.join(', ')}. ` +
            'Either provide Auth0 credentials or set AUTH_PROVIDER=jwt with JWT_SECRET.';
          this.logger.error(errorMsg);
          throw new Error(errorMsg);
        }

        // TASK-SEC-001: Validate JWT secret length in production (fail fast)
        const auth0Secret = this.configService.get<string>(
          'AUTH0_CLIENT_SECRET',
        );
        if (auth0Secret && auth0Secret.length < JWT_SECRET_MIN_LENGTH) {
          const errorMsg =
            `FATAL: AUTH0_CLIENT_SECRET is too short (${auth0Secret.length} chars). ` +
            `Minimum required: ${JWT_SECRET_MIN_LENGTH} characters for security.`;
          this.logger.error(errorMsg);
          throw new Error(errorMsg);
        }

        this.logger.log(
          'Production auth configuration validated (provider: Auth0)',
        );
      } else if (authProvider === 'jwt') {
        // JWT provider requires JWT_SECRET and optionally DEV_AUTH_ENABLED for login endpoint
        const jwtSecret = this.configService.get<string>('JWT_SECRET');

        if (!jwtSecret) {
          const errorMsg =
            'FATAL: JWT_SECRET is required when AUTH_PROVIDER=jwt in production.';
          this.logger.error(errorMsg);
          throw new Error(errorMsg);
        }

        if (jwtSecret.length < JWT_SECRET_MIN_LENGTH) {
          const errorMsg =
            `FATAL: JWT_SECRET is too short (${jwtSecret.length} chars). ` +
            `Minimum required: ${JWT_SECRET_MIN_LENGTH} characters for security.`;
          this.logger.error(errorMsg);
          throw new Error(errorMsg);
        }

        // Block DEV_AUTH_ENABLED in production - dev login bypass must never be active in prod
        const devAuthEnabled =
          this.configService.get<string>('DEV_AUTH_ENABLED');
        if (devAuthEnabled === 'true') {
          const errorMsg =
            'FATAL: DEV_AUTH_ENABLED=true is not allowed in production. ' +
            'The dev-login endpoint bypasses production authentication. ' +
            'Set DEV_AUTH_ENABLED=false or remove it from your production environment.';
          this.logger.error(errorMsg);
          throw new Error(errorMsg);
        }

        this.logger.log(
          `Production auth configuration validated (provider: JWT, login enabled: ${devAuthEnabled === 'true'})`,
        );
      }

      // TASK-SEC-001: Log JWT expiration settings for audit
      const jwtExpiration = this.configService.get<number>(
        'JWT_EXPIRATION',
        JWT_EXPIRATION_DEFAULT,
      );
      this.logger.log(
        `Production JWT expiration: ${jwtExpiration}s (${Math.round(jwtExpiration / 60)} minutes)`,
      );
    }

    // Development validation
    if (isDevelopment) {
      const jwtSecret = this.configService.get<string>('JWT_SECRET');
      const devAuthEnabled = this.configService.get<string>('DEV_AUTH_ENABLED');

      if (devAuthEnabled === 'true') {
        if (!jwtSecret || jwtSecret.length < 32) {
          this.logger.warn(
            'JWT_SECRET should be at least 32 characters for security',
          );
        }

        // Check if dev users are configured
        const devUserEmail = this.configService.get<string>('DEV_USER_1_EMAIL');
        const devUserHash = this.configService.get<string>(
          'DEV_USER_1_PASSWORD_HASH',
        );

        if (!devUserEmail || !devUserHash) {
          const errorMsg =
            'FATAL: DEV_AUTH_ENABLED=true but no dev users configured. ' +
            'Set DEV_USER_1_EMAIL, DEV_USER_1_PASSWORD_HASH, DEV_USER_1_NAME, DEV_USER_1_ROLE in .env';
          this.logger.error(errorMsg);
          throw new Error(errorMsg);
        }

        // Validate password hash format (must be bcrypt hash starting with $2)
        if (!devUserHash.startsWith('$2')) {
          const errorMsg =
            'FATAL: DEV_USER_1_PASSWORD_HASH must be a bcrypt hash (starting with $2). ' +
            'Generate one using: npx bcrypt-cli hash "your_password" 10';
          this.logger.error(errorMsg);
          throw new Error(errorMsg);
        }

        const devUserName = this.configService.get<string>('DEV_USER_1_NAME');
        const devUserRole = this.configService.get<string>('DEV_USER_1_ROLE');

        if (!devUserName || !devUserRole) {
          const errorMsg =
            'FATAL: DEV_USER_1_NAME and DEV_USER_1_ROLE are required when DEV_AUTH_ENABLED=true';
          this.logger.error(errorMsg);
          throw new Error(errorMsg);
        }

        this.logger.log(
          'Development auth configuration validated - dev login enabled',
        );
      } else {
        this.logger.log('Development mode - dev auth disabled, using Auth0');
      }
    }
  }
}
