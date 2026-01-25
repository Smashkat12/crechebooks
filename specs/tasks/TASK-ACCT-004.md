<task_spec id="TASK-ACCT-004" version="2.0">

<metadata>
  <title>Cash Flow Report Service</title>
  <status>ready</status>
  <phase>25</phase>
  <layer>logic</layer>
  <sequence>404</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-ACCT-CF-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-ACCT-001</task_ref>
    <task_ref status="ready">TASK-ACCT-002</task_ref>
    <task_ref status="COMPLETE">TASK-RECON-013</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-01-25</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  CrecheBooks has Income Statement and Balance Sheet but no Cash Flow Report.
  Stub provides a dedicated Cash Flow statement - a standard financial report.

  **Existing Resources:**
  - financial-report.service.ts - Has income statement, balance sheet
  - Transaction model - Cash transactions from bank
  - Payment model - Parent payments received
  - Invoice model - Invoiced amounts

  **Gap:**
  - No cash flow statement generation
  - No operating/investing/financing breakdown
  - Missing from financial report suite

  **Files to Create:**
  - apps/api/src/database/services/cash-flow.service.ts
  - apps/api/src/database/dto/cash-flow.dto.ts

  **Files to Modify:**
  - apps/api/src/database/services/financial-report.service.ts (ADD getCashFlowStatement method)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use `pnpm` NOT `npm`.

  ### 2. Cash Flow Service
  ```typescript
  // apps/api/src/database/services/cash-flow.service.ts
  import { Injectable } from '@nestjs/common';
  import { PrismaService } from '../prisma.service';
  import { Decimal } from '@prisma/client/runtime/library';

  export interface CashFlowStatement {
    period: {
      startDate: Date;
      endDate: Date;
    };

    operatingActivities: {
      netIncome: number;
      adjustments: {
        depreciation: number;
        receivablesChange: number;  // Decrease = cash inflow
        payablesChange: number;      // Increase = cash inflow
        otherAdjustments: number;
      };
      totalAdjustments: number;
      netCashFromOperating: number;
    };

    investingActivities: {
      assetPurchases: number;        // Cash outflow (negative)
      assetSales: number;            // Cash inflow (positive)
      netCashFromInvesting: number;
    };

    financingActivities: {
      loanProceeds: number;          // Cash inflow
      loanRepayments: number;        // Cash outflow (negative)
      ownerContributions: number;    // Cash inflow
      ownerDrawings: number;         // Cash outflow (negative)
      netCashFromFinancing: number;
    };

    summary: {
      netCashChange: number;
      openingCashBalance: number;
      closingCashBalance: number;
    };
  }

  @Injectable()
  export class CashFlowService {
    constructor(
      private readonly prisma: PrismaService,
      private readonly generalLedgerService: GeneralLedgerService,
    ) {}

    async generateCashFlowStatement(
      tenantId: string,
      startDate: Date,
      endDate: Date,
    ): Promise<CashFlowStatement> {
      // Get comparative data (prior period for changes)
      const priorStartDate = new Date(startDate);
      priorStartDate.setDate(priorStartDate.getDate() - 1);

      // 1. Calculate Net Income from income statement
      const netIncome = await this.calculateNetIncome(tenantId, startDate, endDate);

      // 2. Operating Activities Adjustments
      const depreciation = await this.getDepreciationExpense(tenantId, startDate, endDate);
      const receivablesChange = await this.calculateReceivablesChange(tenantId, startDate, endDate);
      const payablesChange = await this.calculatePayablesChange(tenantId, startDate, endDate);

      const totalAdjustments = depreciation - receivablesChange + payablesChange;
      const netCashFromOperating = netIncome + totalAdjustments;

      // 3. Investing Activities
      const assetPurchases = await this.getAssetPurchases(tenantId, startDate, endDate);
      const assetSales = await this.getAssetSales(tenantId, startDate, endDate);
      const netCashFromInvesting = assetSales - assetPurchases;

      // 4. Financing Activities
      const loanProceeds = await this.getLoanProceeds(tenantId, startDate, endDate);
      const loanRepayments = await this.getLoanRepayments(tenantId, startDate, endDate);
      const ownerContributions = await this.getOwnerContributions(tenantId, startDate, endDate);
      const ownerDrawings = await this.getOwnerDrawings(tenantId, startDate, endDate);
      const netCashFromFinancing = loanProceeds - loanRepayments + ownerContributions - ownerDrawings;

      // 5. Summary
      const openingCashBalance = await this.getCashBalance(tenantId, startDate);
      const netCashChange = netCashFromOperating + netCashFromInvesting + netCashFromFinancing;
      const closingCashBalance = openingCashBalance + netCashChange;

      return {
        period: { startDate, endDate },
        operatingActivities: {
          netIncome,
          adjustments: {
            depreciation,
            receivablesChange: -receivablesChange, // Show as adjustment
            payablesChange,
            otherAdjustments: 0,
          },
          totalAdjustments,
          netCashFromOperating,
        },
        investingActivities: {
          assetPurchases: -assetPurchases, // Show as negative
          assetSales,
          netCashFromInvesting,
        },
        financingActivities: {
          loanProceeds,
          loanRepayments: -loanRepayments, // Show as negative
          ownerContributions,
          ownerDrawings: -ownerDrawings, // Show as negative
          netCashFromFinancing,
        },
        summary: {
          netCashChange,
          openingCashBalance,
          closingCashBalance,
        },
      };
    }

    private async calculateNetIncome(tenantId: string, startDate: Date, endDate: Date): Promise<number> {
      // Sum revenue accounts minus expense accounts
      const revenueAccounts = await this.prisma.chartOfAccount.findMany({
        where: { tenantId, type: 'REVENUE', isActive: true },
      });
      const expenseAccounts = await this.prisma.chartOfAccount.findMany({
        where: { tenantId, type: 'EXPENSE', isActive: true },
      });

      let totalRevenue = 0;
      let totalExpenses = 0;

      for (const account of revenueAccounts) {
        const ledger = await this.generalLedgerService.getAccountLedger(
          tenantId, account.code, startDate, endDate
        );
        totalRevenue += Math.abs(ledger.closingBalance - ledger.openingBalance);
      }

      for (const account of expenseAccounts) {
        const ledger = await this.generalLedgerService.getAccountLedger(
          tenantId, account.code, startDate, endDate
        );
        totalExpenses += Math.abs(ledger.closingBalance - ledger.openingBalance);
      }

      return totalRevenue - totalExpenses;
    }

    private async getDepreciationExpense(tenantId: string, startDate: Date, endDate: Date): Promise<number> {
      // Get depreciation from expense account 5900
      const depreciationAccount = await this.prisma.chartOfAccount.findFirst({
        where: { tenantId, code: '5900' },
      });

      if (!depreciationAccount) return 0;

      const ledger = await this.generalLedgerService.getAccountLedger(
        tenantId, '5900', startDate, endDate
      );

      return Math.abs(ledger.closingBalance - ledger.openingBalance);
    }

    private async calculateReceivablesChange(tenantId: string, startDate: Date, endDate: Date): Promise<number> {
      // Change in Accounts Receivable (1100)
      const openingAR = await this.getAccountBalanceAsOf(tenantId, '1100', startDate);
      const closingAR = await this.getAccountBalanceAsOf(tenantId, '1100', endDate);

      return closingAR - openingAR; // Increase = cash used, Decrease = cash freed
    }

    private async calculatePayablesChange(tenantId: string, startDate: Date, endDate: Date): Promise<number> {
      // Change in Accounts Payable (2000)
      const openingAP = await this.getAccountBalanceAsOf(tenantId, '2000', startDate);
      const closingAP = await this.getAccountBalanceAsOf(tenantId, '2000', endDate);

      return closingAP - openingAP; // Increase = cash source, Decrease = cash used
    }

    private async getAssetPurchases(tenantId: string, startDate: Date, endDate: Date): Promise<number> {
      // Debits to Fixed Assets account (1500) represent purchases
      const entries = await this.generalLedgerService.getGeneralLedger({
        tenantId,
        startDate,
        endDate,
        accountCode: '1500',
      });

      return entries
        .filter(e => e.debitCents > 0)
        .reduce((sum, e) => sum + e.debitCents, 0);
    }

    private async getAssetSales(tenantId: string, startDate: Date, endDate: Date): Promise<number> {
      // Credits to Fixed Assets (disposals) - simplified
      const entries = await this.generalLedgerService.getGeneralLedger({
        tenantId,
        startDate,
        endDate,
        accountCode: '1500',
      });

      return entries
        .filter(e => e.creditCents > 0)
        .reduce((sum, e) => sum + e.creditCents, 0);
    }

    private async getLoanProceeds(tenantId: string, startDate: Date, endDate: Date): Promise<number> {
      // Credits to loan liability accounts indicate new borrowings
      // Using account 2500 for loans (if exists)
      const loanAccount = await this.prisma.chartOfAccount.findFirst({
        where: { tenantId, code: { startsWith: '25' }, type: 'LIABILITY' },
      });

      if (!loanAccount) return 0;

      const entries = await this.generalLedgerService.getGeneralLedger({
        tenantId,
        startDate,
        endDate,
        accountCode: loanAccount.code,
      });

      return entries
        .filter(e => e.creditCents > 0)
        .reduce((sum, e) => sum + e.creditCents, 0);
    }

    private async getLoanRepayments(tenantId: string, startDate: Date, endDate: Date): Promise<number> {
      // Debits to loan accounts indicate repayments
      const loanAccount = await this.prisma.chartOfAccount.findFirst({
        where: { tenantId, code: { startsWith: '25' }, type: 'LIABILITY' },
      });

      if (!loanAccount) return 0;

      const entries = await this.generalLedgerService.getGeneralLedger({
        tenantId,
        startDate,
        endDate,
        accountCode: loanAccount.code,
      });

      return entries
        .filter(e => e.debitCents > 0)
        .reduce((sum, e) => sum + e.debitCents, 0);
    }

    private async getOwnerContributions(tenantId: string, startDate: Date, endDate: Date): Promise<number> {
      // Credits to Owner's Equity (3000)
      const entries = await this.generalLedgerService.getGeneralLedger({
        tenantId,
        startDate,
        endDate,
        accountCode: '3000',
      });

      return entries
        .filter(e => e.creditCents > 0)
        .reduce((sum, e) => sum + e.creditCents, 0);
    }

    private async getOwnerDrawings(tenantId: string, startDate: Date, endDate: Date): Promise<number> {
      // Debits to Owner's Equity represent drawings
      const entries = await this.generalLedgerService.getGeneralLedger({
        tenantId,
        startDate,
        endDate,
        accountCode: '3000',
      });

      return entries
        .filter(e => e.debitCents > 0)
        .reduce((sum, e) => sum + e.debitCents, 0);
    }

    private async getCashBalance(tenantId: string, asOfDate: Date): Promise<number> {
      // Sum of all cash accounts (1000 Bank + 1200 Petty Cash)
      const bankBalance = await this.getAccountBalanceAsOf(tenantId, '1000', asOfDate);
      const pettyCashBalance = await this.getAccountBalanceAsOf(tenantId, '1200', asOfDate);

      return bankBalance + pettyCashBalance;
    }

    private async getAccountBalanceAsOf(tenantId: string, accountCode: string, asOfDate: Date): Promise<number> {
      // Use opening balance service if available, otherwise calculate from ledger
      const ledger = await this.generalLedgerService.getAccountLedger(
        tenantId,
        accountCode,
        new Date('1970-01-01'),
        asOfDate,
      );

      return ledger.closingBalance;
    }
  }
  ```

  ### 3. DTO Definition
  ```typescript
  // apps/api/src/database/dto/cash-flow.dto.ts
  import { IsDateString } from 'class-validator';
  import { ApiProperty } from '@nestjs/swagger';

  export class GetCashFlowStatementDto {
    @ApiProperty({ example: '2026-01-01' })
    @IsDateString()
    startDate: string;

    @ApiProperty({ example: '2026-01-31' })
    @IsDateString()
    endDate: string;
  }
  ```
</critical_patterns>

<context>
This task creates a Cash Flow Statement report using the indirect method.
The indirect method starts with net income and adjusts for non-cash items.

**Cash Flow Statement Structure:**
1. **Operating Activities** - Cash from day-to-day business
   - Start with Net Income
   - Add back: Depreciation (non-cash expense)
   - Adjust for: Receivables change, Payables change

2. **Investing Activities** - Cash for long-term assets
   - Asset purchases (outflow)
   - Asset sales (inflow)

3. **Financing Activities** - Cash from/to funders
   - Loan proceeds (inflow)
   - Loan repayments (outflow)
   - Owner contributions (inflow)
   - Owner drawings (outflow)

**Creche-Specific Considerations:**
- Most creches have simple cash flows (operating mainly)
- Few investing activities (occasional equipment)
- Financing usually limited to owner capital
</context>

<scope>
  <in_scope>
    - CashFlowService with generateCashFlowStatement
    - Operating activities calculation (indirect method)
    - Investing activities calculation
    - Financing activities calculation
    - Integration with GeneralLedgerService
    - DTOs for API layer
    - Unit tests for calculations
  </in_scope>
  <out_of_scope>
    - API endpoint (TASK-ACCT-034)
    - Frontend UI (TASK-ACCT-044)
    - PDF export (use existing report export)
    - Direct method cash flow (more complex)
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Build must pass
cd apps/api && pnpm run build

# 2. Run unit tests
pnpm test -- --testPathPattern="cash-flow" --runInBand

# 3. Lint check
pnpm run lint
```
</verification_commands>

<definition_of_done>
  - [ ] CashFlowService implemented with generateCashFlowStatement
  - [ ] Operating activities with net income and adjustments
  - [ ] Investing activities with asset purchases/sales
  - [ ] Financing activities with loans and owner transactions
  - [ ] Summary with opening/closing cash balances
  - [ ] Integration with GeneralLedgerService
  - [ ] DTOs defined for API layer
  - [ ] Unit tests for all calculations (90%+ coverage)
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

<anti_patterns>
  - **NEVER** mix cash and accrual amounts in calculations
  - **NEVER** double-count items between sections
  - **NEVER** forget to adjust net income for non-cash items
  - **NEVER** return negative cash balances without investigation
</anti_patterns>

</task_spec>
