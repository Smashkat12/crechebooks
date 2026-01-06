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
import { InvoiceVatService } from './services/invoice-vat.service';
import { ProRataService } from './services/pro-rata.service';
import { CreditNoteService } from './services/credit-note.service';
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
import { PayeeNormalizerService } from './services/payee-normalizer.service';
import { PayeeVariationDetectorService } from './services/payee-variation-detector.service';
import { AccuracyMetricsService } from './services/accuracy-metrics.service';
import { DuplicateDetectionService } from './services/duplicate-detection.service';
import { RecurringDetectionService } from './services/recurring-detection.service';
import { AmountVariationService } from './services/amount-variation.service';
import { ConflictDetectionService } from './services/conflict-detection.service';
import { ConflictResolutionService } from './services/conflict-resolution.service';
import { ReversalDetectionService } from './services/reversal-detection.service';
import { CorrectionConflictService } from './services/correction-conflict.service';
import { CreditBalanceService } from './services/credit-balance.service';
import { PaymentReceiptService } from './services/payment-receipt.service';
import { EmailModule } from '../integrations/email/email.module';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { SarsModule } from '../integrations/sars/sars.module';
import { TransactionCategorizerModule } from '../agents/transaction-categorizer/categorizer.module';
import { PaymentMatcherModule } from '../agents/payment-matcher/matcher.module';
import { SarsAgentModule } from '../agents/sars-agent/sars.module';

@Module({
  imports: [
    EmailModule,
    forwardRef(() => WhatsAppModule),
    SarsModule,
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
    InvoiceVatService,
    ProRataService,
    CreditNoteService,
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
    AmountVariationService,
    ConflictDetectionService,
    ConflictResolutionService,
    PayeeNormalizerService,
    PayeeVariationDetectorService,
    ReversalDetectionService,
    CorrectionConflictService,
    CreditBalanceService,
    PaymentReceiptService,
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
    InvoiceVatService,
    ProRataService,
    CreditNoteService,
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
    PayeeNormalizerService,
    PayeeVariationDetectorService,
    AccuracyMetricsService,
    DuplicateDetectionService,
    RecurringDetectionService,
    AmountVariationService,
    ConflictDetectionService,
    ConflictResolutionService,
    ReversalDetectionService,
    CorrectionConflictService,
    CreditBalanceService,
    PaymentReceiptService,
  ],
})
export class DatabaseModule {}
