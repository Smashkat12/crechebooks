/**
 * Impact Preview Component
 * TASK-EC-002: Conflicting Correction Resolution UI
 *
 * Shows a preview of transactions that will be affected by the resolution.
 */

import * as React from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import { useTransactionsByIds } from '@/hooks/use-transactions';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { ConflictResolutionType } from './ConflictingCorrectionModal';

export interface ImpactPreviewProps {
  affectedTransactionIds: string[];
  resolution: ConflictResolutionType;
}

export function ImpactPreview({ affectedTransactionIds, resolution }: ImpactPreviewProps) {
  const { data: transactions, isLoading, isError } = useTransactionsByIds(affectedTransactionIds);

  if (isLoading) {
    return (
      <div className="space-y-2 border rounded-lg p-4">
        <p className="text-sm font-medium mb-3">Loading affected transactions...</p>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (isError || !transactions) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>Failed to load transaction preview</AlertDescription>
      </Alert>
    );
  }

  const getImpactDescription = () => {
    switch (resolution) {
      case 'update_all':
        return `All ${transactions.length} transactions will be recategorized`;
      case 'just_this_one':
        return 'Only the current transaction will be affected';
      case 'split_by_amount':
        return 'Transactions will be split based on amount threshold';
      case 'split_by_description':
        return 'Transactions will be split based on description patterns';
      default:
        return '';
    }
  };

  return (
    <div className="space-y-3 border rounded-lg p-4 bg-muted/50">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Affected Transactions</p>
        <span className="text-xs text-muted-foreground">{getImpactDescription()}</span>
      </div>

      <ScrollArea className="h-[200px] w-full rounded-md border bg-background">
        <div className="p-3 space-y-2">
          {transactions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No transactions found
            </p>
          ) : (
            transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="flex items-center justify-between p-2 rounded-md border bg-card hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {transaction.description}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(new Date(transaction.date))}
                  </p>
                </div>
                <div className="text-right ml-4">
                  <p
                    className={`text-sm font-medium ${
                      transaction.type === 'CREDIT' ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    {transaction.type === 'CREDIT' ? '+' : '-'}
                    {formatCurrency(transaction.amount / 100)}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </ScrollArea>

      {resolution === 'update_all' && transactions.length > 0 && (
        <Alert>
          <AlertDescription className="text-xs">
            Note: This will recategorize all historical transactions. This action affects your
            financial reports and cannot be undone automatically.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
