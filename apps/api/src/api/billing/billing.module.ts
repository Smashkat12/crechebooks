import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { ChildController } from './child.controller';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { InvoiceLineRepository } from '../../database/repositories/invoice-line.repository';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { ChildRepository } from '../../database/repositories/child.repository';
import { TenantRepository } from '../../database/repositories/tenant.repository';
import { EnrollmentRepository } from '../../database/repositories/enrollment.repository';
import { FeeStructureRepository } from '../../database/repositories/fee-structure.repository';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { CategorizationRepository } from '../../database/repositories/categorization.repository';
import { InvoiceGenerationService } from '../../database/services/invoice-generation.service';
import { InvoiceDeliveryService } from '../../database/services/invoice-delivery.service';
import { EnrollmentService } from '../../database/services/enrollment.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { XeroSyncService } from '../../database/services/xero-sync.service';
import { AdhocChargeService } from '../../database/services/adhoc-charge.service';
import { VatService } from '../../database/services/vat.service';
import { EmailService } from '../../integrations/email/email.service';
import { WhatsAppService } from '../../integrations/whatsapp/whatsapp.service';
import { PrismaModule } from '../../database/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [InvoiceController, ChildController],
  providers: [
    InvoiceRepository,
    InvoiceLineRepository,
    ParentRepository,
    ChildRepository,
    TenantRepository,
    EnrollmentRepository,
    FeeStructureRepository,
    TransactionRepository,
    CategorizationRepository,
    InvoiceGenerationService,
    InvoiceDeliveryService,
    EnrollmentService,
    AuditLogService,
    XeroSyncService,
    AdhocChargeService,
    VatService,
    EmailService,
    WhatsAppService,
  ],
})
export class BillingModule {}
