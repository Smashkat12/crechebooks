import { Module } from '@nestjs/common';
import { FeeStructureController } from './fee-structure.controller';
import { TenantController } from './tenant.controller';
import { FeeStructureRepository } from '../../database/repositories/fee-structure.repository';
import { TenantRepository } from '../../database/repositories/tenant.repository';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FeeStructureController, TenantController],
  providers: [FeeStructureRepository, TenantRepository],
  exports: [FeeStructureRepository, TenantRepository],
})
export class SettingsModule {}
