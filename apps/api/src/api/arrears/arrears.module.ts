import { Module } from '@nestjs/common';
import { ArrearsController } from './arrears.controller';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { ChildRepository } from '../../database/repositories/child.repository';
import { PrismaModule } from '../../database/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [ArrearsController],
  providers: [InvoiceRepository, ParentRepository, ChildRepository],
})
export class ArrearsModule {}
