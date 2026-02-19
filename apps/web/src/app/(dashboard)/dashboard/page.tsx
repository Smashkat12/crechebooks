'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign, Receipt, AlertTriangle, Users, RefreshCw } from 'lucide-react';
import {
  MetricCard,
  IncomeExpenseChart,
  TopArrearsWidget,
  XeroStatusWidget,
  LearningModeIndicator,
  DashboardErrorBoundary,
  DashboardWidgetSkeleton,
  MetricCardsGridSkeleton,
} from '@/components/dashboard';
import { useDashboardMetrics, useDashboardTrends, useAvailablePeriods } from '@/hooks/use-dashboard';
import { useDashboardData, useInvalidateDashboardCache } from '@/hooks/use-dashboard-data';
import { useLearningMode } from '@/hooks/useLearningMode';
import { useOnboardingDashboardCta } from '@/hooks/use-tenant-onboarding';
import { FinancialYearSelector } from '@/components/common/financial-year-selector';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Dashboard Page with Enhanced Data Loading
 *
 * UI-002 Features:
 * - Parallel data fetching with useQueries
 * - Stale-while-revalidate caching strategy
 * - Partial data loading (some widgets load while others fail)
 * - Error boundaries for individual widgets
 * - Skeleton loaders during loading states
 * - Retry logic for failed requests
 */
export default function DashboardPage() {
  const router = useRouter();

  // Selected financial year (null = all time / auto-detect from latest transaction)
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  // Check onboarding status - redirect if required steps incomplete
  const { data: onboardingCta, isLoading: onboardingLoading } = useOnboardingDashboardCta();

  useEffect(() => {
    // Redirect to onboarding if required steps are not complete
    if (!onboardingLoading && onboardingCta?.showOnboarding) {
      // Check if required steps are incomplete (not just optional steps)
      // Required steps: address, bankDetails, feeStructure
      const hasRequiredIncomplete = onboardingCta.progressPercent < 38; // ~3/8 required steps
      if (hasRequiredIncomplete || onboardingCta.progressPercent === 0) {
        router.push('/dashboard/onboarding');
        return;
      }
    }
  }, [onboardingCta, onboardingLoading, router]);

  // Fetch available periods to populate the selector
  const { data: availablePeriods, isLoading: periodsLoading } = useAvailablePeriods();

  // Use the enhanced dashboard data hook with parallel queries and SWR
  // Pass undefined for year when null (all time) to let API auto-detect
  const yearParam = selectedYear ?? undefined;
  const {
    metrics,
    trends,
    xeroStatus,
    isLoading,
    isInitialLoading,
    hasError,
    partialDataLoaded,
    totalQueries,
    refetchAll,
    refetchFailed,
  } = useDashboardData(undefined, yearParam);

  // Learning mode state
  const { progress, isLoading: learningModeLoading, isDismissed, dismissIndicator } = useLearningMode();

  // Cache invalidation
  const { invalidateAll } = useInvalidateDashboardCache();

  // Handle manual refresh
  const handleRefresh = useCallback(() => {
    invalidateAll();
    refetchAll();
  }, [invalidateAll, refetchAll]);

  // Transform trends data to match chart format
  const chartData = trends.data?.data.map(d => ({
    month: d.date,
    income: d.revenue,
    expenses: d.expenses,
  })) ?? [];

  // Arrears bucket data for widget
  const arrearsData = metrics.data?.arrears ?? null;

  // Show skeleton during initial load or while checking onboarding
  if (isInitialLoading || onboardingLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-9 w-48 bg-muted animate-pulse rounded" />
            <div className="h-5 w-64 mt-2 bg-muted animate-pulse rounded" />
          </div>
          <div className="h-10 w-32 bg-muted animate-pulse rounded" />
        </div>
        <MetricCardsGridSkeleton count={4} />
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <div className="md:col-span-2">
            <DashboardWidgetSkeleton type="chart" height="350px" />
          </div>
          <DashboardWidgetSkeleton type="status" />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <DashboardWidgetSkeleton type="list" listItems={5} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with year selector and refresh button */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Overview of your creche finances
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            disabled={isLoading}
            title="Refresh dashboard"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <FinancialYearSelector
            value={selectedYear}
            onChange={setSelectedYear}
            availableYears={availablePeriods?.availableFinancialYears ?? []}
            includeAllTime={true}
            isLoading={periodsLoading}
          />
        </div>
      </div>

      {/* Onboarding redirect handled in useEffect - users with incomplete required steps are redirected */}

      {/* Partial loading indicator */}
      {hasError && partialDataLoaded > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Some data failed to load</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              {partialDataLoaded} of {totalQueries} widgets loaded successfully.
            </span>
            <Button variant="outline" size="sm" onClick={refetchFailed}>
              <RefreshCw className="mr-2 h-3 w-3" />
              Retry Failed
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Metric Cards with error boundaries */}
      <DashboardErrorBoundary compact widgetName="Metrics Summary">
        {metrics.isLoading ? (
          <MetricCardsGridSkeleton count={4} />
        ) : metrics.isError ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Failed to load metrics</AlertTitle>
            <AlertDescription>
              <Button variant="outline" size="sm" onClick={() => metrics.refetch()}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              title="Total Revenue"
              value={metrics.data?.revenue.total ?? 0}
              icon={DollarSign}
              format="currency"
            />
            <MetricCard
              title="Outstanding"
              value={metrics.data?.revenue.outstanding ?? 0}
              icon={Receipt}
              format="currency"
            />
            <MetricCard
              title="Total Arrears"
              value={metrics.data?.arrears.total ?? 0}
              icon={AlertTriangle}
              format="currency"
            />
            <MetricCard
              title="Active Children"
              value={metrics.data?.enrollment.active ?? 0}
              icon={Users}
              format="number"
            />
          </div>
        )}
      </DashboardErrorBoundary>

      {/* Learning Mode Indicator - Show if in learning mode and not dismissed */}
      {progress && progress.isLearningMode && !isDismissed && !learningModeLoading && (
        <LearningModeIndicator
          progress={progress}
          onDismiss={dismissIndicator}
        />
      )}

      {/* Charts section with error boundaries */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <DashboardErrorBoundary compact widgetName="Revenue Chart" className="md:col-span-2">
          {trends.isLoading ? (
            <DashboardWidgetSkeleton type="chart" height="350px" />
          ) : (
            <IncomeExpenseChart data={chartData} isLoading={trends.isLoading} />
          )}
        </DashboardErrorBoundary>

        <DashboardErrorBoundary compact widgetName="Xero Status">
          {xeroStatus.isLoading ? (
            <DashboardWidgetSkeleton type="status" />
          ) : (
            <XeroStatusWidget />
          )}
        </DashboardErrorBoundary>
      </div>

      {/* Bottom section with error boundary */}
      <div className="grid gap-4 md:grid-cols-2">
        <DashboardErrorBoundary compact widgetName="Arrears">
          {metrics.isLoading ? (
            <DashboardWidgetSkeleton type="list" listItems={5} />
          ) : (
            <TopArrearsWidget arrears={arrearsData} />
          )}
        </DashboardErrorBoundary>
      </div>
    </div>
  );
}
