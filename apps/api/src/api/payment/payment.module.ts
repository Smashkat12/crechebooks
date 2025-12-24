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
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [PaymentController],
})
export class PaymentModule {}
