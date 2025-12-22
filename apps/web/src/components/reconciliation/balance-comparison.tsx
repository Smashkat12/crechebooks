'use client';

import { ArrowRight, CheckCircle2, XCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface BalanceComparisonProps {
  bankBalance: number;
  accountingBalance: number;
  openingBalance: number;
  closingBalance: number;
  className?: string;
}

export function BalanceComparison({
  bankBalance,
  accountingBalance,
  openingBalance,
  closingBalance,
  className,
}: BalanceComparisonProps) {
  const difference = bankBalance - accountingBalance;
  const isReconciled = Math.abs(difference) < 0.01; // Within 1 cent tolerance
  const movement = closingBalance - openingBalance;

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Balance Comparison
          {isReconciled ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <XCircle className="h-5 w-5 text-destructive" />
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Main Comparison */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 p-4 rounded-lg bg-muted text-center">
            <p className="text-sm text-muted-foreground mb-1">Bank Statement</p>
            <p className="text-xl font-bold font-mono">{formatCurrency(bankBalance)}</p>
          </div>

          <ArrowRight className="h-6 w-6 text-muted-foreground flex-shrink-0" />

          <div className="flex-1 p-4 rounded-lg bg-muted text-center">
            <p className="text-sm text-muted-foreground mb-1">Accounting System</p>
            <p className="text-xl font-bold font-mono">{formatCurrency(accountingBalance)}</p>
          </div>
        </div>

        {/* Difference */}
        <div
          className={cn(
            'p-4 rounded-lg text-center',
            isReconciled ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          )}
        >
          <p className={cn('text-sm mb-1', isReconciled ? 'text-green-700' : 'text-red-700')}>
            {isReconciled ? 'Balances Match' : 'Difference'}
          </p>
          <p
            className={cn(
              'text-2xl font-bold font-mono',
              isReconciled ? 'text-green-700' : 'text-red-700'
            )}
          >
            {isReconciled ? 'R0.00' : formatCurrency(Math.abs(difference))}
          </p>
          {!isReconciled && (
            <p className="text-xs text-red-600 mt-1">
              {difference > 0 ? 'Bank shows more than books' : 'Books show more than bank'}
            </p>
          )}
        </div>

        {/* Movement Summary */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div className="text-center p-3 rounded-lg bg-muted">
            <p className="text-muted-foreground">Opening</p>
            <p className="font-mono font-medium">{formatCurrency(openingBalance)}</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted">
            <p className="text-muted-foreground">Movement</p>
            <p
              className={cn(
                'font-mono font-medium',
                movement >= 0 ? 'text-green-600' : 'text-red-600'
              )}
            >
              {movement >= 0 ? '+' : ''}
              {formatCurrency(movement)}
            </p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted">
            <p className="text-muted-foreground">Closing</p>
            <p className="font-mono font-medium">{formatCurrency(closingBalance)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
