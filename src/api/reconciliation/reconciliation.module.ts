/**
 * Reconciliation Module
 * TASK-RECON-031: Reconciliation Controller
 * TASK-RECON-032: Financial Reports Endpoint
 *
 * Provides the ReconciliationController with required dependencies.
 */
import { Module } from '@nestjs/common';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationService } from '../../database/services/reconciliation.service';
import { ReconciliationRepository } from '../../database/repositories/reconciliation.repository';
import { FinancialReportService } from '../../database/services/financial-report.service';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { PrismaModule } from '../../database/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [ReconciliationController],
  providers: [
    ReconciliationService,
    ReconciliationRepository,
    FinancialReportService,
    InvoiceRepository,
  ],
})
export class ReconciliationModule {}
