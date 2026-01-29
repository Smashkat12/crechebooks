'use client';

/**
 * Report Charts Component
 * TASK-REPORTS-004: Reports Dashboard UI Components
 *
 * @module components/reports/report-charts
 * @description Chart wrapper components for report dashboard.
 *
 * CRITICAL RULES:
 * - Use existing chart components (LineChart, PieChart, BarChart, AreaChart)
 * - All amounts in cents - divide by 100 for display
 * - Proper formatting with formatCurrency
 */

import { ChartContainer } from '@/components/charts/chart-container';
import { LineChart } from '@/components/charts/line-chart';
import { PieChart } from '@/components/charts/pie-chart';
import { BarChart } from '@/components/charts/bar-chart';
import { AreaChart } from '@/components/charts/area-chart';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/format';
import type {
  MonthlyTrendPoint,
  CategoryBreakdown,
  ComparisonPoint,
  ProfitMarginPoint,
} from '@/hooks/use-report-data';

/**
 * Format currency for chart axis (compact format).
 */
function formatCompactCurrency(value: number): string {
  if (Math.abs(value) >= 1000000) {
    return `R${(value / 1000000).toFixed(1)}M`;
  }
  if (Math.abs(value) >= 1000) {
    return `R${(value / 1000).toFixed(0)}K`;
  }
  return formatCurrency(value);
}

/**
 * Loading skeleton for chart.
 */
export function ChartSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-2">
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[350px] w-full" />
      </CardContent>
    </Card>
  );
}

interface IncomeExpenseTrendChartProps {
  /** Monthly trend data */
  data: MonthlyTrendPoint[];
  /** Optional className */
  className?: string;
}

/**
 * Line chart showing income vs expenses trend over time.
 */
export function IncomeExpenseTrendChart({ data, className }: IncomeExpenseTrendChartProps) {
  // Transform data: convert cents to rands
  const chartData = data.map((point) => ({
    name: point.month,
    income: point.income / 100,
    expenses: point.expenses / 100,
  }));

  return (
    <ChartContainer title="Income vs Expenses Trend" className={className}>
      <LineChart
        data={chartData}
        lines={[
          { dataKey: 'income', name: 'Income', color: '#10b981' },
          { dataKey: 'expenses', name: 'Expenses', color: '#ef4444' },
        ]}
        xAxisKey="name"
        formatValue={formatCompactCurrency}
        formatTooltip={(v) => formatCurrency(v)}
        height={350}
      />
    </ChartContainer>
  );
}

interface ExpenseBreakdownChartProps {
  /** Category breakdown data */
  data: CategoryBreakdown[];
  /** Optional className */
  className?: string;
}

/**
 * Pie chart showing expense breakdown by category.
 */
export function ExpenseBreakdownChart({ data, className }: ExpenseBreakdownChartProps) {
  // Transform data: convert cents to rands
  const chartData = data.map((item) => ({
    name: item.category,
    value: item.amount / 100,
  }));

  return (
    <ChartContainer title="Expense Breakdown" className={className}>
      <PieChart
        data={chartData}
        formatValue={(v) => formatCurrency(v)}
        formatTooltip={(v) => formatCurrency(v)}
        height={350}
        innerRadius={60}
        outerRadius={100}
        showLabels
        showPercentages
      />
    </ChartContainer>
  );
}

interface MonthlyComparisonChartProps {
  /** Comparison data */
  data: ComparisonPoint[];
  /** Optional className */
  className?: string;
}

/**
 * Bar chart showing month-over-month comparison.
 */
export function MonthlyComparisonChart({ data, className }: MonthlyComparisonChartProps) {
  // Transform data: convert cents to rands
  const chartData = data.map((point) => ({
    name: point.month,
    current: point.current / 100,
    previous: point.previous / 100,
  }));

  return (
    <ChartContainer title="Month-over-Month Comparison" className={className}>
      <BarChart
        data={chartData}
        bars={[
          { dataKey: 'previous', name: 'Previous Period', color: '#94a3b8' },
          { dataKey: 'current', name: 'Current Period', color: '#3b82f6' },
        ]}
        xAxisKey="name"
        formatValue={formatCompactCurrency}
        formatTooltip={(v) => formatCurrency(v)}
        height={350}
      />
    </ChartContainer>
  );
}

interface ProfitMarginChartProps {
  /** Profit margin data */
  data: ProfitMarginPoint[];
  /** Optional className */
  className?: string;
}

/**
 * Area chart showing profit margin trend.
 */
export function ProfitMarginChart({ data, className }: ProfitMarginChartProps) {
  // Transform data: convert cents to rands for netProfit
  const chartData = data.map((point) => ({
    name: point.month,
    netProfit: point.netProfit / 100,
    marginPercent: point.marginPercent,
  }));

  return (
    <ChartContainer title="Profit Margin Trend" className={className}>
      <AreaChart
        data={chartData}
        areas={[
          { dataKey: 'marginPercent', name: 'Margin %', color: '#10b981' },
        ]}
        xAxisKey="name"
        formatValue={(v) => `${v.toFixed(1)}%`}
        formatTooltip={(v) => `${v.toFixed(1)}%`}
        height={350}
      />
    </ChartContainer>
  );
}

interface CashFlowChartProps {
  /** Monthly trend data (using income/expenses as inflow/outflow) */
  data: MonthlyTrendPoint[];
  /** Optional className */
  className?: string;
}

/**
 * Stacked bar chart showing cash flow (inflows vs outflows).
 */
export function CashFlowChart({ data, className }: CashFlowChartProps) {
  // Transform data: convert cents to rands
  const chartData = data.map((point) => ({
    name: point.month,
    inflows: point.income / 100,
    outflows: point.expenses / 100,
    netCashFlow: (point.income - point.expenses) / 100,
  }));

  return (
    <ChartContainer title="Cash Flow Analysis" className={className}>
      <BarChart
        data={chartData}
        bars={[
          { dataKey: 'inflows', name: 'Cash Inflows', color: '#10b981' },
          { dataKey: 'outflows', name: 'Cash Outflows', color: '#ef4444' },
        ]}
        xAxisKey="name"
        formatValue={formatCompactCurrency}
        formatTooltip={(v) => formatCurrency(v)}
        height={350}
      />
    </ChartContainer>
  );
}
