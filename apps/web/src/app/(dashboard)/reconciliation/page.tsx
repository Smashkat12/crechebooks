'use client';

import * as React from 'react';
import { RefreshCw, CheckCircle, AlertTriangle, Plus, FileText, PenLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { useReconciliationSummary, useReconciliationHistory, useReconciliationDiscrepancies, useRefreshMatchResults, type BankStatementReconciliationResult, type BankStatementMatch } from '@/hooks/use-reconciliation';
import { apiClient } from '@/lib/api';
import type { IReconciliation } from '@crechebooks/types';
import {
  ReconciliationForm,
  ReconciliationHistory,
  DiscrepancyList,
  BankStatementUpload,
  BankStatementMatchResults,
} from '@/components/reconciliation';
import { formatCurrency } from '@/lib/utils/format';
import { Skeleton } from '@/components/ui/skeleton';

export default function ReconciliationPage() {
  const { data: summary, isLoading, error, refetch } = useReconciliationSummary();
  const { data: history, isLoading: historyLoading, error: historyError } = useReconciliationHistory();
  const { data: discrepancies, isLoading: discrepanciesLoading, error: discrepanciesError } = useReconciliationDiscrepancies();
  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [reconciliationType, setReconciliationType] = React.useState<'manual' | 'pdf'>('pdf');
  const [matchResults, setMatchResults] = React.useState<BankStatementReconciliationResult | null>(null);

  // Hook to refresh match results after manual match/unmatch
  const { refreshMatches } = useRefreshMatchResults(matchResults?.reconciliationId ?? null);

  const handleRefreshMatches = React.useCallback(async () => {
    const updated = await refreshMatches();
    if (updated) {
      setMatchResults(updated);
    }
  }, [refreshMatches]);

  if (error || historyError || discrepanciesError) {
    throw new Error(`Failed to load reconciliation: ${(error || historyError || discrepanciesError)?.message}`);
  }

  const handleReconciliationSuccess = () => {
    setIsFormOpen(false);
    refetch();
  };

  const handlePdfReconciliationSuccess = (result: BankStatementReconciliationResult) => {
    setIsFormOpen(false);
    setMatchResults(result);
    refetch();
  };

  const handleCloseResults = () => {
    setMatchResults(null);
  };

  // Handler to view a reconciliation's match results (read-only)
  const handleViewReconciliation = React.useCallback(async (reconciliation: IReconciliation) => {
    try {
      // Fetch reconciliation details
      const { data: reconData } = await apiClient.get<{
        success: boolean;
        data: {
          id: string;
          status: string;
          bank_account: string;
          period_start: string;
          period_end: string;
          opening_balance: number;
          closing_balance: number;
          calculated_balance: number;
          discrepancy: number;
          matched_count: number;
          unmatched_count: number;
          match_summary?: {
            matched: number;
            in_bank_only: number;
            in_xero_only: number;
            amount_mismatch: number;
            date_mismatch: number;
            total: number;
          };
        };
      }>(`/reconciliation/${reconciliation.id}`);

      // Fetch matches for this reconciliation
      const { data: matchData } = await apiClient.get<{
        success: boolean;
        data: Array<{
          id: string;
          bank_date: string;
          bank_description: string;
          bank_amount: number;
          bank_is_credit: boolean;
          transaction_id: string | null;
          xero_date: string | null;
          xero_description: string | null;
          xero_amount: number | null;
          xero_is_credit: boolean | null;
          status: BankStatementMatch['status'];
          match_confidence: number | null;
          discrepancy_reason: string | null;
        }>;
        total: number;
      }>(`/reconciliation/${reconciliation.id}/matches`);

      // Build result object
      const result: BankStatementReconciliationResult = {
        reconciliationId: reconData.data.id,
        periodStart: reconData.data.period_start,
        periodEnd: reconData.data.period_end,
        openingBalance: reconData.data.opening_balance,
        closingBalance: reconData.data.closing_balance,
        calculatedBalance: reconData.data.calculated_balance,
        discrepancy: reconData.data.discrepancy,
        matchSummary: reconData.data.match_summary ? {
          matched: reconData.data.match_summary.matched,
          inBankOnly: reconData.data.match_summary.in_bank_only,
          inXeroOnly: reconData.data.match_summary.in_xero_only,
          amountMismatch: reconData.data.match_summary.amount_mismatch,
          dateMismatch: reconData.data.match_summary.date_mismatch,
          feeAdjustedMatch: (reconData.data.match_summary as Record<string, number>).fee_adjusted_match || 0,
          total: reconData.data.match_summary.total,
        } : {
          matched: reconData.data.matched_count,
          inBankOnly: reconData.data.unmatched_count,
          inXeroOnly: 0,
          amountMismatch: 0,
          dateMismatch: 0,
          feeAdjustedMatch: 0,
          total: reconData.data.matched_count + reconData.data.unmatched_count,
        },
        status: reconData.data.status,
        matches: matchData.data.map((m) => ({
          id: m.id,
          bankDate: m.bank_date,
          bankDescription: m.bank_description,
          bankAmount: m.bank_amount,
          bankIsCredit: m.bank_is_credit,
          transactionId: m.transaction_id,
          xeroDate: m.xero_date,
          xeroDescription: m.xero_description,
          xeroAmount: m.xero_amount,
          xeroIsCredit: m.xero_is_credit,
          status: m.status,
          matchConfidence: m.match_confidence,
          discrepancyReason: m.discrepancy_reason,
        })),
      };

      setMatchResults(result);
    } catch (error) {
      console.error('Failed to load reconciliation details:', error);
    }
  }, []);

  // If we have match results to display, show them
  if (matchResults) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Reconciliation Results</h1>
            <p className="text-muted-foreground">
              Review matched and unmatched transactions from your bank statement
            </p>
          </div>
          <Button variant="outline" onClick={handleCloseResults}>
            Back to Reconciliation
          </Button>
        </div>
        <BankStatementMatchResults
          result={matchResults}
          onClose={handleCloseResults}
          onRefresh={handleRefreshMatches}
        />
      </div>
    );
  }

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
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>New Reconciliation</DialogTitle>
            <DialogDescription>
              Choose how you want to reconcile your bank transactions
            </DialogDescription>
          </DialogHeader>
          <Tabs value={reconciliationType} onValueChange={(v) => setReconciliationType(v as 'manual' | 'pdf')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pdf" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Upload PDF Statement
              </TabsTrigger>
              <TabsTrigger value="manual" className="flex items-center gap-2">
                <PenLine className="h-4 w-4" />
                Manual Entry
              </TabsTrigger>
            </TabsList>
            <TabsContent value="pdf" className="mt-4">
              <BankStatementUpload
                onSuccess={handlePdfReconciliationSuccess}
                onCancel={() => setIsFormOpen(false)}
              />
            </TabsContent>
            <TabsContent value="manual" className="mt-4">
              <ReconciliationForm
                onSuccess={handleReconciliationSuccess}
                onCancel={() => setIsFormOpen(false)}
              />
            </TabsContent>
          </Tabs>
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
        onView={handleViewReconciliation}
      />
    </div>
  );
}
