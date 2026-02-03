'use client';

/**
 * TASK-ACCT-UI-003: Cash Flow Trends Page
 * Display cash flow trend charts and historical analysis
 */

import { useState } from 'react';
import Link from 'next/link';
import { format, subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { FileText, AlertCircle, ArrowUpRight, ArrowDownRight, TrendingUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CashFlowChart } from '@/components/accounting/cash-flow-chart';
import { useCashFlowTrend } from '@/hooks/use-cash-flow';

type PeriodRange = '3months' | '6months' | '12months';

/**
 * Format amount in ZAR (South African Rand)
 */
function formatZAR(cents: number): string {
  const rands = cents / 100;
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rands);
}

function getDateRange(periodRange: PeriodRange): { fromDate: string; toDate: string } {
  const now = new Date();
  const to = endOfMonth(now);

  let from: Date;
  switch (periodRange) {
    case '3months':
      from = startOfMonth(subMonths(now, 2));
      break;
    case '6months':
      from = startOfMonth(subMonths(now, 5));
      break;
    case '12months':
      from = startOfMonth(subMonths(now, 11));
      break;
    default:
      from = startOfMonth(subMonths(now, 5));
  }

  return {
    fromDate: format(from, 'yyyy-MM-dd'),
    toDate: format(to, 'yyyy-MM-dd'),
  };
}

export default function CashFlowTrendsPage() {
  const [periodRange, setPeriodRange] = useState<PeriodRange>('6months');

  const { fromDate, toDate } = getDateRange(periodRange);
  const { data: trend, isLoading, error } = useCashFlowTrend(fromDate, toDate);

  // Calculate summary statistics from trend data
  const stats = trend?.periods.length
    ? {
        totalOperating: trend.periods.reduce((sum, p) => sum + p.operatingCents, 0),
        totalInvesting: trend.periods.reduce((sum, p) => sum + p.investingCents, 0),
        totalFinancing: trend.periods.reduce((sum, p) => sum + p.financingCents, 0),
        totalNetChange: trend.periods.reduce((sum, p) => sum + p.netChangeCents, 0),
        avgMonthlyChange:
          trend.periods.reduce((sum, p) => sum + p.netChangeCents, 0) / trend.periods.length,
        latestBalance: trend.periods[trend.periods.length - 1]?.closingBalanceCents ?? 0,
        firstBalance: trend.periods[0]?.closingBalanceCents ?? 0,
      }
    : null;

  const balanceChange = stats ? stats.latestBalance - stats.firstBalance : 0;
  const balanceChangePercent = stats?.firstBalance
    ? ((balanceChange / Math.abs(stats.firstBalance)) * 100).toFixed(1)
    : '0';

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cash Flow Trends</h1>
          <p className="text-muted-foreground">
            Analyze cash flow patterns over time
          </p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load cash flow trends: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Cash Flow Trends</h1>
          <p className="text-muted-foreground">
            Analyze cash flow patterns over time
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={periodRange} onValueChange={(v) => setPeriodRange(v as PeriodRange)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="3months">Last 3 Months</SelectItem>
              <SelectItem value="6months">Last 6 Months</SelectItem>
              <SelectItem value="12months">Last 12 Months</SelectItem>
            </SelectContent>
          </Select>
          <Link href="/accounting/cash-flow">
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Statement
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Stats */}
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
      ) : stats ? (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Operating</CardTitle>
              <TrendingUp className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold font-mono tabular-nums ${
                  stats.totalOperating >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formatZAR(stats.totalOperating)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                From operating activities
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Investing</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold font-mono tabular-nums ${
                  stats.totalInvesting >= 0 ? '' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formatZAR(stats.totalInvesting)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                From investing activities
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Financing</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold font-mono tabular-nums ${
                  stats.totalFinancing >= 0 ? '' : 'text-red-600 dark:text-red-400'
                }`}
              >
                {formatZAR(stats.totalFinancing)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                From financing activities
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Balance Change</CardTitle>
              {balanceChange >= 0 ? (
                <ArrowUpRight className="h-4 w-4 text-green-600" />
              ) : (
                <ArrowDownRight className="h-4 w-4 text-red-600" />
              )}
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold font-mono tabular-nums ${
                  balanceChange >= 0
                    ? 'text-green-600 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {balanceChange >= 0 ? '+' : ''}
                {balanceChangePercent}%
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Over the selected period
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Trend Chart */}
      {isLoading ? (
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-64 mt-2" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[400px] w-full" />
          </CardContent>
        </Card>
      ) : trend?.periods.length ? (
        <CashFlowChart data={trend.periods} />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center py-12 text-muted-foreground">
              <p>No trend data available for the selected period.</p>
              <p className="text-sm mt-2">
                Try selecting a different date range or check that transactions have been recorded.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Monthly Summary Table */}
      {!isLoading && trend?.periods.length ? (
        <Card>
          <CardHeader>
            <CardTitle>Monthly Summary</CardTitle>
            <CardDescription>Detailed breakdown by period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium">Period</th>
                    <th className="text-right py-3 px-4 font-medium">Operating</th>
                    <th className="text-right py-3 px-4 font-medium">Investing</th>
                    <th className="text-right py-3 px-4 font-medium">Financing</th>
                    <th className="text-right py-3 px-4 font-medium">Net Change</th>
                    <th className="text-right py-3 px-4 font-medium">Closing Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {trend.periods.map((period, index) => (
                    <tr key={period.period} className={index % 2 === 0 ? 'bg-muted/30' : ''}>
                      <td className="py-3 px-4 font-medium">{period.period}</td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          period.operatingCents < 0 ? 'text-red-600' : ''
                        }`}
                      >
                        {formatZAR(period.operatingCents)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          period.investingCents < 0 ? 'text-red-600' : ''
                        }`}
                      >
                        {formatZAR(period.investingCents)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          period.financingCents < 0 ? 'text-red-600' : ''
                        }`}
                      >
                        {formatZAR(period.financingCents)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums font-medium ${
                          period.netChangeCents >= 0
                            ? 'text-green-600 dark:text-green-400'
                            : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {period.netChangeCents >= 0 ? '+' : ''}
                        {formatZAR(period.netChangeCents)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {formatZAR(period.closingBalanceCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {stats && (
                  <tfoot>
                    <tr className="border-t-2 font-semibold">
                      <td className="py-3 px-4">Total</td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          stats.totalOperating < 0 ? 'text-red-600' : ''
                        }`}
                      >
                        {formatZAR(stats.totalOperating)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          stats.totalInvesting < 0 ? 'text-red-600' : ''
                        }`}
                      >
                        {formatZAR(stats.totalInvesting)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          stats.totalFinancing < 0 ? 'text-red-600' : ''
                        }`}
                      >
                        {formatZAR(stats.totalFinancing)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono tabular-nums ${
                          stats.totalNetChange >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {stats.totalNetChange >= 0 ? '+' : ''}
                        {formatZAR(stats.totalNetChange)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono tabular-nums">
                        {formatZAR(stats.latestBalance)}
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
