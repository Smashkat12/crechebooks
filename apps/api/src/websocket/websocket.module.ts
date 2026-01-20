/**
 * WebSocket Module
 * TASK-FEAT-101: Real-time Dashboard with WebSocket Updates
 *
 * Provides WebSocket infrastructure for real-time dashboard updates.
 */

import { Module } from '@nestjs/common';
import { JwtModule, JwtModuleOptions } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DashboardGateway } from './dashboard.gateway';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import { EventEmitterService } from './services/event-emitter.service';
import { PrismaModule } from '../database/prisma';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService): JwtModuleOptions => {
        const secret = configService.get<string>('JWT_SECRET');
        const expiresIn = configService.get<string>('JWT_EXPIRATION', '1h');
        return {
          secret: secret || 'default-development-secret',
          signOptions: {
            expiresIn: expiresIn as `${number}${'s' | 'm' | 'h' | 'd'}` | number,
          },
        };
      },
    }),
  ],
  providers: [DashboardGateway, WsJwtGuard, EventEmitterService],
  exports: [EventEmitterService],
})
export class WebSocketModule {}
