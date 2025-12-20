import { Module } from '@nestjs/common';
import { TenantRepository } from './repositories/tenant.repository';
import { UserRepository } from './repositories/user.repository';
import { AuditLogService } from './services/audit-log.service';

@Module({
  providers: [TenantRepository, UserRepository, AuditLogService],
  exports: [TenantRepository, UserRepository, AuditLogService],
})
export class DatabaseModule {}
