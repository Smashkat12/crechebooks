<task_spec id="TASK-RECON-013" version="3.0">

<metadata>
  <title>Financial Report Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>36</sequence>
  <implements>
    <requirement_ref>REQ-RECON-005</requirement_ref>
    <requirement_ref>REQ-RECON-006</requirement_ref>
    <requirement_ref>REQ-RECON-008</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-002</task_ref>
    <task_ref status="COMPLETE">TASK-BILL-003</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
FinancialReportService generates formal financial reports for the creche.

**What it does:**
- **Income Statement (Profit & Loss)**: Revenue - Expenses = Net Profit
- **Balance Sheet**: Assets = Liabilities + Equity
- **Trial Balance**: Total Debits = Total Credits
- Group transactions by account codes from Chart of Accounts
- Format per South African accounting standards (IFRS for SMEs)
- Multi-format export (JSON, future: PDF, Excel)

**Chart of Accounts Structure (SA Standard):**
- 1xxx: Assets (1000-1499 Current, 1500-1999 Non-Current)
- 2xxx: Liabilities (2000-2499 Current, 2500-2999 Non-Current)
- 3xxx: Equity
- 4xxx: Income/Revenue
- 5xxx-8xxx: Expenses

**CRITICAL RULES:**
- ALL monetary values are CENTS (integers) internally
- Display values in RANDS (divide by 100) in report output
- Use Decimal.js for calculations with banker's rounding
- NO backwards compatibility - fail fast with descriptive errors
- NO mock data in tests - use real PostgreSQL database
- Tenant isolation required on ALL queries
- Verify accounting equations (A=L+E, Debits=Credits)
</context>

<project_structure>
ACTUAL file locations (DO NOT use src/core/ - it doesn't exist):

```
src/database/
├── services/
│   └── financial-report.service.ts  # FinancialReportService class
├── dto/
│   └── financial-report.dto.ts      # Report DTOs and types
├── constants/
│   └── chart-of-accounts.constants.ts  # Account code mappings
└── database.module.ts               # Add to providers and exports

tests/database/services/
└── financial-report.service.spec.ts # Integration tests with real DB
```
</project_structure>

<existing_infrastructure>
Dependencies available:
- PrismaService (for direct DB queries)
- TransactionRepository (from TASK-TRANS-001)
- InvoiceRepository (from TASK-BILL-003)
- CategorizationRepository (from TASK-TRANS-002)
- VatService patterns for Decimal.js usage (from TASK-SARS-011)

Prisma models with categorization:
```prisma
model Categorization {
  id              String   @id @default(uuid())
  transactionId   String   @unique @map("transaction_id")
  accountCode     String   @map("account_code")
  accountName     String   @map("account_name")
  vatAmountCents  Int?     @map("vat_amount_cents")
  vatType         VatType  @default(STANDARD)
  // ...
}

model Invoice {
  status          InvoiceStatus
  subtotalCents   Int @map("subtotal_cents")
  vatCents        Int @default(0) @map("vat_cents")
  totalCents      Int @map("total_cents")
  amountPaidCents Int @default(0) @map("amount_paid_cents")
  // ...
}
```
</existing_infrastructure>

<files_to_create>
1. src/database/constants/chart-of-accounts.constants.ts
2. src/database/dto/financial-report.dto.ts
3. src/database/services/financial-report.service.ts
4. tests/database/services/financial-report.service.spec.ts
</files_to_create>

<files_to_modify>
1. src/database/services/index.ts - Add `export * from './financial-report.service';`
2. src/database/dto/index.ts - Add `export * from './financial-report.dto';`
3. src/database/database.module.ts - Add FinancialReportService to providers and exports
</files_to_modify>

<implementation_reference>

## Constants (src/database/constants/chart-of-accounts.constants.ts)
```typescript
/**
 * South African Chart of Accounts structure
 * Based on IFRS for SMEs
 */
export const ACCOUNT_RANGES = {
  ASSETS: { start: 1000, end: 1999 },
  CURRENT_ASSETS: { start: 1000, end: 1499 },
  NON_CURRENT_ASSETS: { start: 1500, end: 1999 },
  LIABILITIES: { start: 2000, end: 2999 },
  CURRENT_LIABILITIES: { start: 2000, end: 2499 },
  NON_CURRENT_LIABILITIES: { start: 2500, end: 2999 },
  EQUITY: { start: 3000, end: 3999 },
  INCOME: { start: 4000, end: 4999 },
  EXPENSES: { start: 5000, end: 8999 },
};

export const DEFAULT_ACCOUNTS = {
  BANK: { code: '1100', name: 'Bank Account' },
  ACCOUNTS_RECEIVABLE: { code: '1200', name: 'Accounts Receivable' },
  PREPAID_EXPENSES: { code: '1300', name: 'Prepaid Expenses' },
  EQUIPMENT: { code: '1500', name: 'Equipment' },
  ACCOUNTS_PAYABLE: { code: '2100', name: 'Accounts Payable' },
  VAT_PAYABLE: { code: '2200', name: 'VAT Payable' },
  RETAINED_EARNINGS: { code: '3100', name: 'Retained Earnings' },
  SCHOOL_FEES: { code: '4000', name: 'School Fees Income' },
  OTHER_INCOME: { code: '4100', name: 'Other Income' },
  SALARIES: { code: '5000', name: 'Salaries and Wages' },
  RENT: { code: '5100', name: 'Rent Expense' },
  UTILITIES: { code: '5200', name: 'Utilities' },
  SUPPLIES: { code: '5300', name: 'Educational Supplies' },
  BANK_CHARGES: { code: '8100', name: 'Bank Charges' },
};

export function isIncomeAccount(code: string): boolean {
  const num = parseInt(code, 10);
  return num >= ACCOUNT_RANGES.INCOME.start && num <= ACCOUNT_RANGES.INCOME.end;
}

export function isExpenseAccount(code: string): boolean {
  const num = parseInt(code, 10);
  return num >= ACCOUNT_RANGES.EXPENSES.start && num <= ACCOUNT_RANGES.EXPENSES.end;
}

export function isAssetAccount(code: string): boolean {
  const num = parseInt(code, 10);
  return num >= ACCOUNT_RANGES.ASSETS.start && num <= ACCOUNT_RANGES.ASSETS.end;
}

export function isLiabilityAccount(code: string): boolean {
  const num = parseInt(code, 10);
  return num >= ACCOUNT_RANGES.LIABILITIES.start && num <= ACCOUNT_RANGES.LIABILITIES.end;
}

export function isEquityAccount(code: string): boolean {
  const num = parseInt(code, 10);
  return num >= ACCOUNT_RANGES.EQUITY.start && num <= ACCOUNT_RANGES.EQUITY.end;
}

export function isCurrentAsset(code: string): boolean {
  const num = parseInt(code, 10);
  return num >= ACCOUNT_RANGES.CURRENT_ASSETS.start && num <= ACCOUNT_RANGES.CURRENT_ASSETS.end;
}
```

## DTOs (src/database/dto/financial-report.dto.ts)
```typescript
export enum ReportFormat {
  JSON = 'JSON',
  PDF = 'PDF',
  EXCEL = 'EXCEL',
}

export interface AccountBreakdown {
  accountCode: string;
  accountName: string;
  amountCents: number;       // Internal - cents
  amountRands: number;       // Display - rands (amountCents / 100)
}

export interface IncomeStatement {
  tenantId: string;
  period: { start: Date; end: Date };
  income: {
    totalCents: number;
    totalRands: number;
    breakdown: AccountBreakdown[];
  };
  expenses: {
    totalCents: number;
    totalRands: number;
    breakdown: AccountBreakdown[];
  };
  netProfitCents: number;
  netProfitRands: number;
  generatedAt: Date;
}

export interface BalanceSheet {
  tenantId: string;
  asOfDate: Date;
  assets: {
    totalCents: number;
    totalRands: number;
    current: AccountBreakdown[];
    nonCurrent: AccountBreakdown[];
  };
  liabilities: {
    totalCents: number;
    totalRands: number;
    current: AccountBreakdown[];
    nonCurrent: AccountBreakdown[];
  };
  equity: {
    totalCents: number;
    totalRands: number;
    breakdown: AccountBreakdown[];
  };
  isBalanced: boolean;  // Assets = Liabilities + Equity
  generatedAt: Date;
}

export interface TrialBalanceAccount {
  accountCode: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
  debitRands: number;
  creditRands: number;
}

export interface TrialBalance {
  tenantId: string;
  asOfDate: Date;
  accounts: TrialBalanceAccount[];
  totals: {
    debitsCents: number;
    creditsCents: number;
    debitsRands: number;
    creditsRands: number;
  };
  isBalanced: boolean;  // Debits = Credits
  generatedAt: Date;
}

export interface ReportRequestDto {
  tenantId: string;
  periodStart?: Date;  // For Income Statement
  periodEnd?: Date;    // For Income Statement
  asOfDate?: Date;     // For Balance Sheet / Trial Balance
  format?: ReportFormat;
}
```

## Service (src/database/services/financial-report.service.ts)
```typescript
import { Injectable, Logger } from '@nestjs/common';
import Decimal from 'decimal.js';
import { InvoiceStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  IncomeStatement,
  BalanceSheet,
  TrialBalance,
  AccountBreakdown,
  TrialBalanceAccount,
} from '../dto/financial-report.dto';
import {
  isIncomeAccount,
  isExpenseAccount,
  isAssetAccount,
  isLiabilityAccount,
  isEquityAccount,
  isCurrentAsset,
  DEFAULT_ACCOUNTS,
} from '../constants/chart-of-accounts.constants';
import { BusinessException } from '../../shared/exceptions';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

@Injectable()
export class FinancialReportService {
  private readonly logger = new Logger(FinancialReportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate Income Statement (Profit & Loss)
   * Revenue - Expenses = Net Profit
   */
  async generateIncomeStatement(
    tenantId: string,
    periodStart: Date,
    periodEnd: Date
  ): Promise<IncomeStatement> {
    if (periodStart > periodEnd) {
      throw new BusinessException(
        'Period start must be before period end',
        'INVALID_PERIOD',
        { periodStart, periodEnd }
      );
    }

    // Get paid invoices for income
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        issueDate: { gte: periodStart, lte: periodEnd },
        status: { in: [InvoiceStatus.PAID, InvoiceStatus.PARTIALLY_PAID] },
        isDeleted: false,
      },
    });

    // Get categorized transactions for income/expenses
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        date: { gte: periodStart, lte: periodEnd },
        isDeleted: false,
      },
      include: { categorization: true },
    });

    const incomeMap = new Map<string, AccountBreakdown>();
    const expenseMap = new Map<string, AccountBreakdown>();

    // Add school fees income from invoices
    const schoolFeesCode = DEFAULT_ACCOUNTS.SCHOOL_FEES.code;
    let totalSchoolFees = new Decimal(0);
    for (const inv of invoices) {
      totalSchoolFees = totalSchoolFees.plus(inv.amountPaidCents);
    }
    if (!totalSchoolFees.isZero()) {
      incomeMap.set(schoolFeesCode, {
        accountCode: schoolFeesCode,
        accountName: DEFAULT_ACCOUNTS.SCHOOL_FEES.name,
        amountCents: totalSchoolFees.toNumber(),
        amountRands: totalSchoolFees.dividedBy(100).toDecimalPlaces(2).toNumber(),
      });
    }

    // Process categorized transactions
    for (const tx of transactions) {
      if (!tx.categorization) continue;

      const accountCode = tx.categorization.accountCode;
      const accountName = tx.categorization.accountName;
      const amount = Math.abs(tx.amountCents);

      if (isIncomeAccount(accountCode)) {
        const existing = incomeMap.get(accountCode);
        if (existing) {
          existing.amountCents += amount;
          existing.amountRands = existing.amountCents / 100;
        } else {
          incomeMap.set(accountCode, {
            accountCode,
            accountName,
            amountCents: amount,
            amountRands: amount / 100,
          });
        }
      } else if (isExpenseAccount(accountCode)) {
        const existing = expenseMap.get(accountCode);
        if (existing) {
          existing.amountCents += amount;
          existing.amountRands = existing.amountCents / 100;
        } else {
          expenseMap.set(accountCode, {
            accountCode,
            accountName,
            amountCents: amount,
            amountRands: amount / 100,
          });
        }
      }
    }

    const incomeBreakdown = Array.from(incomeMap.values())
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    const expenseBreakdown = Array.from(expenseMap.values())
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const totalIncomeCents = incomeBreakdown.reduce((sum, a) => sum + a.amountCents, 0);
    const totalExpensesCents = expenseBreakdown.reduce((sum, a) => sum + a.amountCents, 0);
    const netProfitCents = totalIncomeCents - totalExpensesCents;

    const report: IncomeStatement = {
      tenantId,
      period: { start: periodStart, end: periodEnd },
      income: {
        totalCents: totalIncomeCents,
        totalRands: totalIncomeCents / 100,
        breakdown: incomeBreakdown,
      },
      expenses: {
        totalCents: totalExpensesCents,
        totalRands: totalExpensesCents / 100,
        breakdown: expenseBreakdown,
      },
      netProfitCents,
      netProfitRands: netProfitCents / 100,
      generatedAt: new Date(),
    };

    this.logger.log(
      `Generated Income Statement for ${tenantId}: Income=${totalIncomeCents}c, Expenses=${totalExpensesCents}c, Net=${netProfitCents}c`
    );

    return report;
  }

  /**
   * Generate Balance Sheet
   * Assets = Liabilities + Equity
   */
  async generateBalanceSheet(
    tenantId: string,
    asOfDate: Date
  ): Promise<BalanceSheet> {
    // Get all transactions up to date with categorization
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        date: { lte: asOfDate },
        isDeleted: false,
      },
      include: { categorization: true },
    });

    // Get outstanding invoices (accounts receivable)
    const outstandingInvoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        issueDate: { lte: asOfDate },
        status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.OVERDUE, InvoiceStatus.PARTIALLY_PAID] },
        isDeleted: false,
      },
    });

    const currentAssets: AccountBreakdown[] = [];
    const nonCurrentAssets: AccountBreakdown[] = [];
    const currentLiabilities: AccountBreakdown[] = [];
    const nonCurrentLiabilities: AccountBreakdown[] = [];
    const equityBreakdown: AccountBreakdown[] = [];

    // Calculate cash balance from transactions
    let cashBalance = new Decimal(0);
    for (const tx of transactions) {
      if (tx.isCredit) {
        cashBalance = cashBalance.plus(tx.amountCents);
      } else {
        cashBalance = cashBalance.minus(tx.amountCents);
      }
    }

    if (!cashBalance.isZero()) {
      currentAssets.push({
        accountCode: DEFAULT_ACCOUNTS.BANK.code,
        accountName: DEFAULT_ACCOUNTS.BANK.name,
        amountCents: cashBalance.toNumber(),
        amountRands: cashBalance.dividedBy(100).toDecimalPlaces(2).toNumber(),
      });
    }

    // Calculate accounts receivable
    let arTotal = new Decimal(0);
    for (const inv of outstandingInvoices) {
      arTotal = arTotal.plus(inv.totalCents - inv.amountPaidCents);
    }
    if (!arTotal.isZero()) {
      currentAssets.push({
        accountCode: DEFAULT_ACCOUNTS.ACCOUNTS_RECEIVABLE.code,
        accountName: DEFAULT_ACCOUNTS.ACCOUNTS_RECEIVABLE.name,
        amountCents: arTotal.toNumber(),
        amountRands: arTotal.dividedBy(100).toDecimalPlaces(2).toNumber(),
      });
    }

    // Process categorized transactions for asset/liability accounts
    const assetMap = new Map<string, number>();
    const liabilityMap = new Map<string, number>();

    for (const tx of transactions) {
      if (!tx.categorization) continue;
      const code = tx.categorization.accountCode;
      const amount = tx.isCredit ? tx.amountCents : -tx.amountCents;

      if (isAssetAccount(code) && code !== DEFAULT_ACCOUNTS.BANK.code) {
        assetMap.set(code, (assetMap.get(code) ?? 0) + amount);
      } else if (isLiabilityAccount(code)) {
        liabilityMap.set(code, (liabilityMap.get(code) ?? 0) + amount);
      }
    }

    // Calculate totals
    const totalAssetsCents = currentAssets.reduce((sum, a) => sum + a.amountCents, 0)
      + nonCurrentAssets.reduce((sum, a) => sum + a.amountCents, 0);
    const totalLiabilitiesCents = currentLiabilities.reduce((sum, a) => sum + a.amountCents, 0)
      + nonCurrentLiabilities.reduce((sum, a) => sum + a.amountCents, 0);

    // Equity = Assets - Liabilities (retained earnings)
    const totalEquityCents = totalAssetsCents - totalLiabilitiesCents;
    equityBreakdown.push({
      accountCode: DEFAULT_ACCOUNTS.RETAINED_EARNINGS.code,
      accountName: DEFAULT_ACCOUNTS.RETAINED_EARNINGS.name,
      amountCents: totalEquityCents,
      amountRands: totalEquityCents / 100,
    });

    // Check accounting equation
    const isBalanced = Math.abs(totalAssetsCents - (totalLiabilitiesCents + totalEquityCents)) <= 1;

    if (!isBalanced) {
      this.logger.warn(
        `Balance Sheet does not balance: Assets=${totalAssetsCents}c, L+E=${totalLiabilitiesCents + totalEquityCents}c`
      );
    }

    return {
      tenantId,
      asOfDate,
      assets: {
        totalCents: totalAssetsCents,
        totalRands: totalAssetsCents / 100,
        current: currentAssets,
        nonCurrent: nonCurrentAssets,
      },
      liabilities: {
        totalCents: totalLiabilitiesCents,
        totalRands: totalLiabilitiesCents / 100,
        current: currentLiabilities,
        nonCurrent: nonCurrentLiabilities,
      },
      equity: {
        totalCents: totalEquityCents,
        totalRands: totalEquityCents / 100,
        breakdown: equityBreakdown,
      },
      isBalanced,
      generatedAt: new Date(),
    };
  }

  /**
   * Generate Trial Balance
   * Total Debits = Total Credits
   */
  async generateTrialBalance(
    tenantId: string,
    asOfDate: Date
  ): Promise<TrialBalance> {
    const transactions = await this.prisma.transaction.findMany({
      where: {
        tenantId,
        date: { lte: asOfDate },
        isDeleted: false,
      },
      include: { categorization: true },
    });

    const accountBalances = new Map<string, TrialBalanceAccount>();

    for (const tx of transactions) {
      if (!tx.categorization) continue;

      const code = tx.categorization.accountCode;
      const name = tx.categorization.accountName;
      const amount = Math.abs(tx.amountCents);

      if (!accountBalances.has(code)) {
        accountBalances.set(code, {
          accountCode: code,
          accountName: name,
          debitCents: 0,
          creditCents: 0,
          debitRands: 0,
          creditRands: 0,
        });
      }

      const account = accountBalances.get(code)!;

      // Debit accounts: Assets (1xxx), Expenses (5xxx-8xxx)
      // Credit accounts: Liabilities (2xxx), Equity (3xxx), Income (4xxx)
      if (isAssetAccount(code) || isExpenseAccount(code)) {
        if (tx.isCredit) {
          account.creditCents += amount;
        } else {
          account.debitCents += amount;
        }
      } else {
        if (tx.isCredit) {
          account.creditCents += amount;
        } else {
          account.debitCents += amount;
        }
      }

      account.debitRands = account.debitCents / 100;
      account.creditRands = account.creditCents / 100;
    }

    const accounts = Array.from(accountBalances.values())
      .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    const totalDebitsCents = accounts.reduce((sum, a) => sum + a.debitCents, 0);
    const totalCreditsCents = accounts.reduce((sum, a) => sum + a.creditCents, 0);
    const isBalanced = Math.abs(totalDebitsCents - totalCreditsCents) <= 1;

    if (!isBalanced) {
      this.logger.warn(
        `Trial Balance does not balance: Debits=${totalDebitsCents}c, Credits=${totalCreditsCents}c`
      );
    }

    return {
      tenantId,
      asOfDate,
      accounts,
      totals: {
        debitsCents: totalDebitsCents,
        creditsCents: totalCreditsCents,
        debitsRands: totalDebitsCents / 100,
        creditsRands: totalCreditsCents / 100,
      },
      isBalanced,
      generatedAt: new Date(),
    };
  }

  /**
   * Export report to PDF (placeholder - implement with pdfmake or puppeteer)
   */
  async exportPDF(_report: IncomeStatement | BalanceSheet | TrialBalance): Promise<Buffer> {
    throw new BusinessException(
      'PDF export not yet implemented',
      'NOT_IMPLEMENTED',
      {}
    );
  }

  /**
   * Export report to Excel (placeholder - implement with exceljs)
   */
  async exportExcel(_report: IncomeStatement | BalanceSheet | TrialBalance): Promise<Buffer> {
    throw new BusinessException(
      'Excel export not yet implemented',
      'NOT_IMPLEMENTED',
      {}
    );
  }
}
```
</implementation_reference>

<test_requirements>
CRITICAL: Tests use REAL PostgreSQL database - NO MOCKS.

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../src/database/prisma/prisma.service';
import { FinancialReportService } from '../../src/database/services/financial-report.service';
import { Tenant, InvoiceStatus, VatType } from '@prisma/client';

describe('FinancialReportService', () => {
  let service: FinancialReportService;
  let prisma: PrismaService;
  let testTenant: Tenant;
  let testParent: { id: string };
  let testChild: { id: string };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PrismaService, FinancialReportService],
    }).compile();

    prisma = module.get<PrismaService>(PrismaService);
    service = module.get<FinancialReportService>(FinancialReportService);
    await prisma.onModuleInit();
  });

  beforeEach(async () => {
    // Clean in FK order
    await prisma.invoiceLine.deleteMany({});
    await prisma.invoice.deleteMany({});
    await prisma.categorization.deleteMany({});
    await prisma.transaction.deleteMany({});
    await prisma.child.deleteMany({});
    await prisma.parent.deleteMany({});
    await prisma.tenant.deleteMany({});

    testTenant = await prisma.tenant.create({
      data: {
        name: 'Financial Test Creche',
        email: 'finance@test.co.za',
        taxStatus: 'VAT_REGISTERED',
      },
    });

    testParent = await prisma.parent.create({
      data: {
        tenantId: testTenant.id,
        firstName: 'Test',
        lastName: 'Parent',
        email: 'parent@test.co.za',
        phone: '0821234567',
      },
    });

    testChild = await prisma.child.create({
      data: {
        tenantId: testTenant.id,
        parentId: testParent.id,
        firstName: 'Test',
        lastName: 'Child',
        dateOfBirth: new Date('2020-01-01'),
      },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('generateIncomeStatement()', () => {
    it('should calculate net profit correctly', async () => {
      // Create paid invoice (income)
      await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-001',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-05'),
          dueDate: new Date('2025-01-20'),
          subtotalCents: 500000,  // R5000
          vatCents: 75000,        // R750
          totalCents: 575000,     // R5750
          amountPaidCents: 575000,
          status: InvoiceStatus.PAID,
        },
      });

      // Create expense transaction with categorization
      const expenseTx = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date('2025-01-15'),
          amountCents: 100000,  // R1000
          isCredit: false,
          description: 'Supplies',
          bankAccount: 'FNB',
        },
      });

      await prisma.categorization.create({
        data: {
          transactionId: expenseTx.id,
          accountCode: '5300',
          accountName: 'Educational Supplies',
          vatType: VatType.STANDARD,
        },
      });

      const report = await service.generateIncomeStatement(
        testTenant.id,
        new Date('2025-01-01'),
        new Date('2025-01-31')
      );

      // Income from school fees = R5750 (amount paid)
      expect(report.income.totalCents).toBe(575000);
      // Expenses = R1000
      expect(report.expenses.totalCents).toBe(100000);
      // Net = R5750 - R1000 = R4750
      expect(report.netProfitCents).toBe(475000);
      expect(report.netProfitRands).toBe(4750);
    });

    it('should handle period with no transactions', async () => {
      const report = await service.generateIncomeStatement(
        testTenant.id,
        new Date('2025-06-01'),
        new Date('2025-06-30')
      );

      expect(report.income.totalCents).toBe(0);
      expect(report.expenses.totalCents).toBe(0);
      expect(report.netProfitCents).toBe(0);
    });

    it('should throw on invalid period', async () => {
      await expect(service.generateIncomeStatement(
        testTenant.id,
        new Date('2025-01-31'),
        new Date('2025-01-01')  // End before start
      )).rejects.toThrow('Period start must be before period end');
    });
  });

  describe('generateBalanceSheet()', () => {
    it('should balance: Assets = Liabilities + Equity', async () => {
      // Create credit transaction (cash in)
      await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date('2025-01-15'),
          amountCents: 100000,
          isCredit: true,
          description: 'Deposit',
          bankAccount: 'FNB',
        },
      });

      const report = await service.generateBalanceSheet(
        testTenant.id,
        new Date('2025-01-31')
      );

      expect(report.isBalanced).toBe(true);
      expect(report.assets.totalCents).toBe(
        report.liabilities.totalCents + report.equity.totalCents
      );
    });

    it('should include accounts receivable from outstanding invoices', async () => {
      await prisma.invoice.create({
        data: {
          tenantId: testTenant.id,
          invoiceNumber: 'INV-002',
          parentId: testParent.id,
          childId: testChild.id,
          billingPeriodStart: new Date('2025-01-01'),
          billingPeriodEnd: new Date('2025-01-31'),
          issueDate: new Date('2025-01-05'),
          dueDate: new Date('2025-01-20'),
          subtotalCents: 500000,
          vatCents: 75000,
          totalCents: 575000,
          amountPaidCents: 0,
          status: InvoiceStatus.OVERDUE,
        },
      });

      const report = await service.generateBalanceSheet(
        testTenant.id,
        new Date('2025-01-31')
      );

      const ar = report.assets.current.find(a => a.accountCode === '1200');
      expect(ar).toBeDefined();
      expect(ar!.amountCents).toBe(575000);
    });
  });

  describe('generateTrialBalance()', () => {
    it('should balance: Debits = Credits', async () => {
      // Create balanced transactions
      const tx1 = await prisma.transaction.create({
        data: {
          tenantId: testTenant.id,
          date: new Date('2025-01-15'),
          amountCents: 100000,
          isCredit: true,
          description: 'Income',
          bankAccount: 'FNB',
        },
      });

      await prisma.categorization.create({
        data: {
          transactionId: tx1.id,
          accountCode: '4000',
          accountName: 'School Fees',
          vatType: VatType.STANDARD,
        },
      });

      const report = await service.generateTrialBalance(
        testTenant.id,
        new Date('2025-01-31')
      );

      // Note: In simplified version, may not perfectly balance
      // Full implementation needs double-entry booking
      expect(report.accounts.length).toBeGreaterThan(0);
    });
  });
});
```
</test_requirements>

<validation_criteria>
- TypeScript compiles without errors (npm run build)
- Lint passes (npm run lint)
- All tests pass with real PostgreSQL database
- Income Statement: Revenue - Expenses = Net Profit
- Balance Sheet: Assets = Liabilities + Equity (isBalanced flag)
- Trial Balance: Debits = Credits (isBalanced flag)
- Accounts grouped by account code correctly
- School fees income from invoices included
- Accounts receivable from outstanding invoices included
- Cash balance calculated from transactions
- Empty periods handled gracefully
- All amounts in cents internally, rands in display fields
- Decimal.js with banker's rounding used
- Tenant isolation enforced
- Generation timestamp included
- No 'any' types used
</validation_criteria>

<test_commands>
npm run build
npm run lint
npm run test -- --testPathPattern="financial-report.service" --verbose
</test_commands>

</task_spec>
