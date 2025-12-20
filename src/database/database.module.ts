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
import { AuditLogService } from './services/audit-log.service';
import { TransactionImportService } from './services/transaction-import.service';
import { CategorizationService } from './services/categorization.service';
import { PatternLearningService } from './services/pattern-learning.service';
import { XeroSyncService } from './services/xero-sync.service';
import { EnrollmentService } from './services/enrollment.service';
import { InvoiceGenerationService } from './services/invoice-generation.service';

@Module({
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
    AuditLogService,
    TransactionImportService,
    CategorizationService,
    PatternLearningService,
    XeroSyncService,
    EnrollmentService,
    InvoiceGenerationService,
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
    AuditLogService,
    TransactionImportService,
    CategorizationService,
    PatternLearningService,
    XeroSyncService,
    EnrollmentService,
    InvoiceGenerationService,
  ],
})
export class DatabaseModule {}
