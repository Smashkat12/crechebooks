/**
 * EmailModule
 * TASK-BILL-013: Invoice Delivery Service
 */

import { Module } from '@nestjs/common';
import { EmailService } from './email.service';

@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
