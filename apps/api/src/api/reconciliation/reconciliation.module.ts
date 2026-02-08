/**
 * Reconciliation Module
 * TASK-RECON-031: Reconciliation Controller
 * TASK-RECON-032: Financial Reports Endpoint
 * TASK-RECON-033: Balance Sheet API Endpoint
 * TASK-RECON-034: Audit Log Pagination and Filtering
 * TASK-RECON-036: Comparative Balance Sheet
 * TASK-RECON-037: Xero Transaction Splitting
 * TASK-RECON-UI: Reconciliation List and Discrepancies Endpoints
 * TASK-RECON-019: Bank Statement to Xero Reconciliation
 * TASK-RECON-035: Split Transaction Matching
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
import { ComparativeBalanceSheetService } from '../../database/services/comparative-balance-sheet.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { DiscrepancyService } from '../../database/services/discrepancy.service';
import { BankStatementReconciliationService } from '../../database/services/bank-statement-reconciliation.service';
import { BankStatementMatchRepository } from '../../database/repositories/bank-statement-match.repository';
import { LLMWhispererParser } from '../../database/parsers/llmwhisperer-parser';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { ToleranceConfigService } from '../../database/services/tolerance-config.service';
import { SplitTransactionMatcherService } from '../../database/services/split-transaction-matcher.service';
import { AccruedBankChargeService } from '../../database/services/accrued-bank-charge.service';
import { BankFeeService } from '../../database/services/bank-fee.service';
import { XeroTransactionSplitService } from '../../database/services/xero-transaction-split.service';
import { FeeInflationCorrectionService } from '../../database/services/fee-inflation-correction.service';
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
    ComparativeBalanceSheetService,
    AuditLogService,
    DiscrepancyService,
    BankStatementReconciliationService,
    BankStatementMatchRepository,
    LLMWhispererParser,
    InvoiceRepository,
    ToleranceConfigService,
    SplitTransactionMatcherService,
    AccruedBankChargeService,
    BankFeeService,
    XeroTransactionSplitService,
    FeeInflationCorrectionService,
  ],
  exports: [AccruedBankChargeService, XeroTransactionSplitService, FeeInflationCorrectionService],
})
export class ReconciliationModule {}
