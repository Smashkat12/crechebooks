import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import { OnboardingController } from './onboarding.controller';
import { QuoteController } from './quote.controller';
import { SupplierController } from './supplier.controller';
import { ChartOfAccountController } from './chart-of-account.controller';
import { GeneralLedgerController } from './general-ledger.controller';
import { CashFlowController } from './cash-flow.controller';

/**
 * Accounting Module
 * TASK-ACCT: Accounting Parity Features
 *
 * Provides API endpoints for:
 * - Onboarding wizard
 * - Quotes management
 * - Supplier management
 * - Chart of accounts
 * - General ledger views
 * - Cash flow reports
 */
@Module({
  imports: [DatabaseModule],
  controllers: [
    OnboardingController,
    QuoteController,
    SupplierController,
    ChartOfAccountController,
    GeneralLedgerController,
    CashFlowController,
  ],
})
export class AccountingModule {}
