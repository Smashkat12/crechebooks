import { Module } from '@nestjs/common';
import { TenantRepository } from './repositories/tenant.repository';
import { UserRepository } from './repositories/user.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { AuditLogService } from './services/audit-log.service';
import { TransactionImportService } from './services/transaction-import.service';

@Module({
  providers: [
    TenantRepository,
    UserRepository,
    TransactionRepository,
    AuditLogService,
    TransactionImportService,
  ],
  exports: [
    TenantRepository,
    UserRepository,
    TransactionRepository,
    AuditLogService,
    TransactionImportService,
  ],
})
export class DatabaseModule {}
