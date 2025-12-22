import { Module } from '@nestjs/common';
import { FeeStructureController } from './fee-structure.controller';
import { FeeStructureRepository } from '../../database/repositories/fee-structure.repository';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FeeStructureController],
  providers: [FeeStructureRepository],
  exports: [FeeStructureRepository],
})
export class SettingsModule {}
