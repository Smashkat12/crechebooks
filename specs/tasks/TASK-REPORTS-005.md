<task_spec id="TASK-REPORTS-005" version="2.0">

<metadata>
  <title>Missing Report Types Implementation</title>
  <status>ready</status>
  <phase>reports-enhancement</phase>
  <layer>logic</layer>
  <sequence>805</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-REPORTS-FULL-COVERAGE</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-REPORTS-002</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>16 hours</estimated_effort>
  <last_updated>2026-01-29</last_updated>
</metadata>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<project_state>
  ## Current State

  **Problem:**
  The reports page supports 6 report types, but only 3 have full implementation:
  - ✅ Income Statement (service + component)
  - ✅ Aged Receivables (service + component)
  - ✅ VAT Report (component only, service partial)
  - ❌ Cash Flow (no service, no component)
  - ❌ Balance Sheet (service exists, no UI component)
  - ❌ Aged Payables (no service, no component)

  **Gap Analysis:**
  - Cash Flow: No service for calculating operating/investing/financing activities
  - Balance Sheet: Service exists but no frontend component
  - Aged Payables: No service or component (mirror of Aged Receivables for bills)
  - VAT Report: Export endpoint missing

  **Files to Create:**
  - `apps/api/src/database/services/cash-flow-report.service.ts`
  - `apps/api/src/database/services/aged-payables.service.ts`
  - `apps/web/src/components/reports/cash-flow.tsx`
  - `apps/web/src/components/reports/balance-sheet.tsx`
  - `apps/web/src/components/reports/aged-payables.tsx`
  - `apps/api/tests/database/services/cash-flow-report.service.spec.ts`
  - `apps/api/tests/database/services/aged-payables.service.spec.ts`

  **Files to Modify:**
  - `apps/api/src/database/database.module.ts` — ADD new services
  - `apps/api/src/database/services/index.ts` — EXPORT new services
  - `apps/web/src/components/reports/index.ts` — EXPORT new components
  - `apps/api/src/modules/reports/reports.service.ts` — INTEGRATE new services
</project_state>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Cash Flow Report Service (Indirect Method)
  ```typescript
  @Injectable()
  export class CashFlowReportService {
    async generateCashFlowStatement(
      tenantId: string,
      periodStart: Date,
      periodEnd: Date,
    ): Promise<CashFlowStatement> {
      // Operating Activities
      const netProfit = await this.getNetProfit(tenantId, periodStart, periodEnd);
      const nonCashAdjustments = await this.getNonCashAdjustments(tenantId, periodStart, periodEnd);
      const workingCapitalChanges = await this.getWorkingCapitalChanges(tenantId, periodStart, periodEnd);
      const operatingCashFlow = netProfit + nonCashAdjustments + workingCapitalChanges;

      // Investing Activities (future: equipment purchases)
      const investingCashFlow = 0; // Creches typically don't have investing activities

      // Financing Activities (future: loans)
      const financingCashFlow = 0;

      // Net Cash Flow
      const netCashFlow = operatingCashFlow + investingCashFlow + financingCashFlow;

      // Opening/Closing Balance
      const openingBalance = await this.getOpeningBalance(tenantId, periodStart);
      const closingBalance = openingBalance + netCashFlow;

      return {
        tenantId,
        period: { start: periodStart, end: periodEnd },
        operating: {
          netProfit,
          adjustments: nonCashAdjustments,
          workingCapital: workingCapitalChanges,
          total: operatingCashFlow,
        },
        investing: { total: investingCashFlow, items: [] },
        financing: { total: financingCashFlow, items: [] },
        netCashFlow,
        openingBalance,
        closingBalance,
        generatedAt: new Date(),
      };
    }

    private async getWorkingCapitalChanges(
      tenantId: string,
      periodStart: Date,
      periodEnd: Date,
    ): Promise<number> {
      // Change in Accounts Receivable
      const arChangePromise = this.getAccountsReceivableChange(tenantId, periodStart, periodEnd);
      // Change in Prepaid Expenses (unlikely for creches)
      // Change in Accounts Payable (if bills module exists)

      const [arChange] = await Promise.all([arChangePromise]);
      return -arChange; // Increase in AR = cash outflow
    }
  }
  ```

  ### 2. Aged Payables Service
  ```typescript
  @Injectable()
  export class AgedPayablesService {
    async generateAgedPayablesReport(
      tenantId: string,
      asOfDate: Date,
    ): Promise<AgedPayablesReport> {
      // For now, return empty structure since bills/suppliers aren't in scope
      // This is a placeholder for future implementation
      return {
        tenantId,
        asOfDate,
        aging: {
          current: { count: 0, totalCents: 0, suppliers: [] },
          thirtyDays: { count: 0, totalCents: 0, suppliers: [] },
          sixtyDays: { count: 0, totalCents: 0, suppliers: [] },
          ninetyDays: { count: 0, totalCents: 0, suppliers: [] },
          overNinety: { count: 0, totalCents: 0, suppliers: [] },
        },
        summary: {
          totalOutstanding: 0,
          totalSuppliers: 0,
          oldestBillDays: 0,
        },
        generatedAt: new Date(),
      };
    }
  }
  ```

  ### 3. Cash Flow Component
  ```typescript
  export function CashFlowReport({ data }: { data: CashFlowStatement }) {
    return (
      <div className="space-y-6">
        {/* Opening Balance */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Opening Cash Balance</span>
              <span className="text-lg font-semibold font-mono">
                {formatCurrency(data.openingBalance / 100)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Operating Activities */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Operating Activities
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <CashFlowLine label="Net Profit" amount={data.operating.netProfit} />
            <CashFlowLine label="Non-cash Adjustments" amount={data.operating.adjustments} />
            <CashFlowLine label="Working Capital Changes" amount={data.operating.workingCapital} />
            <Separator className="my-2" />
            <CashFlowLine label="Net Operating Cash Flow" amount={data.operating.total} bold />
          </CardContent>
        </Card>

        {/* Net Cash Flow */}
        <Card className={cn(
          "border-2",
          data.netCashFlow >= 0 ? "border-green-500" : "border-red-500"
        )}>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <span className="font-medium">Net Cash Flow</span>
              <span className={cn(
                "text-2xl font-bold font-mono",
                data.netCashFlow >= 0 ? "text-green-600" : "text-red-600"
              )}>
                {formatCurrency(data.netCashFlow / 100)}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Closing Balance */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Closing Cash Balance</span>
              <span className="text-xl font-bold font-mono">
                {formatCurrency(data.closingBalance / 100)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

  ### 4. Balance Sheet Component
  ```typescript
  export function BalanceSheetReport({ data }: { data: BalanceSheet }) {
    return (
      <div className="space-y-6">
        {/* Assets Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-green-700">Assets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-2">Current Assets</h4>
              {data.assets.current.map((asset) => (
                <AccountLine key={asset.accountCode} account={asset} />
              ))}
            </div>
            {data.assets.nonCurrent.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-2">Non-Current Assets</h4>
                {data.assets.nonCurrent.map((asset) => (
                  <AccountLine key={asset.accountCode} account={asset} />
                ))}
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-semibold text-green-700">
              <span>Total Assets</span>
              <span className="font-mono">{formatCurrency(data.assets.totalRands)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Liabilities Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-red-700">Liabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between font-semibold text-red-700">
              <span>Total Liabilities</span>
              <span className="font-mono">{formatCurrency(data.liabilities.totalRands)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Equity Section */}
        <Card>
          <CardHeader>
            <CardTitle className="text-blue-700">Equity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between font-semibold text-blue-700">
              <span>Total Equity</span>
              <span className="font-mono">{formatCurrency(data.equity.totalRands)}</span>
            </div>
          </CardContent>
        </Card>

        {/* Balance Check */}
        <Alert variant={data.isBalanced ? "default" : "destructive"}>
          {data.isBalanced ? (
            <>
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Balanced</AlertTitle>
              <AlertDescription>Assets = Liabilities + Equity</AlertDescription>
            </>
          ) : (
            <>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Out of Balance</AlertTitle>
              <AlertDescription>
                Discrepancy detected. Please review the accounts.
              </AlertDescription>
            </>
          )}
        </Alert>
      </div>
    );
  }
  ```
</critical_patterns>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<scope>
  <in_scope>
    - Cash Flow Report service (indirect method)
    - Cash Flow UI component
    - Balance Sheet UI component (service exists)
    - Aged Payables service (placeholder for future bills module)
    - Aged Payables UI component
    - Integration with ReportsService
    - Unit tests for new services
    - Export support for new report types
  </in_scope>

  <out_of_scope>
    - Bills/Supplier module (out of scope, Aged Payables returns empty)
    - Fixed assets tracking (Investing activities minimal)
    - Loan/Financing tracking
    - VAT Report export endpoint (separate task)
  </out_of_scope>
</scope>

<!-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ -->

<definition_of_done>
  - [ ] `CashFlowReportService` with `generateCashFlowStatement()` method
  - [ ] Cash Flow calculates operating activities from net profit
  - [ ] Cash Flow calculates working capital changes from AR
  - [ ] `AgedPayablesService` with placeholder implementation
  - [ ] `CashFlowReport` UI component with activity sections
  - [ ] `BalanceSheetReport` UI component with assets/liabilities/equity
  - [ ] `AgedPayablesReport` UI component (shows empty state when no bills)
  - [ ] Services exported from database module
  - [ ] Components exported from reports index
  - [ ] ReportsService integrates new services
  - [ ] Unit tests for CashFlowReportService
  - [ ] Unit tests for AgedPayablesService
  - [ ] Build and lint pass
</definition_of_done>

<anti_patterns>
  - **NEVER use floating-point for monetary calculations** — use Decimal.js
  - **NEVER skip tenant isolation** — always include tenantId
  - **NEVER hardcode account codes** — use constants
  - **NEVER return null for empty reports** — return structure with zeros
</anti_patterns>

</task_spec>
