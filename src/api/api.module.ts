import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { TransactionModule } from './transaction/transaction.module';
import { BillingModule } from './billing/billing.module';
import { PaymentModule } from './payment/payment.module';
import { SarsModule } from './sars/sars.module';

@Module({
  imports: [
    AuthModule,
    TransactionModule,
    BillingModule,
    PaymentModule,
    SarsModule,
  ],
  exports: [
    AuthModule,
    TransactionModule,
    BillingModule,
    PaymentModule,
    SarsModule,
  ],
})
export class ApiModule {}
