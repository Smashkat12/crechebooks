import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ImpersonationController } from './impersonation.controller';
import { ImpersonationService } from './impersonation.service';
import { PrismaModule } from '../../database/prisma';
import { DatabaseModule } from '../../database/database.module';
import { StorageModule } from '../../integrations/storage/storage.module';
import { PopOrphanSweepJob } from '../../jobs/pop-orphan-sweep.job';

@Module({
  imports: [
    PrismaModule,
    DatabaseModule, // provides AuditLogService for PopOrphanSweepJob
    StorageModule, // provides StorageService for PopOrphanSweepJob
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<number>('JWT_EXPIRATION') || 28800,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AdminController, ImpersonationController],
  providers: [AdminService, ImpersonationService, PopOrphanSweepJob],
  exports: [AdminService, ImpersonationService],
})
export class AdminModule {}
