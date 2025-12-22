'use client';

import { RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useReconciliationSummary, useReconcile } from '@/hooks/use-reconciliation';
import { formatCurrency } from '@/lib/utils/format';
import { Skeleton } from '@/components/ui/skeleton';

export default function ReconciliationPage() {
  const { data: summary, isLoading, error } = useReconciliationSummary();
  const reconcile = useReconcile();

  if (error) {
    throw new Error(`Failed to load reconciliation: ${error.message}`);
  }

  const handleStartReconciliation = async () => {
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endDate = now.toISOString();
    await reconcile.mutateAsync({ startDate, endDate });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reconciliation</h1>
          <p className="text-muted-foreground">
            Reconcile bank transactions with invoices and payments
          </p>
        </div>
        <Button onClick={handleStartReconciliation} disabled={reconcile.isPending}>
          <RefreshCw className={`h-4 w-4 mr-2 ${reconcile.isPending ? 'animate-spin' : ''}`} />
          {reconcile.isPending ? 'Reconciling...' : 'Start Reconciliation'}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Status</CardTitle>
                {summary.reconciled ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                )}
              </CardHeader>
              <CardContent>
                <Badge variant={summary.reconciled ? 'default' : 'secondary'}>
                  {summary.reconciled ? 'Reconciled' : 'Needs Review'}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Bank Balance</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(summary.bankBalance)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Difference</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={`text-2xl font-bold ${summary.difference !== 0 ? 'text-destructive' : 'text-green-600'}`}>
                  {formatCurrency(summary.difference)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
              <CardDescription>Period: {summary.period}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">Total Income</p>
                  <p className="text-lg font-semibold text-green-600">{formatCurrency(summary.totalIncome)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Expenses</p>
                  <p className="text-lg font-semibold text-red-600">{formatCurrency(summary.totalExpenses)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Net Profit</p>
                  <p className="text-lg font-semibold">{formatCurrency(summary.netProfit)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Accounting Balance</p>
                  <p className="text-lg font-semibold">{formatCurrency(summary.accountingBalance)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Discrepancies</CardTitle>
          <CardDescription>
            Items that need attention and manual review
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            Run a reconciliation to see any discrepancies
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
          <CardDescription>
            Previous reconciliation records
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No reconciliation history available
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
