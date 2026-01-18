import { Module, Logger, OnModuleInit } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { RedisModule } from '../../common/redis/redis.module';
import { RateLimitModule } from '../../common/rate-limit/rate-limit.module';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { CsrfStoreService } from './csrf-store.service';
import { FailedAttemptsService } from './failed-attempts.service';

/**
 * TASK-SEC-001: JWT Token Expiration Security Defaults
 * - Access tokens: 8 hours (28800s) in development, 1 hour in production
 * - Refresh tokens: 7 days (604800s) - longer-lived for convenience
 * - Minimum JWT secret length: 32 characters in production
 */
export const JWT_EXPIRATION_DEFAULT = 28800; // 8 hours in seconds (for development)
export const JWT_REFRESH_EXPIRATION_DEFAULT = 604800; // 7 days in seconds
export const JWT_SECRET_MIN_LENGTH = 32;

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        // For local dev, use JWT_SECRET. For production, use AUTH0_CLIENT_SECRET
        const nodeEnv = configService.get<string>('NODE_ENV');
        const jwtSecret = configService.get<string>('JWT_SECRET');
        const auth0Secret = configService.get<string>('AUTH0_CLIENT_SECRET');

        const secret =
          nodeEnv === 'development' && jwtSecret ? jwtSecret : auth0Secret;

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
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
    RateLimitGuard,
    CsrfStoreService,
    FailedAttemptsService,
  ],
  exports: [
    AuthService,
    JwtAuthGuard,
    RolesGuard,
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
   */
  private validateAuthConfiguration(): void {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const isProduction = nodeEnv === 'production';
    const isDevelopment = nodeEnv === 'development';

    // Production validation - require Auth0 configuration
    if (isProduction) {
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
        const errorMsg = `FATAL: Missing required auth environment variables in production: ${missingVars.join(', ')}`;
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // TASK-SEC-001: Validate JWT secret length in production (fail fast)
      const auth0Secret = this.configService.get<string>('AUTH0_CLIENT_SECRET');
      if (auth0Secret && auth0Secret.length < JWT_SECRET_MIN_LENGTH) {
        const errorMsg =
          `FATAL: AUTH0_CLIENT_SECRET is too short (${auth0Secret.length} chars). ` +
          `Minimum required: ${JWT_SECRET_MIN_LENGTH} characters for security.`;
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Warn if dev auth is somehow enabled in production
      const devAuthEnabled = this.configService.get<string>('DEV_AUTH_ENABLED');
      if (devAuthEnabled === 'true') {
        this.logger.error(
          'SECURITY WARNING: DEV_AUTH_ENABLED=true in production environment!',
        );
        throw new Error('DEV_AUTH_ENABLED must not be true in production');
      }

      // TASK-SEC-001: Log JWT expiration settings for audit
      const jwtExpiration = this.configService.get<number>(
        'JWT_EXPIRATION',
        JWT_EXPIRATION_DEFAULT,
      );
      this.logger.log(
        `Production JWT expiration: ${jwtExpiration}s (${Math.round(jwtExpiration / 60)} minutes)`,
      );

      this.logger.log('Production auth configuration validated successfully');
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
