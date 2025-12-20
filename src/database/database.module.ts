import { Module } from '@nestjs/common';
import { TenantRepository } from './repositories/tenant.repository';
import { UserRepository } from './repositories/user.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { CategorizationRepository } from './repositories/categorization.repository';
import { PayeePatternRepository } from './repositories/payee-pattern.repository';
import { AuditLogService } from './services/audit-log.service';
import { TransactionImportService } from './services/transaction-import.service';
import { CategorizationService } from './services/categorization.service';
import { PatternLearningService } from './services/pattern-learning.service';
import { XeroSyncService } from './services/xero-sync.service';

@Module({
  providers: [
    TenantRepository,
    UserRepository,
    TransactionRepository,
    CategorizationRepository,
    PayeePatternRepository,
    AuditLogService,
    TransactionImportService,
    CategorizationService,
    PatternLearningService,
    XeroSyncService,
  ],
  exports: [
    TenantRepository,
    UserRepository,
    TransactionRepository,
    CategorizationRepository,
    PayeePatternRepository,
    AuditLogService,
    TransactionImportService,
    CategorizationService,
    PatternLearningService,
    XeroSyncService,
  ],
})
export class DatabaseModule {}
