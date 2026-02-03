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
import { XeroModule } from '../integrations/xero/xero.module';
import { XeroPayrollModule } from './xero/xero-payroll.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { CommunicationsApiModule } from './communications/communications-api.module';
import { AccountingModule } from './accounting/accounting.module';
import { PayrollModule } from './payroll/payroll.module';

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
    XeroModule,
    XeroPayrollModule,
    IntegrationsModule,
    CommunicationsApiModule,
    AccountingModule, // TASK-ACCT: Accounting Parity Features
    PayrollModule, // SimplePay payroll processing integration
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
    XeroModule,
    XeroPayrollModule,
    IntegrationsModule,
    CommunicationsApiModule,
    AccountingModule,
    PayrollModule,
  ],
})
export class ApiModule {}
