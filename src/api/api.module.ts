import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { TransactionModule } from './transaction/transaction.module';
import { BillingModule } from './billing/billing.module';
import { PaymentModule } from './payment/payment.module';

@Module({
  imports: [AuthModule, TransactionModule, BillingModule, PaymentModule],
  exports: [AuthModule, TransactionModule, BillingModule, PaymentModule],
})
export class ApiModule {}
