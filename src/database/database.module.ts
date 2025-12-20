import { Module } from '@nestjs/common';
import { TenantRepository } from './repositories/tenant.repository';
import { UserRepository } from './repositories/user.repository';
import { TransactionRepository } from './repositories/transaction.repository';
import { AuditLogService } from './services/audit-log.service';

@Module({
  providers: [
    TenantRepository,
    UserRepository,
    TransactionRepository,
    AuditLogService,
  ],
  exports: [
    TenantRepository,
    UserRepository,
    TransactionRepository,
    AuditLogService,
  ],
})
export class DatabaseModule {}
