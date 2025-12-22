'use client';

import { CheckCircle2, AlertCircle, ArrowRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { formatCurrency } from '@/lib/utils';
import type { IReconciliation, ReconciliationStatus } from '@crechebooks/types';

interface ReconciliationSummaryProps {
  data: IReconciliation;
}

const statusConfig: Record<
  ReconciliationStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof CheckCircle2 }
> = {
  IN_PROGRESS: { label: 'In Progress', variant: 'secondary', icon: ArrowRight },
  PENDING_REVIEW: { label: 'Pending Review', variant: 'outline', icon: AlertCircle },
  COMPLETED: { label: 'Completed', variant: 'default', icon: CheckCircle2 },
  DISCREPANCY: { label: 'Discrepancy', variant: 'destructive', icon: AlertCircle },
};

export function ReconciliationSummary({ data }: ReconciliationSummaryProps) {
  const status = statusConfig[data.status];
  const StatusIcon = status.icon;

  const matchedItems = data.items.filter((item) => item.matched).length;
  const matchPercentage = data.items.length > 0 ? (matchedItems / data.items.length) * 100 : 0;

  const hasDiscrepancy = data.discrepancy !== 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Reconciliation Summary</CardTitle>
        <Badge variant={status.variant} className="gap-1">
          <StatusIcon className="h-3 w-3" />
          {status.label}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Balance Comparison */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-lg bg-muted">
            <p className="text-sm text-muted-foreground mb-1">Bank Statement Balance</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(data.statementBalance)}</p>
          </div>
          <div className="p-4 rounded-lg bg-muted">
            <p className="text-sm text-muted-foreground mb-1">Calculated Balance</p>
            <p className="text-2xl font-bold font-mono">{formatCurrency(data.calculatedBalance)}</p>
          </div>
        </div>

        {/* Discrepancy */}
        {hasDiscrepancy && (
          <div className="p-4 rounded-lg border-2 border-destructive bg-destructive/5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-destructive">Discrepancy Detected</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Difference between bank statement and calculated balance
                </p>
              </div>
              <p className="text-2xl font-bold font-mono text-destructive">
                {formatCurrency(Math.abs(data.discrepancy))}
              </p>
            </div>
          </div>
        )}

        <Separator />

        {/* Match Progress */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Transactions Matched</span>
            <span className="font-medium">
              {matchedItems} / {data.items.length}
            </span>
          </div>
          <Progress value={matchPercentage} className="h-2" />
          <p className="text-xs text-muted-foreground text-right">
            {matchPercentage.toFixed(1)}% matched
          </p>
        </div>

        <Separator />

        {/* Period Details */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Period Start</p>
            <p className="font-medium">
              {new Date(data.periodStart).toLocaleDateString('en-ZA', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Period End</p>
            <p className="font-medium">
              {new Date(data.periodEnd).toLocaleDateString('en-ZA', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Opening Balance</p>
            <p className="font-medium font-mono">{formatCurrency(data.openingBalance)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Closing Balance</p>
            <p className="font-medium font-mono">{formatCurrency(data.closingBalance)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
