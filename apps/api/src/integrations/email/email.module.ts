/**
 * EmailModule
 * TASK-BILL-013: Invoice Delivery Service
 * TASK-BILL-042: Email Templates and PDF Attachments
 */

import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailTemplateService } from '../../common/services/email-template/email-template.service';
import { MailgunModule } from '../mailgun/mailgun.module';

@Module({
  imports: [MailgunModule],
  providers: [EmailService, EmailTemplateService],
  exports: [EmailService, EmailTemplateService],
})
export class EmailModule {}
