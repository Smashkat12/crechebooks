'use client';

/**
 * TASK-ACCT-UI-003: Cash Flow Summary Cards
 * Displays key cash flow metrics (opening balance, net change, closing balance, status)
 */

import { ArrowUpRight, ArrowDownRight, Wallet, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { CashFlowSummary } from '@/hooks/use-cash-flow';

interface CashFlowSummaryCardsProps {
  summary: CashFlowSummary;
}

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

export function CashFlowSummaryCards({ summary }: CashFlowSummaryCardsProps) {
  const isPositiveChange = summary.netCashChangeCents >= 0;

  return (
    <div className="grid gap-4 md:grid-cols-4 print:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Opening Balance</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold font-mono tabular-nums">
            {formatZAR(summary.openingCashBalanceCents)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Net Change</CardTitle>
          {isPositiveChange ? (
            <ArrowUpRight className="h-4 w-4 text-green-600" />
          ) : (
            <ArrowDownRight className="h-4 w-4 text-red-600" />
          )}
        </CardHeader>
        <CardContent>
          <div
            className={`text-2xl font-bold font-mono tabular-nums ${
              isPositiveChange ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}
          >
            {isPositiveChange ? '+' : ''}
            {formatZAR(summary.netCashChangeCents)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Closing Balance</CardTitle>
          <Wallet className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold font-mono tabular-nums">
            {formatZAR(summary.closingCashBalanceCents)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Status</CardTitle>
          <Activity className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div
            className={`text-2xl font-bold ${
              summary.cashReconciles
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {summary.cashReconciles ? 'Reconciled' : 'Unreconciled'}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
