import { Module } from '@nestjs/common';
import { TenantRepository } from './repositories/tenant.repository';

@Module({
  providers: [TenantRepository],
  exports: [TenantRepository],
})
export class DatabaseModule {}
