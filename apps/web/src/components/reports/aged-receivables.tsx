'use client';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/format';
import { ReportHeader } from './report-header';
import { ExportButtons, ExportFormat } from './export-buttons';
import { cn } from '@/lib/utils';

interface AgingBucket {
  label: string;
  amount: number;
  count: number;
  className: string;
}

interface AgedReceivablesData {
  buckets: AgingBucket[];
  totalOutstanding: number;
  totalCount: number;
  customers: CustomerAging[];
}

interface CustomerAging {
  id: string;
  name: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  days120Plus: number;
  total: number;
}

interface AgedReceivablesProps {
  data: AgedReceivablesData;
  period?: {
    start: Date;
    end: Date;
  };
  tenantName?: string;
  onExport?: (format: ExportFormat) => Promise<void>;
}

const defaultBuckets: AgingBucket[] = [
  { label: 'Current', amount: 0, count: 0, className: 'bg-green-500' },
  { label: '1-30 Days', amount: 0, count: 0, className: 'bg-yellow-500' },
  { label: '31-60 Days', amount: 0, count: 0, className: 'bg-orange-500' },
  { label: '61-90 Days', amount: 0, count: 0, className: 'bg-red-400' },
  { label: '90+ Days', amount: 0, count: 0, className: 'bg-red-600' },
];

export function AgedReceivables({
  data,
  period = { start: new Date(), end: new Date() },
  tenantName,
  onExport,
}: AgedReceivablesProps) {
  const buckets = data.buckets.length > 0 ? data.buckets : defaultBuckets;

  const handleExport = async (format: ExportFormat) => {
    if (onExport) {
      await onExport(format);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="flex-1">
          <ReportHeader
            title="Aged Receivables Report"
            tenantName={tenantName}
            periodStart={period.start}
            periodEnd={period.end}
          />
        </div>
        {onExport && <ExportButtons onExport={handleExport} />}
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Bar */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Aging Distribution</span>
            <span className="text-sm font-medium">
              Total: {formatCurrency(data.totalOutstanding / 100)} ({data.totalCount} invoices)
            </span>
          </div>
          <div className="flex h-4 rounded-full overflow-hidden bg-muted">
            {buckets.map((bucket, index) => {
              const percentage = data.totalOutstanding > 0
                ? (bucket.amount / data.totalOutstanding) * 100
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
                <p className="text-muted-foreground">{formatCurrency(bucket.amount / 100)}</p>
                <p className="text-muted-foreground">{bucket.count} inv.</p>
              </div>
            ))}
          </div>
        </div>

        {/* Customer Breakdown */}
        {data.customers.length > 0 && (
          <div>
            <h3 className="font-semibold mb-3">Customer Breakdown</h3>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="text-left p-3">Customer</th>
                    <th className="text-right p-3">Current</th>
                    <th className="text-right p-3">1-30</th>
                    <th className="text-right p-3">31-60</th>
                    <th className="text-right p-3">61-90</th>
                    <th className="text-right p-3">90+</th>
                    <th className="text-right p-3 font-bold">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.customers.map((customer) => (
                    <tr key={customer.id} className="border-t">
                      <td className="p-3 font-medium">{customer.name}</td>
                      <td className="p-3 text-right font-mono text-green-600">
                        {customer.current > 0 ? formatCurrency(customer.current / 100) : '-'}
                      </td>
                      <td className="p-3 text-right font-mono text-yellow-600">
                        {customer.days30 > 0 ? formatCurrency(customer.days30 / 100) : '-'}
                      </td>
                      <td className="p-3 text-right font-mono text-orange-600">
                        {customer.days60 > 0 ? formatCurrency(customer.days60 / 100) : '-'}
                      </td>
                      <td className="p-3 text-right font-mono text-red-400">
                        {customer.days90 > 0 ? formatCurrency(customer.days90 / 100) : '-'}
                      </td>
                      <td className="p-3 text-right font-mono text-red-600">
                        {customer.days120Plus > 0 ? formatCurrency(customer.days120Plus / 100) : '-'}
                      </td>
                      <td className="p-3 text-right font-mono font-bold">
                        {formatCurrency(customer.total / 100)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-muted font-bold">
                  <tr>
                    <td className="p-3">Total</td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(data.customers.reduce((s, c) => s + c.current, 0) / 100)}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(data.customers.reduce((s, c) => s + c.days30, 0) / 100)}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(data.customers.reduce((s, c) => s + c.days60, 0) / 100)}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(data.customers.reduce((s, c) => s + c.days90, 0) / 100)}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(data.customers.reduce((s, c) => s + c.days120Plus, 0) / 100)}
                    </td>
                    <td className="p-3 text-right font-mono">
                      {formatCurrency(data.totalOutstanding / 100)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        )}

        {/* Collection Risk Summary */}
        <div className="grid grid-cols-3 gap-4 border-t pt-4">
          <div className="text-center p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-sm text-muted-foreground">Low Risk (Current)</p>
            <p className="text-lg font-bold text-green-600">
              {formatCurrency((buckets[0]?.amount || 0) / 100)}
            </p>
          </div>
          <div className="text-center p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <p className="text-sm text-muted-foreground">Medium Risk (1-60 days)</p>
            <p className="text-lg font-bold text-yellow-600">
              {formatCurrency(((buckets[1]?.amount || 0) + (buckets[2]?.amount || 0)) / 100)}
            </p>
          </div>
          <div className="text-center p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
            <p className="text-sm text-muted-foreground">High Risk (60+ days)</p>
            <p className="text-lg font-bold text-red-600">
              {formatCurrency(((buckets[3]?.amount || 0) + (buckets[4]?.amount || 0)) / 100)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
