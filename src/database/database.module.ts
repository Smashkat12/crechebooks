import { Module } from '@nestjs/common';
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
import { EmailModule } from '../integrations/email/email.module';
import { WhatsAppModule } from '../integrations/whatsapp/whatsapp.module';

@Module({
  imports: [EmailModule, WhatsAppModule],
  providers: [
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
  ],
  exports: [
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
  ],
})
export class DatabaseModule {}
