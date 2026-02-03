'use client';

/**
 * TASK-ACCT-UI-003: Cash Flow Statement Page
 * Display cash flow statement with collapsible sections and comparative period toggle
 */

import { useState } from 'react';
import Link from 'next/link';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { TrendingUp, Printer, AlertCircle, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { GLDateRangePicker, type GLDateRange } from '@/components/accounting/gl-date-range-picker';
import { CashFlowStatementDisplay } from '@/components/accounting/cash-flow-statement';
import { CashFlowSummaryCards } from '@/components/accounting/cash-flow-summary-cards';
import { CashFlowBreakdownChart } from '@/components/accounting/cash-flow-chart';
import { useCashFlowStatement } from '@/hooks/use-cash-flow';

export default function CashFlowPage() {
  const [dateRange, setDateRange] = useState<GLDateRange>(() => ({
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
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cash Flow Statement</h1>
          <p className="text-muted-foreground">
            Track cash inflows and outflows by activity type
          </p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load cash flow statement: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header - hidden when printing */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cash Flow Statement</h1>
          <p className="text-muted-foreground">
            Track cash inflows and outflows by activity type
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/accounting/general-ledger">
            <Button variant="outline">
              <BookOpen className="h-4 w-4 mr-2" />
              General Ledger
            </Button>
          </Link>
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

      {/* Print header - only shown when printing */}
      <div className="hidden print:block print:mb-8">
        <h1 className="text-2xl font-bold">Cash Flow Statement</h1>
        <p className="text-sm text-muted-foreground">
          Period: {fromDate} to {toDate}
        </p>
      </div>

      {/* Filters - hidden when printing */}
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
              <label htmlFor="comparative" className="text-sm font-medium cursor-pointer">
                Include Prior Period Comparison
              </label>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="pt-6">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : statement ? (
        <CashFlowSummaryCards summary={statement.summary} />
      ) : null}

      {/* Cash Flow Breakdown Chart - hidden when printing */}
      {!isLoading && statement && (
        <div className="print:hidden">
          <CashFlowBreakdownChart
            operatingCents={statement.operatingActivities.netCashFromOperatingCents}
            investingCents={statement.investingActivities.netCashFromInvestingCents}
            financingCents={statement.financingActivities.netCashFromFinancingCents}
          />
        </div>
      )}

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
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12 text-muted-foreground">
              <p>No cash flow data available for the selected period.</p>
              <p className="text-sm mt-2">
                Try selecting a different date range or check that transactions have been recorded.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
