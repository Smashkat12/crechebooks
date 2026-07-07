/**
 * EmailModule
 * TASK-BILL-013: Invoice Delivery Service
 * TASK-BILL-042: Email Templates and PDF Attachments
 *
 * CommsGuardService is provided globally by CommsGuardModule (imported in
 * AppModule), so it is available to EmailService without an explicit import
 * here.
 */

import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailTemplateService } from '../../common/services/email-template/email-template.service';

@Module({
  providers: [EmailService, EmailTemplateService],
  exports: [EmailService, EmailTemplateService],
})
export class EmailModule {}
