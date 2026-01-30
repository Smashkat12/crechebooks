'use client';

/**
 * Report Dashboard Component
 * TASK-REPORTS-004: Reports Dashboard UI Components
 *
 * @module components/reports/report-dashboard
 * @description Main dashboard component displaying report data and AI insights.
 *
 * CRITICAL RULES:
 * - NO WORKAROUNDS - errors must propagate
 * - All amounts in cents - divide by 100 for display
 * - Responsive layout
 * - Loading skeletons for all sections
 */

import { TrendingUp, TrendingDown, DollarSign, Percent, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency, formatPercent } from '@/lib/utils/format';
import { ReportType } from '@crechebooks/types';
import type { ReportDataResponse } from '@/hooks/use-report-data';
import type { AIInsights } from '@/hooks/use-ai-insights';
import { ReportMetricCard, ReportMetricCardSkeleton } from './report-metric-card';
import { AIInsightsBanner, AIInsightsBannerSkeleton } from './ai-insights-banner';
import { AnomaliesCard } from './anomalies-card';
import { RecommendationsCard } from './recommendations-card';
import {
  IncomeExpenseTrendChart,
  ExpenseBreakdownChart,
  MonthlyComparisonChart,
  ProfitMarginChart,
  ChartSkeleton,
} from './report-charts';

interface ReportDashboardProps {
  /** Report type */
  type: ReportType;
  /** Report data from API */
  data: ReportDataResponse;
  /** AI-generated insights (null if not available) */
  insights: AIInsights | null;
  /** Whether insights are currently loading */
  insightsLoading: boolean;
  /** Optional className for custom styling */
  className?: string;
}

/**
 * Loading skeleton for the dashboard.
 */
export function ReportDashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* AI Insights Skeleton */}
      <AIInsightsBannerSkeleton />

      {/* Metrics Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <ReportMetricCardSkeleton />
        <ReportMetricCardSkeleton />
        <ReportMetricCardSkeleton />
        <ReportMetricCardSkeleton />
      </div>

      {/* Charts Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>

      {/* Additional Charts Skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartSkeleton />
        <ChartSkeleton />
      </div>

      {/* Table Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Data table for detailed breakdown.
 */
function ReportDataTable({ data, type }: { data: ReportDataResponse; type: ReportType }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="text-left py-3 px-4 font-medium">Section</th>
            <th className="text-left py-3 px-4 font-medium">Account</th>
            <th className="text-right py-3 px-4 font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.sections.map((section, sectionIndex) => (
            <>
              <tr key={`section-${sectionIndex}`} className="bg-muted/50">
                <td colSpan={2} className="py-3 px-4 font-semibold">
                  {section.title}
                </td>
                <td className="py-3 px-4 text-right font-semibold">
                  {formatCurrency(section.totalCents / 100)}
                </td>
              </tr>
              {section.breakdown.map((account, accountIndex) => (
                <tr key={`account-${sectionIndex}-${accountIndex}`} className="border-b">
                  <td className="py-2 px-4"></td>
                  <td className="py-2 px-4">
                    <span className="text-muted-foreground">{account.accountCode}</span>{' '}
                    {account.accountName}
                  </td>
                  <td className="py-2 px-4 text-right">
                    {formatCurrency(account.amountCents / 100)}
                  </td>
                </tr>
              ))}
            </>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-bold">
            <td colSpan={2} className="py-3 px-4">Net Profit</td>
            <td
              className={`py-3 px-4 text-right ${
                data.summary.netProfitCents >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {formatCurrency(data.summary.netProfitCents / 100)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/**
 * Main dashboard component displaying report data and AI insights.
 *
 * @example
 * <ReportDashboard
 *   type={selectedReport}
 *   data={reportData}
 *   insights={aiInsights}
 *   insightsLoading={insightsLoading}
 * />
 */
export function ReportDashboard({
  type,
  data,
  insights,
  insightsLoading,
  className,
}: ReportDashboardProps) {
  // Find relevant trends from insights
  const incomeTrend = insights?.trends.find(
    (t) => t.metric.toLowerCase().includes('income') || t.metric.toLowerCase().includes('revenue')
  );
  const expensesTrend = insights?.trends.find(
    (t) => t.metric.toLowerCase().includes('expense')
  );
  const profitTrend = insights?.trends.find(
    (t) => t.metric.toLowerCase().includes('profit')
  );
  const marginTrend = insights?.trends.find(
    (t) => t.metric.toLowerCase().includes('margin')
  );

  return (
    <div className={className}>
      <div className="space-y-6">
        {/* AI Insights Banner */}
        {insightsLoading ? (
          <AIInsightsBannerSkeleton />
        ) : insights ? (
          <AIInsightsBanner insights={insights} />
        ) : null}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <ReportMetricCard
            title="Total Income"
            value={formatCurrency(data.summary.totalIncomeCents / 100)}
            trend={incomeTrend}
            icon={TrendingUp}
            valueColor="text-green-600"
          />
          <ReportMetricCard
            title="Total Expenses"
            value={formatCurrency(data.summary.totalExpensesCents / 100)}
            trend={expensesTrend}
            icon={TrendingDown}
            valueColor="text-red-600"
          />
          <ReportMetricCard
            title="Net Profit"
            value={formatCurrency(data.summary.netProfitCents / 100)}
            trend={profitTrend}
            icon={DollarSign}
            valueColor={data.summary.netProfitCents >= 0 ? 'text-green-600' : 'text-red-600'}
          />
          <ReportMetricCard
            title="Profit Margin"
            value={formatPercent(data.summary.profitMarginPercent)}
            trend={marginTrend}
            icon={Percent}
            valueColor={data.summary.profitMarginPercent >= 0 ? 'text-green-600' : 'text-red-600'}
          />
        </div>

        {/* Charts Grid - Primary */}
        {data.chartData.monthlyTrend.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <IncomeExpenseTrendChart data={data.chartData.monthlyTrend} />
            {data.chartData.expenseBreakdown.length > 0 && (
              <ExpenseBreakdownChart data={data.chartData.expenseBreakdown} />
            )}
          </div>
        )}

        {/* Charts Grid - Secondary */}
        {(data.chartData.monthlyComparison.length > 0 || data.chartData.profitMargin.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {data.chartData.monthlyComparison.length > 0 && (
              <MonthlyComparisonChart data={data.chartData.monthlyComparison} />
            )}
            {data.chartData.profitMargin.length > 0 && (
              <ProfitMarginChart data={data.chartData.profitMargin} />
            )}
          </div>
        )}

        {/* Anomalies and Recommendations */}
        {insights && (insights.anomalies.length > 0 || insights.recommendations.length > 0) && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {insights.anomalies.length > 0 && (
              <AnomaliesCard anomalies={insights.anomalies} />
            )}
            {insights.recommendations.length > 0 && (
              <RecommendationsCard recommendations={insights.recommendations} />
            )}
          </div>
        )}

        {/* Detailed Data Table */}
        <Card>
          <CardHeader>
            <CardTitle>Detailed Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ReportDataTable data={data} type={type} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
