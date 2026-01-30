'use client';

/**
 * Aged Payables Report Component
 * TASK-REPORTS-005: Missing Report Types Implementation
 *
 * @module components/reports/aged-payables
 * @description UI component for displaying aged payables report.
 * Shows empty state with informative message since bills/suppliers module is not in scope.
 *
 * CRITICAL: All amounts would be in cents - divide by 100 for display.
 */

import { FileQuestion, Clock, Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils';
import { ReportHeader } from './report-header';
import { ExportButtons, ExportFormat } from './export-buttons';

/**
 * Supplier aging bucket.
 */
interface SupplierAgingBucket {
  count: number;
  totalCents: number;
  suppliers: Array<{
    supplierId: string;
    supplierName: string;
    amountCents: number;
    invoiceCount: number;
    oldestBillDays: number;
  }>;
}

/**
 * Aged payables data structure.
 */
interface AgedPayablesData {
  asOfDate: Date | string;
  aging: {
    current: SupplierAgingBucket;
    thirtyDays: SupplierAgingBucket;
    sixtyDays: SupplierAgingBucket;
    ninetyDays: SupplierAgingBucket;
    overNinety: SupplierAgingBucket;
  };
  summary: {
    totalOutstanding: number;
    totalSuppliers: number;
    oldestBillDays: number;
    averagePaymentDays?: number;
  };
  isFeatureAvailable?: boolean;
}

interface AgedPayablesReportProps {
  data: AgedPayablesData;
  tenantName?: string;
  onExport?: (format: ExportFormat) => Promise<void>;
}

/**
 * Default buckets for display.
 */
const defaultBuckets = [
  { label: 'Current', className: 'bg-green-500' },
  { label: '1-30 Days', className: 'bg-yellow-500' },
  { label: '31-60 Days', className: 'bg-orange-500' },
  { label: '61-90 Days', className: 'bg-red-400' },
  { label: '90+ Days', className: 'bg-red-600' },
];

/**
 * Aged Payables Report Component.
 * Shows empty state when supplier bills feature is not available.
 */
export function AgedPayablesReport({
  data,
  tenantName,
  onExport,
}: AgedPayablesReportProps) {
  const handleExport = async (format: ExportFormat) => {
    if (onExport) {
      await onExport(format);
    }
  };

  const asOfDate =
    typeof data.asOfDate === 'string' ? new Date(data.asOfDate) : data.asOfDate;

  // Check if there's any data
  const hasData =
    data.summary.totalOutstanding > 0 || data.summary.totalSuppliers > 0;

  // Build buckets array for display
  const buckets = [
    { ...defaultBuckets[0], amount: data.aging.current.totalCents, count: data.aging.current.count },
    { ...defaultBuckets[1], amount: data.aging.thirtyDays.totalCents, count: data.aging.thirtyDays.count },
    { ...defaultBuckets[2], amount: data.aging.sixtyDays.totalCents, count: data.aging.sixtyDays.count },
    { ...defaultBuckets[3], amount: data.aging.ninetyDays.totalCents, count: data.aging.ninetyDays.count },
    { ...defaultBuckets[4], amount: data.aging.overNinety.totalCents, count: data.aging.overNinety.count },
  ];

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex-1">
          <ReportHeader
            title="Aged Payables Report"
            tenantName={tenantName}
            periodStart={asOfDate}
            periodEnd={asOfDate}
          />
        </div>
        {onExport && hasData && <ExportButtons onExport={handleExport} />}
      </CardHeader>
      <CardContent className="space-y-6">
        {!hasData ? (
          /* Empty State */
          <div className="text-center py-12">
            <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <FileQuestion className="h-6 w-6 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">
              Supplier Bills Coming Soon
            </h3>
            <p className="text-muted-foreground max-w-md mx-auto mb-6">
              Track and manage bills from your suppliers, including aging analysis
              for better cash flow management.
            </p>
            <Alert className="max-w-lg mx-auto">
              <Building2 className="h-4 w-4" />
              <AlertTitle>Feature Preview</AlertTitle>
              <AlertDescription>
                Aged payables tracking will be available in a future update.
                This will help you track bills by age (current, 30 days, 60 days,
                90+ days) and manage supplier relationships.
              </AlertDescription>
            </Alert>

            {/* Placeholder Distribution */}
            <div className="mt-8 max-w-lg mx-auto">
              <p className="text-sm text-muted-foreground mb-2">Aging Distribution (Preview)</p>
              <div className="flex h-4 rounded-full overflow-hidden bg-muted">
                {buckets.map((bucket, index) => (
                  <div
                    key={index}
                    className={cn(bucket.className, 'opacity-50')}
                    style={{ width: '20%' }}
                    title={bucket.label}
                  />
                ))}
              </div>
              <div className="grid grid-cols-5 gap-2 text-xs mt-2">
                {buckets.map((bucket, index) => (
                  <div key={index} className="text-center">
                    <div className={cn('w-3 h-3 rounded-full mx-auto mb-1 opacity-50', bucket.className)} />
                    <p className="font-medium text-muted-foreground">{bucket.label}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Has Data State */
          <>
            {/* Summary Bar */}
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Aging Distribution</span>
                <span className="text-sm font-medium">
                  Total: {formatCurrency(data.summary.totalOutstanding / 100)} (
                  {data.summary.totalSuppliers} suppliers)
                </span>
              </div>
              <div className="flex h-4 rounded-full overflow-hidden bg-muted">
                {buckets.map((bucket, index) => {
                  const percentage =
                    data.summary.totalOutstanding > 0
                      ? (bucket.amount / data.summary.totalOutstanding) * 100
                      : 0;
                  return (
                    <div
                      key={index}
                      className={cn(bucket.className, 'transition-all')}
                      style={{ width: `${percentage}%` }}
                      title={`${bucket.label}: ${formatCurrency(bucket.amount / 100)}`}
                    />
                  );
                })}
              </div>
              <div className="grid grid-cols-5 gap-2 text-xs">
                {buckets.map((bucket, index) => (
                  <div key={index} className="text-center">
                    <div className={cn('w-3 h-3 rounded-full mx-auto mb-1', bucket.className)} />
                    <p className="font-medium">{bucket.label}</p>
                    <p className="text-muted-foreground">
                      {formatCurrency(bucket.amount / 100)}
                    </p>
                    <p className="text-muted-foreground">{bucket.count} bills</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Risk Summary */}
            <div className="grid grid-cols-3 gap-4 border-t pt-4">
              <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm text-muted-foreground">Low Risk (Current)</p>
                <p className="text-lg font-bold text-green-600">
                  {formatCurrency(data.aging.current.totalCents / 100)}
                </p>
              </div>
              <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                <p className="text-sm text-muted-foreground">Medium Risk (1-60 days)</p>
                <p className="text-lg font-bold text-yellow-600">
                  {formatCurrency(
                    (data.aging.thirtyDays.totalCents + data.aging.sixtyDays.totalCents) /
                      100
                  )}
                </p>
              </div>
              <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-sm text-muted-foreground">High Risk (60+ days)</p>
                <p className="text-lg font-bold text-red-600">
                  {formatCurrency(
                    (data.aging.ninetyDays.totalCents +
                      data.aging.overNinety.totalCents) /
                      100
                  )}
                </p>
              </div>
            </div>

            {/* Summary Stats */}
            <div className="grid grid-cols-2 gap-4 border-t pt-4">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Oldest Bill</p>
                  <p className="font-semibold">
                    {data.summary.oldestBillDays > 0
                      ? `${data.summary.oldestBillDays} days`
                      : 'N/A'}
                  </p>
                </div>
              </div>
              {data.summary.averagePaymentDays !== undefined && (
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Avg Payment Days</p>
                    <p className="font-semibold">
                      {data.summary.averagePaymentDays} days
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
