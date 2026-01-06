'use client';

import * as React from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useReconciliationSummary, useReconciliationHistory, useReconciliationDiscrepancies } from '@/hooks/use-reconciliation';
import { ReconciliationForm, ReconciliationHistory, DiscrepancyList } from '@/components/reconciliation';
import { formatCurrency } from '@/lib/utils/format';
import { Skeleton } from '@/components/ui/skeleton';

export default function ReconciliationPage() {
  const { data: summary, isLoading, error, refetch } = useReconciliationSummary();
  const { data: history, isLoading: historyLoading, error: historyError } = useReconciliationHistory();
  const { data: discrepancies, isLoading: discrepanciesLoading, error: discrepanciesError } = useReconciliationDiscrepancies();
  const [isFormOpen, setIsFormOpen] = React.useState(false);

  if (error || historyError || discrepanciesError) {
    throw new Error(`Failed to load reconciliation: ${(error || historyError || discrepanciesError)?.message}`);
  }

  const handleReconciliationSuccess = () => {
    setIsFormOpen(false);
    refetch();
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsFormOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Start Reconciliation
          </Button>
        </div>
      </div>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>New Reconciliation</DialogTitle>
            <DialogDescription>
              Enter your bank statement details to reconcile transactions for a specific period.
            </DialogDescription>
          </DialogHeader>
          <ReconciliationForm
            onSuccess={handleReconciliationSuccess}
            onCancel={() => setIsFormOpen(false)}
          />
        </DialogContent>
      </Dialog>

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

      {discrepanciesLoading ? (
        <Skeleton className="h-48" />
      ) : discrepancies?.items && discrepancies.items.length > 0 ? (
        <DiscrepancyList items={discrepancies.items} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Discrepancies</CardTitle>
            <CardDescription>
              Items that need attention and manual review
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-center py-8">
              No discrepancies found. Run a reconciliation to check for issues.
            </p>
          </CardContent>
        </Card>
      )}

      <ReconciliationHistory
        reconciliations={history?.data || []}
        isLoading={historyLoading}
      />
    </div>
  );
}
