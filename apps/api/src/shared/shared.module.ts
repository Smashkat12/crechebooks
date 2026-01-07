/**
 * Shared Module
 * Provides shared services across the application
 */

import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BusinessDayService } from './services/business-day.service';
import { EncryptionService } from './services/encryption.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [BusinessDayService, EncryptionService],
  exports: [BusinessDayService, EncryptionService],
})
export class SharedModule {}
