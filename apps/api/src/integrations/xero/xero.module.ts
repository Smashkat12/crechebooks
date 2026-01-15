/**
 * XeroModule
 * TASK-TRANS-016: Bank Feed Integration Service via Xero API
 * TASK-TRANS-034: Xero Sync REST API Endpoints
 * TASK-XERO-004: Push Categorizations to Xero API Endpoint
 * TASK-INT-002: Secure OAuth State Encryption
 * TASK-STAFF-001: Implement Xero Journal Posting
 *
 * NestJS module for Xero integration services including:
 * - Bank feed sync
 * - OAuth connection flow (with secure state encryption)
 * - WebSocket sync progress
 * - Push categorizations to Xero
 * - Manual journal posting to Xero
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { BankFeedService } from './bank-feed.service';
import { XeroController } from './xero.controller';
import { XeroSyncGateway } from './xero.gateway';
import { XeroAuthService } from './xero-auth.service';
import { XeroJournalService } from './xero-journal.service';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { DatabaseModule } from '../../database/database.module';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { AuditLogService } from '../../database/services/audit-log.service';

@Module({
  imports: [
    PrismaModule,
    DatabaseModule,
    ConfigModule,
    HttpModule.register({
      timeout: 30000,
      maxRedirects: 5,
    }),
  ],
  controllers: [XeroController],
  providers: [
    BankFeedService,
    XeroSyncGateway,
    XeroAuthService,
    XeroJournalService,
    TransactionRepository,
    AuditLogService,
  ],
  exports: [
    BankFeedService,
    XeroSyncGateway,
    XeroAuthService,
    XeroJournalService,
  ],
})
export class XeroModule {}
