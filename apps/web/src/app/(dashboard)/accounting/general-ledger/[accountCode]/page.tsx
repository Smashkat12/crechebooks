'use client';

/**
 * TASK-ACCT-UI-002: Account Ledger Page
 * View all transactions for a specific account with running balance.
 */

import { useState, use } from 'react';
import Link from 'next/link';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/tables/data-table';
import { DataTableSkeleton } from '@/components/tables/data-table-skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { GLDateRangePicker, type GLDateRange } from '@/components/accounting/gl-date-range-picker';
import { accountLedgerColumns } from '@/components/accounting/journal-entry-columns';
import { useAccountLedger } from '@/hooks/use-general-ledger';
import { cn } from '@/lib/utils';

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

const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  ASSET: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  LIABILITY: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  EQUITY: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  REVENUE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  EXPENSE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function AccountLedgerPage({
  params,
}: {
  params: Promise<{ accountCode: string }>;
}) {
  const { accountCode } = use(params);
  const decodedAccountCode = decodeURIComponent(accountCode);

  // Default to last 3 months to ensure some data is visible
  const [dateRange, setDateRange] = useState<GLDateRange>(() => ({
    from: startOfMonth(subMonths(new Date(), 2)),
    to: endOfMonth(new Date()),
  }));

  const fromDate = format(dateRange.from, 'yyyy-MM-dd');
  const toDate = format(dateRange.to, 'yyyy-MM-dd');

  const { data: ledger, isLoading, error } = useAccountLedger(decodedAccountCode, fromDate, toDate);

  if (error) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/accounting/general-ledger">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Account Ledger: {decodedAccountCode}</h1>
            <p className="text-muted-foreground">View transactions for this account</p>
          </div>
        </div>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load account ledger: {error.message}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/accounting/general-ledger">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight font-mono">
                {decodedAccountCode}
              </h1>
              {ledger && (
                <Badge className={ACCOUNT_TYPE_COLORS[ledger.accountType] || 'bg-gray-100 text-gray-800'}>
                  {ledger.accountType}
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {isLoading ? (
                <Skeleton className="h-4 w-48" />
              ) : (
                ledger?.accountName || 'Account Ledger'
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Balance Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Opening Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <p
                className={cn(
                  'text-2xl font-bold font-mono tabular-nums',
                  ledger && ledger.openingBalanceCents < 0 && 'text-red-600'
                )}
              >
                {ledger ? formatZAR(ledger.openingBalanceCents) : '-'}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              As of {format(dateRange.from, 'dd MMM yyyy')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Period Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <p className="text-2xl font-bold">
                {ledger?.entries.length || 0} entries
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              {format(dateRange.from, 'dd MMM')} - {format(dateRange.to, 'dd MMM yyyy')}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Closing Balance
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-8 w-28" />
            ) : (
              <p
                className={cn(
                  'text-2xl font-bold font-mono tabular-nums',
                  ledger && ledger.closingBalanceCents < 0 && 'text-red-600'
                )}
              >
                {ledger ? formatZAR(ledger.closingBalanceCents) : '-'}
              </p>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              As of {format(dateRange.to, 'dd MMM yyyy')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Movement Summary (if we have data) */}
      {ledger && ledger.entries.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Debits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold font-mono tabular-nums text-blue-600">
                {formatZAR(
                  ledger.entries.reduce((sum, e) => sum + e.debitCents, 0)
                )}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Credits
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xl font-bold font-mono tabular-nums text-green-600">
                {formatZAR(
                  ledger.entries.reduce((sum, e) => sum + e.creditCents, 0)
                )}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transactions */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <CardTitle>Transactions</CardTitle>
            <GLDateRangePicker value={dateRange} onChange={setDateRange} />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <DataTableSkeleton columns={6} rows={10} />
          ) : (
            <DataTable
              columns={accountLedgerColumns}
              data={ledger?.entries || []}
              emptyMessage="No transactions found for this account in the selected period."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
