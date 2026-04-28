/**
 * PaymentAttachmentsModule
 *
 * Proof-of-payment upload, review, and linking workflow.
 *
 * Admin routes:  /api/v1/payment-attachments/
 * Parent routes: /api/v1/parent-portal/payment-attachments/
 */

import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { StorageModule } from '../../integrations/storage/storage.module';
import { OcrModule } from '../../integrations/ocr/ocr.module';
import { PaymentAttachmentsController } from './payment-attachments.controller';
import { ParentPaymentAttachmentsController } from './parent-payment-attachments.controller';
import { PaymentAttachmentsService } from './payment-attachments.service';
import { PaymentAttachmentMatcherService } from './payment-attachment-matcher.service';

@Module({
  imports: [DatabaseModule, AuthModule, StorageModule, OcrModule],
  controllers: [
    PaymentAttachmentsController,
    ParentPaymentAttachmentsController,
  ],
  providers: [PaymentAttachmentsService, PaymentAttachmentMatcherService],
  exports: [PaymentAttachmentsService, PaymentAttachmentMatcherService],
})
export class PaymentAttachmentsModule {}
