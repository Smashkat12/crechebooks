/**
 * Banking Module
 * TASK-INT-101: Bank API Integration (Open Banking)
 *
 * NestJS module for bank account linking and transaction sync.
 * Integrates Stitch API for South African Open Banking.
 *
 * Features:
 * - StitchBankingService for API integration
 * - BankSyncJob for periodic transaction sync
 * - BankLinkController for REST API
 * - POPIA-compliant audit logging
 */

import { Module, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from '../../database/database.module';
import { StitchBankingService } from './stitch.service';
import { BankLinkController } from '../../api/banking/bank-link.controller';
import { BankSyncJob } from '../../jobs/bank-sync.job';
import { EncryptionService } from '../../shared/services/encryption.service';

const logger = new Logger('BankingModule');

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    ScheduleModule.forRoot(), // For @Cron decorator
  ],
  controllers: [BankLinkController],
  providers: [StitchBankingService, BankSyncJob, EncryptionService],
  exports: [StitchBankingService, BankSyncJob],
})
export class BankingModule {
  constructor() {
    logger.log('BankingModule initialized - Stitch Open Banking integration');
  }
}
