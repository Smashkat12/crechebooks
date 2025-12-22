/**
 * Payment Module
 * TASK-PAY-031: Payment Controller and DTOs
 *
 * Provides the PaymentController with required dependencies for
 * manual payment allocation and payment listing endpoints.
 */

import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { PaymentAllocationService } from '../../database/services/payment-allocation.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { PrismaModule } from '../../database/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentController],
  providers: [
    PaymentRepository,
    TransactionRepository,
    InvoiceRepository,
    PaymentAllocationService,
    AuditLogService,
  ],
})
export class PaymentModule {}
