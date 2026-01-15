'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type WidgetSkeletonType = 'summary' | 'list' | 'chart' | 'table' | 'metric' | 'status';

interface DashboardWidgetSkeletonProps {
  /** Type of skeleton to display */
  type: WidgetSkeletonType;
  /** Additional CSS classes */
  className?: string;
  /** Number of items for list type */
  listItems?: number;
  /** Height for chart/custom content */
  height?: string;
}

/**
 * Dashboard widget skeleton component for loading states.
 * Provides different skeleton layouts based on widget type.
 */
export function DashboardWidgetSkeleton({
  type,
  className,
  listItems = 5,
  height = '300px',
}: DashboardWidgetSkeletonProps) {
  switch (type) {
    case 'summary':
      return <SummaryWidgetSkeleton className={className} />;
    case 'list':
      return <ListWidgetSkeleton className={className} items={listItems} />;
    case 'chart':
      return <ChartWidgetSkeleton className={className} height={height} />;
    case 'table':
      return <TableWidgetSkeleton className={className} rows={listItems} />;
    case 'metric':
      return <MetricWidgetSkeleton className={className} />;
    case 'status':
      return <StatusWidgetSkeleton className={className} />;
    default:
      return <GenericWidgetSkeleton className={className} height={height} />;
  }
}

/**
 * Summary card skeleton - for stat cards with icon and value
 */
function SummaryWidgetSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('', className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
          </div>
          <Skeleton className="h-12 w-12 rounded-full" />
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-4 w-20" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * List widget skeleton - for widgets displaying lists of items
 */
function ListWidgetSkeleton({ className, items }: { className?: string; items: number }) {
  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-4 w-48" />
      </CardHeader>
      <CardContent className="space-y-3">
        {Array.from({ length: items }).map((_, i) => (
          <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 rounded-full" />
              <div className="space-y-1">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <Skeleton className="h-5 w-20" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Chart widget skeleton - for graph/chart widgets
 */
function ChartWidgetSkeleton({ className, height }: { className?: string; height: string }) {
  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="relative" style={{ height }}>
          {/* Y-axis labels */}
          <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between py-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-3 w-12" />
            ))}
          </div>
          {/* Chart bars */}
          <div className="ml-16 h-full flex items-end justify-around gap-4 pb-8">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-1">
                <Skeleton
                  className="w-full rounded-t"
                  style={{ height: `${30 + Math.random() * 70}%` }}
                />
                <Skeleton className="h-3 w-8" />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Table widget skeleton - for data table widgets
 */
function TableWidgetSkeleton({ className, rows }: { className?: string; rows: number }) {
  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <Skeleton className="h-5 w-36" />
      </CardHeader>
      <CardContent>
        {/* Table header */}
        <div className="flex items-center gap-4 pb-3 border-b">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
        {/* Table rows */}
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 py-3 border-b last:border-0">
            {Array.from({ length: 4 }).map((_, j) => (
              <Skeleton key={j} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/**
 * Metric widget skeleton - for single metric display cards
 */
function MetricWidgetSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('', className)}>
      <CardContent className="p-6">
        <div className="flex flex-col items-center justify-center space-y-3">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-12 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Status widget skeleton - for connection/integration status widgets
 */
function StatusWidgetSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn('', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="space-y-1">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-20" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-3 w-3 rounded-full" />
            <Skeleton className="h-4 w-16" />
          </div>
        </div>
        <Skeleton className="h-9 w-full" />
      </CardContent>
    </Card>
  );
}

/**
 * Generic widget skeleton - fallback for custom widgets
 */
function GenericWidgetSkeleton({ className, height }: { className?: string; height: string }) {
  return (
    <Card className={cn('', className)}>
      <CardHeader>
        <Skeleton className="h-5 w-32" />
      </CardHeader>
      <CardContent>
        <Skeleton className="w-full rounded" style={{ height }} />
      </CardContent>
    </Card>
  );
}

/**
 * Grid of metric card skeletons for dashboard summary section
 */
export function MetricCardsGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <SummaryWidgetSkeleton key={i} />
      ))}
    </div>
  );
}

/**
 * Full dashboard skeleton layout matching the actual dashboard structure
 */
export function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-64 mt-2" />
        </div>
        <Skeleton className="h-10 w-32" />
      </div>

      {/* Metric cards grid */}
      <MetricCardsGridSkeleton count={4} />

      {/* Learning mode indicator placeholder */}
      <Skeleton className="h-24 w-full rounded-lg" />

      {/* Charts section */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="md:col-span-2">
          <ChartWidgetSkeleton height="350px" />
        </div>
        <StatusWidgetSkeleton />
      </div>

      {/* Bottom section */}
      <div className="grid gap-4 md:grid-cols-2">
        <ListWidgetSkeleton items={5} />
      </div>
    </div>
  );
}
