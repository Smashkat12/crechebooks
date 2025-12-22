/**
 * Payment Module
 * TASK-PAY-031: Payment Controller and DTOs
 * TASK-PAY-032: Payment Matching Endpoint
 * TASK-PAY-033: Arrears Dashboard Endpoint
 *
 * Provides the PaymentController with required dependencies for
 * manual payment allocation, payment listing, AI payment matching, and arrears reporting endpoints.
 */

import { Module } from '@nestjs/common';
import { PaymentController } from './payment.controller';
import { PaymentRepository } from '../../database/repositories/payment.repository';
import { TransactionRepository } from '../../database/repositories/transaction.repository';
import { InvoiceRepository } from '../../database/repositories/invoice.repository';
import { ParentRepository } from '../../database/repositories/parent.repository';
import { PaymentAllocationService } from '../../database/services/payment-allocation.service';
import { PaymentMatchingService } from '../../database/services/payment-matching.service';
import { ArrearsService } from '../../database/services/arrears.service';
import { AuditLogService } from '../../database/services/audit-log.service';
import { PrismaModule } from '../../database/prisma';

@Module({
  imports: [PrismaModule],
  controllers: [PaymentController],
  providers: [
    PaymentRepository,
    TransactionRepository,
    InvoiceRepository,
    ParentRepository,
    PaymentAllocationService,
    PaymentMatchingService,
    ArrearsService,
    AuditLogService,
  ],
})
export class PaymentModule {}
