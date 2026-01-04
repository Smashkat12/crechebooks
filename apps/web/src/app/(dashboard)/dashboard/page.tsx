'use client';

import { DollarSign, Receipt, AlertTriangle, Users } from 'lucide-react';
import {
  MetricCard,
  IncomeExpenseChart,
  TopArrearsWidget,
  XeroStatusWidget,
  LearningModeIndicator
} from '@/components/dashboard';
import { useDashboardMetrics, useDashboardTrends } from '@/hooks/use-dashboard';
import { useLearningMode } from '@/hooks/useLearningMode';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  const { data: metrics, isLoading: metricsLoading, error: metricsError } = useDashboardMetrics();
  const { data: trends, isLoading: trendsLoading } = useDashboardTrends();
  const { progress, isLoading: learningModeLoading, isDismissed, dismissIndicator } = useLearningMode();

  if (metricsError) {
    throw new Error(`Failed to load dashboard: ${metricsError.message}`);
  }

  if (metricsLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-[400px] rounded-lg" />
      </div>
    );
  }

  // Transform trends data to match chart format
  const chartData = trends?.data.map(d => ({
    month: d.date,
    income: d.revenue,
    expenses: d.expenses,
  })) ?? [];

  // Transform arrears data for widget
  const arrearsData = metrics?.arrears ? [{
    id: '1',
    parentName: 'Accounts in arrears',
    amount: metrics.arrears.total,
    daysOverdue: 30,
  }] : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your creche finances
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Revenue"
          value={metrics?.revenue.total ?? 0}
          icon={DollarSign}
          format="currency"
        />
        <MetricCard
          title="Outstanding"
          value={metrics?.revenue.outstanding ?? 0}
          icon={Receipt}
          format="currency"
        />
        <MetricCard
          title="Total Arrears"
          value={metrics?.arrears.total ?? 0}
          icon={AlertTriangle}
          format="currency"
        />
        <MetricCard
          title="Active Children"
          value={metrics?.enrollment.active ?? 0}
          icon={Users}
          format="number"
        />
      </div>

      {/* Learning Mode Indicator - Show if in learning mode and not dismissed */}
      {progress && progress.isLearningMode && !isDismissed && !learningModeLoading && (
        <LearningModeIndicator
          progress={progress}
          onDismiss={dismissIndicator}
        />
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="md:col-span-2">
          <IncomeExpenseChart data={chartData} isLoading={trendsLoading} />
        </div>
        <XeroStatusWidget />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <TopArrearsWidget arrears={arrearsData} />
      </div>
    </div>
  );
}
