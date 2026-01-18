/**
 * XeroModule
 * TASK-TRANS-016: Bank Feed Integration Service via Xero API
 * TASK-TRANS-034: Xero Sync REST API Endpoints
 * TASK-XERO-004: Push Categorizations to Xero API Endpoint
 * TASK-INT-002: Secure OAuth State Encryption
 * TASK-STAFF-001: Implement Xero Journal Posting
 * TASK-XERO-008: Implement Distributed Rate Limiting for Xero API
 * TASK-XERO-009: Bidirectional Invoice Sync with Xero
 * TASK-XERO-010: Xero Contact and Payment Sync
 *
 * NestJS module for Xero integration services including:
 * - Bank feed sync
 * - OAuth connection flow (with secure state encryption)
 * - WebSocket sync progress
 * - Push categorizations to Xero
 * - Manual journal posting to Xero
 * - Distributed rate limiting for Xero API
 * - Bidirectional invoice sync with Xero
 * - Contact and payment sync with Xero
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { BankFeedService } from './bank-feed.service';
import { XeroController } from './xero.controller';
import { XeroSyncGateway } from './xero.gateway';
import { XeroAuthService } from './xero-auth.service';
import { XeroJournalService } from './xero-journal.service';
import { XeroRateLimiter } from './xero-rate-limiter.service';
import { XeroInvoiceService } from './xero-invoice.service';
import { XeroContactService } from './xero-contact.service';
import { XeroPaymentService } from './xero-payment.service';
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
    XeroRateLimiter,
    XeroInvoiceService,
    XeroContactService,
    XeroPaymentService,
    TransactionRepository,
    AuditLogService,
  ],
  exports: [
    BankFeedService,
    XeroSyncGateway,
    XeroAuthService,
    XeroJournalService,
    XeroRateLimiter,
    XeroInvoiceService,
    XeroContactService,
    XeroPaymentService,
  ],
})
export class XeroModule {}
