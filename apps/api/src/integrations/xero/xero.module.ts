/**
 * XeroModule
 * TASK-TRANS-016: Bank Feed Integration Service via Xero API
 * TASK-TRANS-034: Xero Sync REST API Endpoints
 *
 * NestJS module for Xero integration services including:
 * - Bank feed sync
 * - OAuth connection flow
 * - WebSocket sync progress
 */
import { Module } from '@nestjs/common';
import { BankFeedService } from './bank-feed.service';
import { XeroController } from './xero.controller';
import { XeroSyncGateway } from './xero.gateway';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { AuditLogService } from '../../database/services/audit-log.service';

@Module({
  imports: [PrismaModule],
  controllers: [XeroController],
  providers: [
    BankFeedService,
    XeroSyncGateway,
    TransactionRepository,
    AuditLogService,
  ],
  exports: [BankFeedService, XeroSyncGateway],
})
export class XeroModule {}
