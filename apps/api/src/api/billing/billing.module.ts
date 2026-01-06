import { Module, forwardRef } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { ChildController } from './child.controller';
import { EnrollmentController } from './enrollment.controller';
import { StatementController } from './statement.controller';
import { DatabaseModule } from '../../database/database.module';
import { InvoicePdfService } from '../../database/services/invoice-pdf.service';
import { AdhocChargeService } from '../../database/services/adhoc-charge.service';
import { EmailModule } from '../../integrations/email/email.module';
import { WhatsAppModule } from '../../integrations/whatsapp/whatsapp.module';
import { SchedulerModule } from '../../scheduler/scheduler.module';

@Module({
  imports: [
    DatabaseModule,
    EmailModule,
    WhatsAppModule,
    forwardRef(() => SchedulerModule),
  ],
  controllers: [
    InvoiceController,
    ChildController,
    EnrollmentController,
    StatementController,
  ],
  providers: [InvoicePdfService, AdhocChargeService],
})
export class BillingApiModule {}
