import { Module } from '@nestjs/common';
import { InvoiceController } from './invoice.controller';
import { ChildController } from './child.controller';
import { EnrollmentController } from './enrollment.controller';
import { DatabaseModule } from '../../database/database.module';
import { InvoicePdfService } from '../../database/services/invoice-pdf.service';
import { AdhocChargeService } from '../../database/services/adhoc-charge.service';
import { EmailModule } from '../../integrations/email/email.module';
import { WhatsAppModule } from '../../integrations/whatsapp/whatsapp.module';

@Module({
  imports: [DatabaseModule, EmailModule, WhatsAppModule],
  controllers: [InvoiceController, ChildController, EnrollmentController],
  providers: [InvoicePdfService, AdhocChargeService],
})
export class BillingApiModule {}
