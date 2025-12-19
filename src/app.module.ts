import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './database/prisma';

@Module({
  imports: [ConfigModule, PrismaModule, HealthModule],
  controllers: [],
  providers: [],
})
export class AppModule {}
