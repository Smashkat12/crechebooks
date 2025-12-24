import { Module, forwardRef } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { TenantRepository } from './repositories/tenant.repository';
import { UserRepository } from './repositories/user.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { CategorizationRepository } from './repositories/categorization.repository';
import { PayeePatternRepository } from './repositories/payee-pattern.repository';
import { EnrollmentRepository } from './repositories/enrollment.repository';
import { ChildRepository } from './repositories/child.repository';
import { FeeStructureRepository } from './repositories/fee-structure.repository';
import { ParentRepository } from './repositories/parent.repository';
import { InvoiceRepository } from './repositories/invoice.repository';
import { InvoiceLineRepository } from './repositories/invoice-line.repository';
import { PaymentRepository } from './repositories/payment.repository';
import { AuditLogService } from './services/audit-log.service';
import { TransactionImportService } from './services/transaction-import.service';
import { CategorizationService } from './services/categorization.service';
import { PatternLearningService } from './services/pattern-learning.service';
import { XeroSyncService } from './services/xero-sync.service';
import { EnrollmentService } from './services/enrollment.service';
import { InvoiceGenerationService } from './services/invoice-generation.service';
import { InvoiceDeliveryService } from './services/invoice-delivery.service';
import { ProRataService } from './services/pro-rata.service';
import { PaymentMatchingService } from './services/payment-matching.service';
import { PaymentAllocationService } from './services/payment-allocation.service';
import { ArrearsService } from './services/arrears.service';
import { ReminderRepository } from './repositories/reminder.repository';
import { ReminderService } from './services/reminder.service';
import { VatService } from './services/vat.service';
import { PayeService } from './services/paye.service';
import { UifService } from './services/uif.service';
import { Vat201Service } from './services/vat201.service';
import { Emp201Service } from './services/emp201.service';
import { Irp5Service } from './services/irp5.service';
import { ReconciliationRepository } from './repositories/reconciliation.repository';
import { ReconciliationService } from './services/reconciliation.service';
import { DiscrepancyService } from './services/discrepancy.service';
import { FinancialReportService } from './services/financial-report.service';
import { PayeeAliasService } from './services/payee-alias.service';
import { AccuracyMetricsService } from './services/accuracy-metrics.service';
import { DuplicateDetectionService } from './services/duplicate-detection.service';
import { RecurringDetectionService } from './services/recurring-detection.service';
import { EmailModule } from '../integrations/email/email.module';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { TransactionCategorizerModule } from '../agents/transaction-categorizer/categorizer.module';
import { PaymentMatcherModule } from '../agents/payment-matcher/matcher.module';
import { SarsAgentModule } from '../agents/sars-agent/sars.module';

@Module({
  imports: [
    EmailModule,
    forwardRef(() => WhatsAppModule),
    TransactionCategorizerModule,
    PaymentMatcherModule,
    forwardRef(() => SarsAgentModule),
  ],
  providers: [
    PrismaService,
    TenantRepository,
    UserRepository,
    TransactionRepository,
    CategorizationRepository,
    PayeePatternRepository,
    EnrollmentRepository,
    ChildRepository,
    FeeStructureRepository,
    ParentRepository,
    InvoiceRepository,
    InvoiceLineRepository,
    PaymentRepository,
    AuditLogService,
    TransactionImportService,
    CategorizationService,
    PatternLearningService,
    XeroSyncService,
    EnrollmentService,
    InvoiceGenerationService,
    InvoiceDeliveryService,
    ProRataService,
    PaymentMatchingService,
    PaymentAllocationService,
    ArrearsService,
    ReminderRepository,
    ReminderService,
    VatService,
    PayeService,
    UifService,
    Vat201Service,
    Emp201Service,
    Irp5Service,
    ReconciliationRepository,
    ReconciliationService,
    DiscrepancyService,
    FinancialReportService,
    PayeeAliasService,
    AccuracyMetricsService,
    DuplicateDetectionService,
    RecurringDetectionService,
  ],
  exports: [
    PrismaService,
    TenantRepository,
    UserRepository,
    TransactionRepository,
    CategorizationRepository,
    PayeePatternRepository,
    EnrollmentRepository,
    ChildRepository,
    FeeStructureRepository,
    ParentRepository,
    InvoiceRepository,
    InvoiceLineRepository,
    PaymentRepository,
    AuditLogService,
    TransactionImportService,
    CategorizationService,
    PatternLearningService,
    XeroSyncService,
    EnrollmentService,
    InvoiceGenerationService,
    InvoiceDeliveryService,
    ProRataService,
    PaymentMatchingService,
    PaymentAllocationService,
    ArrearsService,
    ReminderRepository,
    ReminderService,
    VatService,
    PayeService,
    UifService,
    Vat201Service,
    Emp201Service,
    Irp5Service,
    ReconciliationRepository,
    ReconciliationService,
    DiscrepancyService,
    FinancialReportService,
    PayeeAliasService,
    AccuracyMetricsService,
    DuplicateDetectionService,
    RecurringDetectionService,
  ],
})
export class DatabaseModule {}
