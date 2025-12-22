import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { TransactionModule } from './transaction/transaction.module';
import { BillingModule } from './billing/billing.module';

@Module({
  imports: [AuthModule, TransactionModule, BillingModule],
  exports: [AuthModule, TransactionModule, BillingModule],
})
export class ApiModule {}
