import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PrismaModule } from '../../database/prisma/prisma.module';

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

        return {
          secret,
          signOptions: {
            expiresIn: configService.get<number>('JWT_EXPIRATION', 86400),
          },
        };
      },
    }),
    PrismaModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
