import { Module } from '@nestjs/common';
import { ArrearsController } from './arrears.controller';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { ChildRepository } from '../../database/repositories/child.repository';
import { TenantRepository } from '../../database/repositories/tenant.repository';
import { ArrearsReportPdfService } from '../../database/services/arrears-report-pdf.service';
import { ArrearsService } from '../../database/services/arrears.service';
import { PrismaModule } from '../../database/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [ArrearsController],
  providers: [
    InvoiceRepository,
    ParentRepository,
    ChildRepository,
    TenantRepository,
    ArrearsService,
    ArrearsReportPdfService,
  ],
})
export class ArrearsModule {}
