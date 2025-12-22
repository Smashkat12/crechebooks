import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { InvoiceLineRepository } from '../../database/repositories/invoice-line.repository';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { ChildRepository } from '../../database/repositories/child.repository';
import { TenantRepository } from '../../database/repositories/tenant.repository';
import { EnrollmentRepository } from '../../database/repositories/enrollment.repository';
import { FeeStructureRepository } from '../../database/repositories/fee-structure.repository';
import { InvoiceGenerationService } from '../../database/services/invoice-generation.service';
import { EnrollmentService } from '../../database/services/enrollment.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { XeroSyncService } from '../../database/services/xero-sync.service';
import { PrismaModule } from '../../database/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [InvoiceController],
  providers: [
    InvoiceRepository,
    InvoiceLineRepository,
    ParentRepository,
    ChildRepository,
    TenantRepository,
    EnrollmentRepository,
    FeeStructureRepository,
    InvoiceGenerationService,
    EnrollmentService,
    AuditLogService,
    XeroSyncService,
  ],
})
export class BillingModule {}
