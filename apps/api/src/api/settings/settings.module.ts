import { Module } from '@nestjs/common';
import { FeeStructureController } from './fee-structure.controller';
import { TenantController } from './tenant.controller';
import { BankFeesController } from './bank-fees.controller';
import { FeeStructureRepository } from '../../database/repositories/fee-structure.repository';
import { TenantRepository } from '../../database/repositories/tenant.repository';
import { PrismaModule } from '../../database/prisma/prisma.module';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [PrismaModule, DatabaseModule],
  controllers: [FeeStructureController, TenantController, BankFeesController],
  providers: [FeeStructureRepository, TenantRepository],
  exports: [FeeStructureRepository, TenantRepository],
})
export class SettingsModule {}
