<task_spec id="TASK-ACCT-UI-003" version="2.0">

<metadata>
  <title>Cash Flow UI Pages</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>503</sequence>
  <implements>
    <requirement_ref>REQ-ACCT-CASHFLOW-UI-001</requirement_ref>
    <requirement_ref>REQ-ACCT-CASHFLOW-UI-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-ACCT-003</task_ref>
    <task_ref status="ready">TASK-ACCT-UI-001</task_ref>
    <task_ref status="ready">TASK-ACCT-UI-002</task_ref>
    <task_ref status="complete">TASK-WEB-006</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>10 hours</estimated_effort>
  <last_updated>2026-02-03</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/web/src/app/(dashboard)/accounting/cash-flow/page.tsx` (Cash Flow Statement)
  - `apps/web/src/app/(dashboard)/accounting/cash-flow/trends/page.tsx` (Cash Flow Trends)
  - `apps/web/src/components/accounting/cash-flow-statement.tsx` (Statement Layout)
  - `apps/web/src/components/accounting/cash-flow-section.tsx` (Collapsible Section)
  - `apps/web/src/components/accounting/cash-flow-chart.tsx` (Trend Chart)
  - `apps/web/src/components/accounting/cash-flow-summary-cards.tsx` (Summary Cards)
  - `apps/web/src/hooks/use-cash-flow.ts` (React Query Hooks)

  **Files to Modify:**
  - `apps/web/src/lib/api/endpoints.ts` (ADD cash-flow endpoints)
  - `apps/web/src/lib/api/query-keys.ts` (ADD cash-flow query keys)
  - `apps/web/src/components/layout/sidebar.tsx` (Add Cash Flow menu item)

  **Current Problem:**
  - No UI exists for viewing cash flow statements
  - Backend API is complete (CashFlowController at /cash-flow)
  - Tenants cannot visualize cash inflows and outflows
  - No trend analysis or forecasting views
  - No comparative period analysis

  **Backend API Reference (CashFlowController):**
  - `GET /cash-flow/statement` - Generate cash flow statement (fromDate, toDate, includeComparative)
  - `GET /cash-flow/trend` - Get cash flow trend (fromDate, toDate)
  - `GET /cash-flow/summary` - Get cash flow summary

  **Backend DTOs:**
  ```typescript
  interface OperatingActivitiesResponse {
    netIncomeCents: number;
    adjustments: {
      depreciation: number;
      receivablesChange: number;
      payablesChange: number;
      prepaidExpensesChange: number;
      accruedExpensesChange: number;
      otherAdjustments: number;
    };
    adjustmentDetails: CashFlowAdjustment[];
    totalAdjustmentsCents: number;
    netCashFromOperatingCents: number;
  }

  interface InvestingActivitiesResponse {
    assetPurchasesCents: number;
    assetSalesCents: number;
    equipmentPurchasesCents: number;
    investmentPurchasesCents: number;
    investmentSalesCents: number;
    netCashFromInvestingCents: number;
  }

  interface FinancingActivitiesResponse {
    loanProceedsCents: number;
    loanRepaymentsCents: number;
    ownerContributionsCents: number;
    ownerDrawingsCents: number;
    netCashFromFinancingCents: number;
  }

  interface CashFlowSummaryResponse {
    netCashChangeCents: number;
    openingCashBalanceCents: number;
    closingCashBalanceCents: number;
    cashReconciles: boolean;
  }

  interface CashFlowStatementResponse {
    period: { startDate: string; endDate: string };
    operatingActivities: OperatingActivitiesResponse;
    investingActivities: InvestingActivitiesResponse;
    financingActivities: FinancingActivitiesResponse;
    summary: CashFlowSummaryResponse;
    comparative?: { ... };
  }

  interface CashFlowTrendResponse {
    periods: Array<{
      period: string;
      operatingCents: number;
      investingCents: number;
      financingCents: number;
      netChangeCents: number;
      closingBalanceCents: number;
    }>;
  }
  ```

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm dev:web`, `pnpm test`, etc.

  ### 2. API Endpoints Pattern
  ```typescript
  // apps/web/src/lib/api/endpoints.ts - ADD this section
  cashFlow: {
    statement: '/cash-flow/statement',
    trend: '/cash-flow/trend',
    summary: '/cash-flow/summary',
  },
  ```

  ### 3. Query Keys Pattern
  ```typescript
  // apps/web/src/lib/api/query-keys.ts - ADD this section
  cashFlow: {
    all: ['cash-flow'] as const,
    statement: (params?: Record<string, unknown>) => [...queryKeys.cashFlow.all, 'statement', params] as const,
    trend: (params?: Record<string, unknown>) => [...queryKeys.cashFlow.all, 'trend', params] as const,
    summary: (params?: Record<string, unknown>) => [...queryKeys.cashFlow.all, 'summary', params] as const,
  },
  ```

  ### 4. React Query Hook Pattern
  ```typescript
  // apps/web/src/hooks/use-cash-flow.ts
  import { useQuery } from '@tanstack/react-query';
  import { AxiosError } from 'axios';
  import { apiClient, endpoints, queryKeys } from '@/lib/api';

  // Types matching backend DTOs
  export interface CashFlowAdjustment {
    name: string;
    amountCents: number;
    description?: string;
  }

  export interface OperatingActivities {
    netIncomeCents: number;
    adjustments: {
      depreciation: number;
      receivablesChange: number;
      payablesChange: number;
      prepaidExpensesChange: number;
      accruedExpensesChange: number;
      otherAdjustments: number;
    };
    adjustmentDetails: CashFlowAdjustment[];
    totalAdjustmentsCents: number;
    netCashFromOperatingCents: number;
  }

  export interface InvestingActivities {
    assetPurchasesCents: number;
    assetSalesCents: number;
    equipmentPurchasesCents: number;
    investmentPurchasesCents: number;
    investmentSalesCents: number;
    netCashFromInvestingCents: number;
  }

  export interface FinancingActivities {
    loanProceedsCents: number;
    loanRepaymentsCents: number;
    ownerContributionsCents: number;
    ownerDrawingsCents: number;
    netCashFromFinancingCents: number;
  }

  export interface CashFlowSummary {
    netCashChangeCents: number;
    openingCashBalanceCents: number;
    closingCashBalanceCents: number;
    cashReconciles: boolean;
  }

  export interface CashFlowStatement {
    period: { startDate: string; endDate: string };
    operatingActivities: OperatingActivities;
    investingActivities: InvestingActivities;
    financingActivities: FinancingActivities;
    summary: CashFlowSummary;
    comparative?: {
      period: { startDate: string; endDate: string };
      operatingActivities: OperatingActivities;
      investingActivities: InvestingActivities;
      financingActivities: FinancingActivities;
      summary: CashFlowSummary;
    };
  }

  export interface CashFlowTrendPeriod {
    period: string;
    operatingCents: number;
    investingCents: number;
    financingCents: number;
    netChangeCents: number;
    closingBalanceCents: number;
  }

  export interface CashFlowTrend {
    periods: CashFlowTrendPeriod[];
  }

  export interface CashFlowParams {
    fromDate: string;
    toDate: string;
    includeComparative?: boolean;
  }

  // Get cash flow statement
  export function useCashFlowStatement(params: CashFlowParams) {
    return useQuery<CashFlowStatement, AxiosError>({
      queryKey: queryKeys.cashFlow.statement(params),
      queryFn: async () => {
        const { data } = await apiClient.get<CashFlowStatement>(endpoints.cashFlow.statement, {
          params: {
            fromDate: params.fromDate,
            toDate: params.toDate,
            includeComparative: params.includeComparative,
          },
        });
        return data;
      },
      enabled: !!params.fromDate && !!params.toDate,
    });
  }

  // Get cash flow trend
  export function useCashFlowTrend(fromDate: string, toDate: string) {
    return useQuery<CashFlowTrend, AxiosError>({
      queryKey: queryKeys.cashFlow.trend({ fromDate, toDate }),
      queryFn: async () => {
        const { data } = await apiClient.get<CashFlowTrend>(endpoints.cashFlow.trend, {
          params: { fromDate, toDate },
        });
        return data;
      },
      enabled: !!fromDate && !!toDate,
    });
  }

  // Get cash flow summary
  export function useCashFlowSummary(fromDate: string, toDate: string) {
    return useQuery<CashFlowSummary, AxiosError>({
      queryKey: queryKeys.cashFlow.summary({ fromDate, toDate }),
      queryFn: async () => {
        const { data } = await apiClient.get<CashFlowSummary>(endpoints.cashFlow.summary, {
          params: { fromDate, toDate },
        });
        return data;
      },
      enabled: !!fromDate && !!toDate,
    });
  }
  ```

  ### 5. Cash Flow Statement Page Pattern
  ```typescript
  // apps/web/src/app/(dashboard)/accounting/cash-flow/page.tsx
  'use client';

  import { useState } from 'react';
  import Link from 'next/link';
  import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
  import { TrendingUp, ArrowUpDown, Printer, FileSpreadsheet } from 'lucide-react';
  import { Button } from '@/components/ui/button';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Checkbox } from '@/components/ui/checkbox';
  import { Skeleton } from '@/components/ui/skeleton';
  import { Badge } from '@/components/ui/badge';
  import { GLDateRangePicker } from '@/components/accounting/gl-date-range-picker';
  import { CashFlowStatementDisplay } from '@/components/accounting/cash-flow-statement';
  import { CashFlowSummaryCards } from '@/components/accounting/cash-flow-summary-cards';
  import { useCashFlowStatement } from '@/hooks/use-cash-flow';
  import { formatCentsToZAR } from '@/lib/utils/currency';

  export default function CashFlowPage() {
    const [dateRange, setDateRange] = useState(() => ({
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date()),
    }));
    const [includeComparative, setIncludeComparative] = useState(false);

    const fromDate = format(dateRange.from, 'yyyy-MM-dd');
    const toDate = format(dateRange.to, 'yyyy-MM-dd');

    const { data: statement, isLoading, error } = useCashFlowStatement({
      fromDate,
      toDate,
      includeComparative,
    });

    const handlePrint = () => {
      window.print();
    };

    if (error) {
      return (
        <div className="flex items-center justify-center h-64">
          <p className="text-destructive">Failed to load cash flow: {error.message}</p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between print:hidden">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Cash Flow Statement</h1>
            <p className="text-muted-foreground">
              Track cash inflows and outflows by activity type
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/accounting/cash-flow/trends">
              <Button variant="outline">
                <TrendingUp className="h-4 w-4 mr-2" />
                View Trends
              </Button>
            </Link>
            <Button variant="outline" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>
        </div>

        {/* Filters */}
        <Card className="print:hidden">
          <CardContent className="pt-6">
            <div className="flex flex-wrap items-center gap-4">
              <GLDateRangePicker value={dateRange} onChange={setDateRange} />
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="comparative"
                  checked={includeComparative}
                  onCheckedChange={(checked) => setIncludeComparative(checked === true)}
                />
                <label htmlFor="comparative" className="text-sm font-medium">
                  Include Prior Period Comparison
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        {statement && <CashFlowSummaryCards summary={statement.summary} />}

        {/* Cash Flow Statement */}
        {isLoading ? (
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <Skeleton className="h-8 w-64" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
                <Skeleton className="h-40 w-full" />
              </div>
            </CardContent>
          </Card>
        ) : statement ? (
          <CashFlowStatementDisplay
            statement={statement}
            showComparative={includeComparative}
          />
        ) : null}
      </div>
    );
  }
  ```

  ### 6. Cash Flow Statement Component Pattern
  ```typescript
  // apps/web/src/components/accounting/cash-flow-statement.tsx
  'use client';

  import { ChevronDown, ChevronRight } from 'lucide-react';
  import { useState } from 'react';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Badge } from '@/components/ui/badge';
  import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
  import { formatCentsToZAR } from '@/lib/utils/currency';
  import type { CashFlowStatement, OperatingActivities, InvestingActivities, FinancingActivities } from '@/hooks/use-cash-flow';

  interface CashFlowStatementDisplayProps {
    statement: CashFlowStatement;
    showComparative?: boolean;
  }

  interface LineItemProps {
    label: string;
    current: number;
    comparative?: number;
    indent?: boolean;
    bold?: boolean;
  }

  function LineItem({ label, current, comparative, indent = false, bold = false }: LineItemProps) {
    const textClass = bold ? 'font-semibold' : 'text-sm';
    const paddingClass = indent ? 'pl-6' : '';

    return (
      <div className={`flex items-center py-2 border-b border-muted ${paddingClass}`}>
        <span className={`flex-1 ${textClass}`}>{label}</span>
        <span className={`w-32 text-right font-mono ${textClass} ${current < 0 ? 'text-red-600' : ''}`}>
          {formatCentsToZAR(current)}
        </span>
        {comparative !== undefined && (
          <span className={`w-32 text-right font-mono ${textClass} text-muted-foreground ${comparative < 0 ? 'text-red-400' : ''}`}>
            {formatCentsToZAR(comparative)}
          </span>
        )}
      </div>
    );
  }

  function OperatingSection({ data, comparative }: { data: OperatingActivities; comparative?: OperatingActivities }) {
    const [isOpen, setIsOpen] = useState(true);

    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between py-3 px-4 bg-muted/50 hover:bg-muted cursor-pointer">
            <div className="flex items-center gap-2">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-semibold">Operating Activities</span>
            </div>
            <span className={`font-mono font-semibold ${data.netCashFromOperatingCents < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCentsToZAR(data.netCashFromOperatingCents)}
            </span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4">
            <LineItem label="Net Income" current={data.netIncomeCents} comparative={comparative?.netIncomeCents} />
            <div className="py-2 text-sm font-medium text-muted-foreground">Adjustments:</div>
            <LineItem label="Depreciation & Amortization" current={data.adjustments.depreciation} comparative={comparative?.adjustments.depreciation} indent />
            <LineItem label="Change in Accounts Receivable" current={data.adjustments.receivablesChange} comparative={comparative?.adjustments.receivablesChange} indent />
            <LineItem label="Change in Accounts Payable" current={data.adjustments.payablesChange} comparative={comparative?.adjustments.payablesChange} indent />
            <LineItem label="Change in Prepaid Expenses" current={data.adjustments.prepaidExpensesChange} comparative={comparative?.adjustments.prepaidExpensesChange} indent />
            <LineItem label="Change in Accrued Expenses" current={data.adjustments.accruedExpensesChange} comparative={comparative?.adjustments.accruedExpensesChange} indent />
            <LineItem label="Other Adjustments" current={data.adjustments.otherAdjustments} comparative={comparative?.adjustments.otherAdjustments} indent />
            <LineItem label="Total Adjustments" current={data.totalAdjustmentsCents} comparative={comparative?.totalAdjustmentsCents} bold />
            <LineItem label="Net Cash from Operating Activities" current={data.netCashFromOperatingCents} comparative={comparative?.netCashFromOperatingCents} bold />
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  function InvestingSection({ data, comparative }: { data: InvestingActivities; comparative?: InvestingActivities }) {
    const [isOpen, setIsOpen] = useState(true);

    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between py-3 px-4 bg-muted/50 hover:bg-muted cursor-pointer">
            <div className="flex items-center gap-2">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-semibold">Investing Activities</span>
            </div>
            <span className={`font-mono font-semibold ${data.netCashFromInvestingCents < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCentsToZAR(data.netCashFromInvestingCents)}
            </span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4">
            <LineItem label="Asset Purchases" current={-data.assetPurchasesCents} comparative={comparative && -comparative.assetPurchasesCents} indent />
            <LineItem label="Asset Sales" current={data.assetSalesCents} comparative={comparative?.assetSalesCents} indent />
            <LineItem label="Equipment Purchases" current={-data.equipmentPurchasesCents} comparative={comparative && -comparative.equipmentPurchasesCents} indent />
            <LineItem label="Investment Purchases" current={-data.investmentPurchasesCents} comparative={comparative && -comparative.investmentPurchasesCents} indent />
            <LineItem label="Investment Sales" current={data.investmentSalesCents} comparative={comparative?.investmentSalesCents} indent />
            <LineItem label="Net Cash from Investing Activities" current={data.netCashFromInvestingCents} comparative={comparative?.netCashFromInvestingCents} bold />
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  function FinancingSection({ data, comparative }: { data: FinancingActivities; comparative?: FinancingActivities }) {
    const [isOpen, setIsOpen] = useState(true);

    return (
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="w-full">
          <div className="flex items-center justify-between py-3 px-4 bg-muted/50 hover:bg-muted cursor-pointer">
            <div className="flex items-center gap-2">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <span className="font-semibold">Financing Activities</span>
            </div>
            <span className={`font-mono font-semibold ${data.netCashFromFinancingCents < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {formatCentsToZAR(data.netCashFromFinancingCents)}
            </span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-4">
            <LineItem label="Loan Proceeds" current={data.loanProceedsCents} comparative={comparative?.loanProceedsCents} indent />
            <LineItem label="Loan Repayments" current={-data.loanRepaymentsCents} comparative={comparative && -comparative.loanRepaymentsCents} indent />
            <LineItem label="Owner Contributions" current={data.ownerContributionsCents} comparative={comparative?.ownerContributionsCents} indent />
            <LineItem label="Owner Drawings" current={-data.ownerDrawingsCents} comparative={comparative && -comparative.ownerDrawingsCents} indent />
            <LineItem label="Net Cash from Financing Activities" current={data.netCashFromFinancingCents} comparative={comparative?.netCashFromFinancingCents} bold />
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  export function CashFlowStatementDisplay({ statement, showComparative }: CashFlowStatementDisplayProps) {
    const comparative = showComparative ? statement.comparative : undefined;

    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              Cash Flow Statement
              <span className="text-sm font-normal text-muted-foreground ml-2">
                {statement.period.startDate} to {statement.period.endDate}
              </span>
            </CardTitle>
            <Badge variant={statement.summary.cashReconciles ? 'default' : 'destructive'}>
              {statement.summary.cashReconciles ? 'Reconciled' : 'Not Reconciled'}
            </Badge>
          </div>
          {showComparative && (
            <div className="flex justify-end gap-4 text-sm text-muted-foreground">
              <span className="w-32 text-right">Current</span>
              <span className="w-32 text-right">Prior Period</span>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <OperatingSection data={statement.operatingActivities} comparative={comparative?.operatingActivities} />
          <InvestingSection data={statement.investingActivities} comparative={comparative?.investingActivities} />
          <FinancingSection data={statement.financingActivities} comparative={comparative?.financingActivities} />

          {/* Summary */}
          <div className="border-t-2 pt-4 space-y-2">
            <LineItem
              label="Net Change in Cash"
              current={statement.summary.netCashChangeCents}
              comparative={comparative?.summary.netCashChangeCents}
              bold
            />
            <LineItem
              label="Opening Cash Balance"
              current={statement.summary.openingCashBalanceCents}
              comparative={comparative?.summary.openingCashBalanceCents}
            />
            <LineItem
              label="Closing Cash Balance"
              current={statement.summary.closingCashBalanceCents}
              comparative={comparative?.summary.closingCashBalanceCents}
              bold
            />
          </div>
        </CardContent>
      </Card>
    );
  }
  ```

  ### 7. Cash Flow Trend Chart Pattern
  ```typescript
  // apps/web/src/components/accounting/cash-flow-chart.tsx
  'use client';

  import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { formatCentsToZAR } from '@/lib/utils/currency';
  import type { CashFlowTrendPeriod } from '@/hooks/use-cash-flow';

  interface CashFlowChartProps {
    data: CashFlowTrendPeriod[];
  }

  export function CashFlowChart({ data }: CashFlowChartProps) {
    const chartData = data.map((period) => ({
      period: period.period,
      Operating: period.operatingCents / 100,
      Investing: period.investingCents / 100,
      Financing: period.financingCents / 100,
      'Net Change': period.netChangeCents / 100,
      'Cash Balance': period.closingBalanceCents / 100,
    }));

    return (
      <Card>
        <CardHeader>
          <CardTitle>Cash Flow Trend</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={400}>
            <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis tickFormatter={(value) => `R${(value / 1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value: number) => formatCentsToZAR(value * 100)}
                labelFormatter={(label) => `Period: ${label}`}
              />
              <Legend />
              <Area type="monotone" dataKey="Operating" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} />
              <Area type="monotone" dataKey="Investing" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
              <Area type="monotone" dataKey="Financing" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.6} />
              <Area type="monotone" dataKey="Cash Balance" stroke="#f97316" fill="none" strokeWidth={2} strokeDasharray="5 5" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    );
  }
  ```

  ### 8. Summary Cards Pattern
  ```typescript
  // apps/web/src/components/accounting/cash-flow-summary-cards.tsx
  'use client';

  import { ArrowUpRight, ArrowDownRight, Wallet, Activity } from 'lucide-react';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { formatCentsToZAR } from '@/lib/utils/currency';
  import type { CashFlowSummary } from '@/hooks/use-cash-flow';

  interface CashFlowSummaryCardsProps {
    summary: CashFlowSummary;
  }

  export function CashFlowSummaryCards({ summary }: CashFlowSummaryCardsProps) {
    const isPositiveChange = summary.netCashChangeCents >= 0;

    return (
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Opening Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {formatCentsToZAR(summary.openingCashBalanceCents)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Change</CardTitle>
            {isPositiveChange ? (
              <ArrowUpRight className="h-4 w-4 text-green-600" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${isPositiveChange ? 'text-green-600' : 'text-red-600'}`}>
              {isPositiveChange ? '+' : ''}{formatCentsToZAR(summary.netCashChangeCents)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Closing Balance</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {formatCentsToZAR(summary.closingCashBalanceCents)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${summary.cashReconciles ? 'text-green-600' : 'text-red-600'}`}>
              {summary.cashReconciles ? 'Reconciled' : 'Unreconciled'}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

  ### 9. Test Commands
  ```bash
  pnpm dev:web             # Must start without errors
  pnpm build               # Must have 0 errors
  pnpm lint                # Must have 0 errors/warnings
  ```
</critical_patterns>

<context>
This task creates the Cash Flow Statement UI for CrecheBooks.

**Business Context:**
1. Cash flow statement shows how cash moves through the business
2. Three main sections: Operating, Investing, Financing activities
3. Small creches primarily have operating activities (tuition, salaries)
4. Comparative analysis helps track improvement over time
5. Trend visualization helps predict cash needs

**Cash Flow Categories for Creches:**
- **Operating**: Tuition fees received, salary payments, utility payments
- **Investing**: Equipment purchases (playground, furniture), rarely used
- **Financing**: Owner capital contributions, loan payments

**South African Context:**
- Currency: South African Rand (ZAR)
- Tax year runs March to February
- Month-end reporting is common practice
</context>

<scope>
  <in_scope>
    - Cash flow statement page with collapsible sections
    - Operating, Investing, Financing activity sections
    - Summary cards (opening, closing, net change)
    - Comparative period toggle
    - Cash flow trend page with chart
    - Print-friendly layout
    - Date range picker
    - Reconciliation status indicator
  </in_scope>
  <out_of_scope>
    - Cash flow forecasting (future feature)
    - Budget vs actual comparison
    - Drill-down to source transactions
    - PDF export (use browser print)
    - Custom activity categories
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Add endpoints and query keys
# Edit apps/web/src/lib/api/endpoints.ts
# Edit apps/web/src/lib/api/query-keys.ts

# 2. Create hooks
# Create apps/web/src/hooks/use-cash-flow.ts

# 3. Create components
# Create apps/web/src/components/accounting/cash-flow-statement.tsx
# Create apps/web/src/components/accounting/cash-flow-chart.tsx
# Create apps/web/src/components/accounting/cash-flow-summary-cards.tsx

# 4. Create pages
# Create apps/web/src/app/(dashboard)/accounting/cash-flow/page.tsx
# Create apps/web/src/app/(dashboard)/accounting/cash-flow/trends/page.tsx

# 5. Verify
pnpm build               # Must show 0 errors
pnpm lint                # Must show 0 errors/warnings
pnpm dev:web             # Must start successfully
```
</verification_commands>

<definition_of_done>
  <constraints>
    - All monetary values displayed in ZAR format (R 1,234.56)
    - Negative values displayed in red
    - Positive values displayed in green (where contextually appropriate)
    - Collapsible sections for each activity type
    - Print-friendly layout (hide navigation when printing)
    - Comparative columns aligned properly
    - Chart uses consistent color scheme
    - Loading states during API calls
    - Error states with clear messages
  </constraints>

  <verification>
    - pnpm build: 0 errors
    - pnpm lint: 0 errors, 0 warnings
    - pnpm dev:web: Starts successfully
    - Page: /accounting/cash-flow loads statement
    - Page: /accounting/cash-flow/trends loads chart
    - Toggle: Comparative toggle adds prior period column
    - Display: Operating activities section expands/collapses
    - Display: Investing activities section expands/collapses
    - Display: Financing activities section expands/collapses
    - Display: Summary cards show correct values
    - Print: Statement prints cleanly without navigation
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Display amounts in cents (always convert to Rands for display)
  - Mix positive/negative conventions (outflows should be negative)
  - Skip loading states during API calls
  - Hardcode date formats (use date-fns)
  - Forget to handle empty states (no data for period)
  - Use charts without proper axis labels
</anti_patterns>

</task_spec>
