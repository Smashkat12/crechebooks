'use client';

/**
 * Reports Page
 * TASK-REPORTS-004: Reports Dashboard UI Components
 *
 * @module app/(dashboard)/reports/page
 * @description Main reports page with dashboard, charts, and AI insights.
 *
 * CRITICAL RULES:
 * - NO WORKAROUNDS - errors must propagate
 * - Fail fast with proper error logging
 * - All amounts in cents - divide by 100 for display
 */

import { useState } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { ReportType } from '@crechebooks/types';
import {
  ReportSelector,
  DateRangePicker,
  ExportButtons,
  ReportDashboard,
  ReportDashboardSkeleton,
} from '@/components/reports';
import type { DateRange, ExportFormat } from '@/components/reports';
import { useReportData } from '@/hooks/use-report-data';
import { useAIInsights } from '@/hooks/use-ai-insights';
import { useExportReport } from '@/hooks/useExportReport';

/**
 * Error state component with retry button.
 */
function ErrorState({
  error,
  onRetry,
}: {
  error: Error;
  onRetry: () => void;
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error loading report</AlertTitle>
      <AlertDescription className="flex flex-col gap-4">
        <p>{error.message}</p>
        <Button variant="outline" size="sm" onClick={onRetry} className="w-fit">
          <RefreshCw className="h-4 w-4 mr-2" />
          Try again
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Empty state when no report data is available.
 */
function EmptyState() {
  return (
    <Card>
      <CardContent className="py-12">
        <p className="text-center text-muted-foreground">
          Select a report type and date range to view your financial data.
        </p>
      </CardContent>
    </Card>
  );
}

/**
 * Reports page component.
 */
export default function ReportsPage() {
  // State for report selection
  const [selectedReport, setSelectedReport] = useState<ReportType>(
    ReportType.INCOME_STATEMENT
  );
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
    to: new Date(),
  });

  // Data fetching hooks
  const {
    data: reportData,
    isLoading: dataLoading,
    error: dataError,
    refetch: refetchData,
    isFetching: isRefetching,
  } = useReportData(selectedReport, dateRange);

  const {
    data: aiInsights,
    isLoading: insightsLoading,
  } = useAIInsights(selectedReport, reportData);

  // Export mutation
  const exportReport = useExportReport();

  /**
   * Handle export action.
   */
  const handleExport = async (format: ExportFormat, includeInsights: boolean): Promise<void> => {
    // Only support PDF, XLSX, and CSV formats
    const supportedFormat = format === 'xlsx' ? 'xlsx' : format === 'csv' ? 'csv' : 'pdf';

    await exportReport.mutateAsync({
      reportType: selectedReport,
      format: supportedFormat,
      dateRange: {
        start: dateRange.from.toISOString().split('T')[0],
        end: dateRange.to.toISOString().split('T')[0],
      },
      includeInsights: format === 'pdf' && includeInsights,
    });
  };

  /**
   * Handle refresh action.
   */
  const handleRefresh = () => {
    refetchData();
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Financial Reports</h1>
          <p className="text-muted-foreground">
            AI-powered financial insights and analytics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={dataLoading || isRefetching}
          >
            <RefreshCw
              className={cn('h-4 w-4 mr-2', isRefetching && 'animate-spin')}
              aria-hidden="true"
            />
            Refresh
          </Button>
          <ExportButtons
            onExport={handleExport}
            disabled={!reportData || dataLoading || exportReport.isPending}
            hasInsights={!!aiInsights}
          />
        </div>
      </div>

      {/* Report Selection Card */}
      <Card>
        <CardHeader>
          <CardTitle>Select Report</CardTitle>
          <CardDescription>Choose a report type and date range</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ReportSelector
            selectedType={selectedReport}
            onSelect={setSelectedReport}
          />
          <div className="pt-4 border-t">
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        </CardContent>
      </Card>

      {/* Dashboard Content */}
      {dataError ? (
        <ErrorState error={dataError} onRetry={handleRefresh} />
      ) : dataLoading ? (
        <ReportDashboardSkeleton />
      ) : reportData ? (
        <ReportDashboard
          type={selectedReport}
          data={reportData}
          insights={aiInsights ?? null}
          insightsLoading={insightsLoading}
        />
      ) : (
        <EmptyState />
      )}
    </div>
  );
}
