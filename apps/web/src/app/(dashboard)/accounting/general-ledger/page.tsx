'use client';

/**
 * TASK-ACCT-UI-002: General Ledger List Page
 * View journal entries and account activity with date range and source filters.
 */

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { FileSpreadsheet, TrendingUp, TrendingDown, BookOpen, AlertCircle, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/tables/data-table';
import { DataTableSkeleton } from '@/components/tables/data-table-skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GLDateRangePicker, type GLDateRange } from '@/components/accounting/gl-date-range-picker';
import { journalEntryColumns } from '@/components/accounting/journal-entry-columns';
import { useGeneralLedger, useLedgerSummary, type SourceType } from '@/hooks/use-general-ledger';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api/client';
import { useToast } from '@/hooks/use-toast';

/**
 * Format amount in ZAR (South African Rand)
 * Values are in cents, convert to Rand for display
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

export default function GeneralLedgerPage() {
  const { toast } = useToast();
  const [dateRange, setDateRange] = useState<GLDateRange>(() => ({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  }));
  const [sourceFilter, setSourceFilter] = useState<SourceType | 'all'>('all');

  // Month-end pack: default to last completed month (current month - 1)
  const [packPeriod, setPackPeriod] = useState<string>(() =>
    format(subMonths(new Date(), 1), 'yyyy-MM'),
  );
  const [isDownloading, setIsDownloading] = useState(false);

  const currentPeriod = format(new Date(), 'yyyy-MM');
  const isFuturePeriod = packPeriod > currentPeriod;

  const handleDownloadPack = async () => {
    if (isFuturePeriod) return;
    setIsDownloading(true);
    try {
      const response = await apiClient.get(
        `/general-ledger/month-end-pack?period=${packPeriod}`,
        { responseType: 'blob' },
      );
      const blob = new Blob([response.data as BlobPart], { type: 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `month-end-${packPeriod}.zip`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast({ title: 'Download complete', description: `month-end-${packPeriod}.zip saved.` });
    } catch {
      toast({
        title: 'Download failed',
        description: 'Could not download the month-end pack. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const fromDate = format(dateRange.from, 'yyyy-MM-dd');
  const toDate = format(dateRange.to, 'yyyy-MM-dd');

  const {
    data: entries,
    isLoading,
    error,
  } = useGeneralLedger({
    fromDate,
    toDate,
    sourceType: sourceFilter === 'all' ? undefined : sourceFilter,
  });

  const { isLoading: summaryLoading } = useLedgerSummary(fromDate, toDate);

  // Calculate totals from entries
  const totals = useMemo(() => {
    if (!entries) return { debits: 0, credits: 0 };
    return entries.reduce(
      (acc, entry) => ({
        debits: acc.debits + entry.debitCents,
        credits: acc.credits + entry.creditCents,
      }),
      { debits: 0, credits: 0 }
    );
  }, [entries]);

  const isBalanced = totals.debits === totals.credits;

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">General Ledger</h1>
          <p className="text-muted-foreground">View journal entries and account activity</p>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load general ledger: {error.message}
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
          <h1 className="text-3xl font-bold tracking-tight">General Ledger</h1>
          <p className="text-muted-foreground">
            View journal entries and account activity
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/accounting/accounts">
            <Button variant="outline">
              <BookOpen className="h-4 w-4 mr-2" />
              Chart of Accounts
            </Button>
          </Link>
          <Link href="/accounting/trial-balance">
            <Button variant="outline">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Trial Balance
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={packPeriod}
              max={currentPeriod}
              onChange={(e) => setPackPeriod(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              aria-label="Month-end pack period"
            />
            <Button
              variant="outline"
              onClick={handleDownloadPack}
              disabled={isFuturePeriod || isDownloading}
              title={isFuturePeriod ? 'Cannot download a future period' : `Download month-end pack for ${packPeriod}`}
            >
              <Download className="h-4 w-4 mr-2" />
              {isDownloading ? 'Downloading...' : 'Month-End Pack'}
            </Button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Debits</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading || isLoading ? (
              <div className="h-8 w-24 bg-muted animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold tabular-nums">{formatZAR(totals.debits)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Credits</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading || isLoading ? (
              <div className="h-8 w-24 bg-muted animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold tabular-nums">{formatZAR(totals.credits)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Entries</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-8 w-16 bg-muted animate-pulse rounded" />
            ) : (
              <div className="text-2xl font-bold">{entries?.length || 0}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Status</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-8 w-20 bg-muted animate-pulse rounded" />
            ) : (
              <div
                className={cn(
                  'text-2xl font-bold',
                  isBalanced ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                )}
              >
                {isBalanced ? 'Balanced' : 'Unbalanced'}
              </div>
            )}
            {!isLoading && !isBalanced && (
              <p className="text-xs text-destructive mt-1">
                Difference: {formatZAR(Math.abs(totals.debits - totals.credits))}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Filters and Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <GLDateRangePicker value={dateRange} onChange={setDateRange} />
            <Select
              value={sourceFilter}
              onValueChange={(v) => setSourceFilter(v as SourceType | 'all')}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="CATEGORIZATION">Categorization</SelectItem>
                <SelectItem value="PAYROLL">Payroll</SelectItem>
                <SelectItem value="INVOICE">Invoice</SelectItem>
                <SelectItem value="PAYMENT">Payment</SelectItem>
                <SelectItem value="MANUAL">Manual</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <DataTableSkeleton columns={8} rows={10} />
          ) : (
            <DataTable
              columns={journalEntryColumns}
              data={entries || []}
              emptyMessage="No journal entries found for the selected period."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
