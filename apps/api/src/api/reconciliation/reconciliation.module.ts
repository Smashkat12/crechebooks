/**
 * Reconciliation Module
 * TASK-RECON-031: Reconciliation Controller
 * TASK-RECON-032: Financial Reports Endpoint
 * TASK-RECON-033: Balance Sheet API Endpoint
 * TASK-RECON-034: Audit Log Pagination and Filtering
 * TASK-RECON-UI: Reconciliation List and Discrepancies Endpoints
 * TASK-RECON-019: Bank Statement to Xero Reconciliation
 *
 * Provides the ReconciliationController with required dependencies.
 */
import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from '../../database/services/reconciliation.service';
import { ReconciliationRepository } from '../../database/repositories/reconciliation.repository';
import { FinancialReportService } from '../../database/services/financial-report.service';
import { BalanceSheetService } from '../../database/services/balance-sheet.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { DiscrepancyService } from '../../database/services/discrepancy.service';
import { BankStatementReconciliationService } from '../../database/services/bank-statement-reconciliation.service';
import { BankStatementMatchRepository } from '../../database/repositories/bank-statement-match.repository';
import { LLMWhispererParser } from '../../database/parsers/llmwhisperer-parser';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { PrismaModule } from '../../database/prisma';

@Module({
  imports: [
    PrismaModule,
    MulterModule.register({
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    }),
  ],
  controllers: [ReconciliationController],
  providers: [
    ReconciliationService,
    ReconciliationRepository,
    FinancialReportService,
    BalanceSheetService,
    AuditLogService,
    DiscrepancyService,
    BankStatementReconciliationService,
    BankStatementMatchRepository,
    LLMWhispererParser,
    InvoiceRepository,
  ],
})
export class ReconciliationModule {}
