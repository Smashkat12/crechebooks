import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { TransactionModule } from './transaction/transaction.module';
import { BillingApiModule } from './billing/billing.module';
import { PaymentModule } from './payment/payment.module';
import { SarsApiModule } from './sars/sars.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { ParentsModule } from './parents/parents.module';
import { StaffModule } from './staff/staff.module';
import { ArrearsModule } from './arrears/arrears.module';
import { SettingsModule } from './settings/settings.module';

@Module({
  imports: [
    AuthModule,
    TransactionModule,
    BillingApiModule,
    PaymentModule,
    SarsApiModule,
    ReconciliationModule,
    DashboardModule,
    ParentsModule,
    StaffModule,
    ArrearsModule,
    SettingsModule,
  ],
  exports: [
    AuthModule,
    TransactionModule,
    BillingApiModule,
    PaymentModule,
    SarsApiModule,
    ReconciliationModule,
    DashboardModule,
    ParentsModule,
    StaffModule,
    ArrearsModule,
    SettingsModule,
  ],
})
export class ApiModule {}
