/**
 * Split Summary Component
 *
 * Displays real-time summary of split transaction with:
 * - Transaction total
 * - Sum of splits
 * - Remaining amount to allocate
 * - Visual validation feedback
 */

import * as React from 'react';
import Decimal from 'decimal.js';
import { CheckCircle2, XCircle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface SplitSummaryProps {
  transactionAmount: Decimal;
  total: Decimal;
  remaining: Decimal;
  isValid: boolean;
}

export function SplitSummary({
  transactionAmount,
  total,
  remaining,
  isValid,
}: SplitSummaryProps) {
  const isOver = total.greaterThan(transactionAmount);
  const isUnder = total.lessThan(transactionAmount);

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
      <h4 className="font-semibold text-sm">Summary</h4>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <p className="text-muted-foreground">Transaction Amount</p>
          <p className="font-semibold text-lg">
            {formatCurrency(transactionAmount.toNumber())}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground">Split Total</p>
          <p className={`font-semibold text-lg ${
            isValid ? 'text-green-600' : isOver ? 'text-red-600' : 'text-yellow-600'
          }`}>
            {formatCurrency(total.toNumber())}
          </p>
        </div>
      </div>

      <div className="pt-2 border-t">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Remaining</p>
          <p className={`text-lg font-bold ${
            remaining.isZero() ? 'text-green-600' : 'text-yellow-600'
          }`}>
            {formatCurrency(remaining.abs().toNumber())}
          </p>
        </div>
      </div>

      {/* Validation Status */}
      <div className="pt-2 border-t">
        {isValid ? (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle2 className="h-5 w-5" />
            <span className="text-sm font-medium">
              Split amounts match transaction total
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-destructive">
            <XCircle className="h-5 w-5" />
            <span className="text-sm font-medium">
              {isOver && `Over by ${formatCurrency(remaining.abs().toNumber())}`}
              {isUnder && `Under by ${formatCurrency(remaining.abs().toNumber())}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
