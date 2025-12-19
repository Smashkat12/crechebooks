import { Module } from '@nestjs/common';
import { TenantRepository } from './repositories/tenant.repository';
import { UserRepository } from './repositories/user.repository';

@Module({
  providers: [TenantRepository, UserRepository],
  exports: [TenantRepository, UserRepository],
})
export class DatabaseModule {}
