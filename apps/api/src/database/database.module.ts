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
import { InvoiceNumberService } from './services/invoice-number.service';
import { EmployeeNumberService } from './services/employee-number.service';
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
import { VatAdjustmentService } from './services/vat-adjustment.service';
import { PayeService } from './services/paye.service';
import { UifService } from './services/uif.service';
import { Vat201Service } from './services/vat201.service';
import { Emp201Service } from './services/emp201.service';
import { Irp5Service } from './services/irp5.service';
import { ReconciliationRepository } from './repositories/reconciliation.repository';
import { ReconciliationService } from './services/reconciliation.service';
import { DiscrepancyService } from './services/discrepancy.service';
import { ToleranceConfigService } from './services/tolerance-config.service';
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
import { ParentAccountService } from './services/parent-account.service';
import { StatementRepository } from './repositories/statement.repository';
import { StatementGenerationService } from './services/statement-generation.service';
import { StatementPdfService } from './services/statement-pdf.service';
import { StatementDeliveryService } from './services/statement-delivery.service';
import { OffboardingService } from './services/offboarding.service';
import { XeroPayrollJournalRepository } from './repositories/xero-payroll-journal.repository';
import { XeroPayrollJournalService } from './services/xero-payroll-journal.service';
import { XeroAccountMappingService } from './services/xero-account-mapping.service';
import { StaffOffboardingRepository } from './repositories/staff-offboarding.repository';
import { StaffOnboardingRepository } from './repositories/staff-onboarding.repository';
import { SimplePayRepository } from './repositories/simplepay.repository';
import { StaffRepository } from './repositories/staff.repository';
import { LeaveRequestRepository } from './repositories/leave-request.repository';
import { CalculationCacheRepository } from './repositories/calculation-cache.repository';
import { PayrollAdjustmentRepository } from './repositories/payroll-adjustment.repository';
import { ServicePeriodSyncRepository } from './repositories/service-period-sync.repository';
import { ReportRequestRepository } from './repositories/report-request.repository';
import { BulkOperationLogRepository } from './repositories/bulk-operation-log.repository';
import { EmployeeSetupLogRepository } from './repositories/employee-setup-log.repository';
import { XeroAccountRepository } from './repositories/xero-account.repository';
import { CategorizationJournalRepository } from './repositories/categorization-journal.repository';
import { PgVectorRepository } from './repositories/pgvector.repository';
import { StaffOnboardingService } from './services/staff-onboarding.service';
import { StaffDocumentService } from './services/staff-document.service';
import { WelcomePackPdfService } from './services/welcome-pack-pdf.service';
import { StaffOffboardingService } from './services/staff-offboarding.service';
import { Ui19GeneratorService } from './services/ui19-generator.service';
import { CertificateOfServiceService } from './services/certificate-of-service.service';
import { ExitPackPdfService } from './services/exit-pack-pdf.service';
import { EmploymentContractPdfService } from './services/employment-contract-pdf.service';
import { PopiaConsentPdfService } from './services/popia-consent-pdf.service';
import { StaffTerminationService } from './services/staff-termination.service';
import { TimeTrackingService } from './services/time-tracking.service';
import { OvertimeService } from './services/overtime.service';
import { CommissionService } from './services/commission.service';
import { AccruedBankChargeService } from './services/accrued-bank-charge.service';
import { BankFeeService } from './services/bank-fee.service';
import { XeroTransactionSplitService } from './services/xero-transaction-split.service';
import { InvoicePdfService } from './services/invoice-pdf.service';
import { ParentWelcomePackPdfService } from './services/parent-welcome-pack-pdf.service';
import { WelcomePackDeliveryService } from './services/welcome-pack-delivery.service';
// TASK-ACCT: Accounting Parity Services
import { ChartOfAccountService } from './services/chart-of-account.service';
import { GeneralLedgerService } from './services/general-ledger.service';
import { OpeningBalanceService } from './services/opening-balance.service';
import { CashFlowService } from './services/cash-flow.service';
import { SupplierService } from './services/supplier.service';
import { QuoteService } from './services/quote.service';
import { QuotePdfService } from './services/quote-pdf.service'; // TASK-QUOTE-001
import { OnboardingService } from './services/onboarding.service';
import { ParentFeeAgreementPdfService } from './services/parent-fee-agreement-pdf.service';
import { ParentConsentFormsPdfService } from './services/parent-consent-forms-pdf.service';
import { ParentOnboardingService } from './services/parent-onboarding.service';
// TASK-REPORTS-005: Missing Report Types
import { CashFlowReportService } from './services/cash-flow-report.service';
import { AgedPayablesService } from './services/aged-payables.service';
import { CurrencyConversionService } from './services/currency-conversion.service'; // TASK-FIX-004
import { EmailModule } from '../integrations/email/email.module';
import { NotificationModule } from '../notifications/notification.module';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';
import { SarsModule } from '../integrations/sars/sars.module';
import { AgentMemoryModule } from '../agents/memory/agent-memory.module';
import { AuditTrailModule } from '../agents/audit/audit-trail.module';
import { TransactionCategorizerModule } from '../agents/transaction-categorizer/categorizer.module';
import { PaymentMatcherModule } from '../agents/payment-matcher/matcher.module';
import { SarsAgentModule } from '../agents/sars-agent/sars.module';
import { OrchestratorModule } from '../agents/orchestrator/orchestrator.module';
import { ExtractionValidatorModule } from '../agents/extraction-validator/validator.module';
import { SimplePayModule } from '../integrations/simplepay/simplepay.module';
import { ConversationalModule } from '../agents/conversational/conversational.module';
import { RolloutModule } from '../agents/rollout/rollout.module';
// TASK-FIX-004: Exchange Rate Integration
import { ExchangeRateModule } from '../integrations/exchange-rates';

@Module({
  imports: [
    EmailModule,
    forwardRef(() => WhatsAppModule),
    SarsModule,
    forwardRef(() => AgentMemoryModule),
    forwardRef(() => AuditTrailModule), // TASK-SDK-011: Structured Audit Trail
    TransactionCategorizerModule,
    PaymentMatcherModule,
    forwardRef(() => SarsAgentModule),
    forwardRef(() => OrchestratorModule), // TASK-AGENT-005: Orchestrator Agent
    ExtractionValidatorModule, // TASK-AGENT-006: PDF Extraction Validation Agent
    forwardRef(() => ConversationalModule), // TASK-SDK-008: Conversational Agent
    forwardRef(() => NotificationModule),
    forwardRef(() => SimplePayModule), // TASK-STAFF-006: For SimplePay offboarding integration
    forwardRef(() => RolloutModule), // TASK-SDK-012: Parallel Rollout Framework
    ExchangeRateModule, // TASK-FIX-004: Real FX Rate Integration
  ],
  providers: [
    // TASK-QUOTE-001: QuotePdfService for quote PDF generation
    QuotePdfService,
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
    InvoiceNumberService,
    EmployeeNumberService,
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
    VatAdjustmentService, // TASK-SARS-002: VAT201 Adjustment Fields
    PayeService,
    UifService,
    Vat201Service,
    Emp201Service,
    Irp5Service,
    ReconciliationRepository,
    ReconciliationService,
    DiscrepancyService,
    ToleranceConfigService, // TASK-RECON-003: Centralized tolerance configuration
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
    ParentAccountService,
    StatementRepository,
    StatementGenerationService,
    StatementPdfService,
    StatementDeliveryService,
    OffboardingService,
    XeroPayrollJournalRepository,
    XeroPayrollJournalService,
    XeroAccountMappingService,
    StaffOffboardingRepository,
    StaffOnboardingRepository,
    SimplePayRepository,
    StaffRepository,
    LeaveRequestRepository,
    StaffOnboardingService,
    StaffDocumentService,
    WelcomePackPdfService,
    StaffOffboardingService,
    Ui19GeneratorService,
    CertificateOfServiceService,
    ExitPackPdfService,
    EmploymentContractPdfService,
    PopiaConsentPdfService,
    CalculationCacheRepository,
    PayrollAdjustmentRepository,
    ServicePeriodSyncRepository,
    ReportRequestRepository,
    BulkOperationLogRepository,
    EmployeeSetupLogRepository,
    XeroAccountRepository,
    CategorizationJournalRepository,
    PgVectorRepository, // TASK-PGVEC-001: pgvector for AI embedding persistence
    // TASK-STAFF-004 to TASK-STAFF-007: Staff Management Services
    StaffTerminationService,
    TimeTrackingService,
    OvertimeService,
    CommissionService,
    AccruedBankChargeService,
    BankFeeService,
    XeroTransactionSplitService,
    InvoicePdfService, // TASK-BILL-042: PDF generation for invoice emails
    ParentWelcomePackPdfService, // TASK-ENROL-006: Parent Welcome Pack PDF
    WelcomePackDeliveryService, // TASK-ENROL-008: Welcome Pack Delivery Integration
    // TASK-ACCT: Accounting Parity Services
    ChartOfAccountService,
    GeneralLedgerService,
    OpeningBalanceService,
    CashFlowService,
    SupplierService,
    QuoteService,
    OnboardingService,
    // TASK-ONBOARD: Parent Onboarding Services
    ParentFeeAgreementPdfService,
    ParentConsentFormsPdfService,
    ParentOnboardingService,
    // TASK-REPORTS-005: Missing Report Types
    CashFlowReportService,
    AgedPayablesService,
    // TASK-FIX-004: Currency Conversion with Real FX Rates
    CurrencyConversionService,
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
    InvoiceNumberService,
    EmployeeNumberService,
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
    VatAdjustmentService, // TASK-SARS-002: VAT201 Adjustment Fields
    PayeService,
    UifService,
    Vat201Service,
    Emp201Service,
    Irp5Service,
    ReconciliationRepository,
    ReconciliationService,
    DiscrepancyService,
    ToleranceConfigService, // TASK-RECON-003: Centralized tolerance configuration
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
    ParentAccountService,
    StatementRepository,
    StatementGenerationService,
    StatementPdfService,
    StatementDeliveryService,
    OffboardingService,
    XeroPayrollJournalRepository,
    XeroPayrollJournalService,
    XeroAccountMappingService,
    StaffOffboardingRepository,
    StaffOnboardingRepository,
    StaffRepository,
    StaffOnboardingService,
    StaffDocumentService,
    WelcomePackPdfService,
    StaffOffboardingService,
    Ui19GeneratorService,
    CertificateOfServiceService,
    ExitPackPdfService,
    EmploymentContractPdfService,
    PopiaConsentPdfService,
    SimplePayRepository,
    LeaveRequestRepository,
    CalculationCacheRepository,
    PayrollAdjustmentRepository,
    ServicePeriodSyncRepository,
    ReportRequestRepository,
    BulkOperationLogRepository,
    EmployeeSetupLogRepository,
    XeroAccountRepository,
    CategorizationJournalRepository,
    PgVectorRepository, // TASK-PGVEC-001: pgvector for AI embedding persistence
    // TASK-STAFF-004 to TASK-STAFF-007: Staff Management Services
    StaffTerminationService,
    TimeTrackingService,
    OvertimeService,
    CommissionService,
    AccruedBankChargeService,
    BankFeeService,
    XeroTransactionSplitService,
    InvoicePdfService, // TASK-BILL-042: PDF generation for invoice emails
    ParentWelcomePackPdfService, // TASK-ENROL-006: Parent Welcome Pack PDF
    WelcomePackDeliveryService, // TASK-ENROL-008: Welcome Pack Delivery Integration
    // TASK-ACCT: Accounting Parity Services
    ChartOfAccountService,
    GeneralLedgerService,
    OpeningBalanceService,
    CashFlowService,
    SupplierService,
    QuoteService,
    QuotePdfService, // TASK-QUOTE-001: Quote PDF generation (export)
    OnboardingService,
    // TASK-ONBOARD: Parent Onboarding Services
    ParentFeeAgreementPdfService,
    ParentConsentFormsPdfService,
    ParentOnboardingService,
    // TASK-REPORTS-005: Missing Report Types
    CashFlowReportService,
    AgedPayablesService,
    // TASK-FIX-004: Currency Conversion with Real FX Rates
    CurrencyConversionService,
  ],
})
export class DatabaseModule {}
