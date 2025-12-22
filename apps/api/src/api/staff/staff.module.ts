import { Module } from '@nestjs/common';
import { StaffController } from './staff.controller';
import { StaffRepository } from '../../database/repositories/staff.repository';
import { PrismaModule } from '../../database/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [StaffController],
  providers: [StaffRepository],
  exports: [StaffRepository],
})
export class StaffModule {}
