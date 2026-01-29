'use client';

/**
 * Report Metric Card Component
 * TASK-REPORTS-004: Reports Dashboard UI Components
 *
 * @module components/reports/report-metric-card
 * @description Card displaying a key metric with trend indicator.
 *
 * CRITICAL RULES:
 * - Trend arrows: increasing, decreasing, stable
 * - NO inline styles - use Tailwind
 * - Proper accessibility
 */

import { LucideIcon, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { TrendAnalysis } from '@/hooks/use-ai-insights';

interface ReportMetricCardProps {
  /** Metric title */
  title: string;
  /** Formatted value to display */
  value: string;
  /** Trend analysis from AI insights */
  trend?: TrendAnalysis;
  /** Icon to display */
  icon: LucideIcon;
  /** Optional custom color for the value */
  valueColor?: string;
  /** Optional description */
  description?: string;
  /** Whether the card is in loading state */
  isLoading?: boolean;
  /** Optional className for custom styling */
  className?: string;
}

/**
 * Get trend icon based on direction.
 */
function getTrendIcon(direction: string | undefined) {
  switch (direction) {
    case 'increasing':
      return TrendingUp;
    case 'decreasing':
      return TrendingDown;
    case 'stable':
    case 'volatile':
    default:
      return Minus;
  }
}

/**
 * Get trend color based on direction and context.
 * For expenses, increasing is bad (red), decreasing is good (green).
 * For income/profit, increasing is good (green), decreasing is bad (red).
 */
function getTrendColor(direction: string | undefined, isExpense = false): string {
  if (direction === 'increasing') {
    return isExpense ? 'text-red-600' : 'text-green-600';
  }
  if (direction === 'decreasing') {
    return isExpense ? 'text-green-600' : 'text-red-600';
  }
  return 'text-muted-foreground';
}

/**
 * Get trend arrow symbol.
 */
function getTrendArrow(direction: string | undefined): string {
  switch (direction) {
    case 'increasing':
      return '\u2197'; // North-East Arrow
    case 'decreasing':
      return '\u2198'; // South-East Arrow
    case 'stable':
      return '\u2192'; // Right Arrow
    case 'volatile':
      return '\u2194'; // Left-Right Arrow
    default:
      return '';
  }
}

/**
 * Loading skeleton for metric card.
 */
export function ReportMetricCardSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-4 rounded-full" />
      </CardHeader>
      <CardContent>
        <Skeleton className="h-8 w-32 mb-2" />
        <Skeleton className="h-3 w-20" />
      </CardContent>
    </Card>
  );
}

/**
 * Card displaying a key metric with trend indicator.
 *
 * @example
 * <ReportMetricCard
 *   title="Total Income"
 *   value={formatCurrency(data.summary.totalIncomeCents / 100)}
 *   trend={insights?.trends.find(t => t.metric === 'income')}
 *   icon={TrendingUp}
 *   valueColor="text-green-600"
 * />
 */
export function ReportMetricCard({
  title,
  value,
  trend,
  icon: Icon,
  valueColor,
  description,
  isLoading = false,
  className,
}: ReportMetricCardProps) {
  if (isLoading) {
    return <ReportMetricCardSkeleton />;
  }

  const TrendIcon = getTrendIcon(trend?.direction);
  const trendColor = getTrendColor(trend?.direction, title.toLowerCase().includes('expense'));
  const trendArrow = getTrendArrow(trend?.direction);

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      </CardHeader>
      <CardContent>
        <div className={cn('text-2xl font-bold', valueColor)}>{value}</div>
        {trend && (
          <div className={cn('flex items-center gap-1 text-xs mt-1', trendColor)}>
            <TrendIcon className="h-3 w-3" aria-hidden="true" />
            <span aria-label={`Trend: ${trend.direction}`}>
              {trendArrow} {Math.abs(trend.percentageChange).toFixed(1)}%
            </span>
            <span className="text-muted-foreground ml-1">{trend.timeframe}</span>
          </div>
        )}
        {description && !trend && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
