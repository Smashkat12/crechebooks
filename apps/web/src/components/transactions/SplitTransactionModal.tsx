/**
 * Split Transaction Modal Component
 *
 * Allows users to split a single transaction across multiple categories
 * with real-time validation ensuring splits equal the transaction total.
 *
 * Requirements:
 * - REQ-TRANS-009: Split transaction support
 * - AC-TRANS-004a: Allocate portions to different categories
 * - AC-TRANS-004b: Validate split amounts equal transaction total
 * - EC-TRANS-005: Validation error when amounts don't match
 */

import * as React from 'react';
import Decimal from 'decimal.js';
import { ITransaction } from '@crechebooks/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Plus, Loader2 } from 'lucide-react';
import { SplitRowInput } from './SplitRowInput';
import { SplitSummary } from './SplitSummary';
import { useSplitTransaction } from '@/hooks/useSplitTransaction';
import { formatCurrency } from '@/lib/utils';

export interface SplitRow {
  id: string;
  categoryId: string;
  categoryName: string;
  amount: string;
  description?: string;
}

export interface SplitTransactionModalProps {
  transaction: ITransaction;
  isOpen: boolean;
  onClose: () => void;
  onSave: (splits: SplitRow[]) => Promise<void>;
}

export function SplitTransactionModal({
  transaction,
  isOpen,
  onClose,
  onSave,
}: SplitTransactionModalProps) {
  const {
    splits,
    addSplit,
    removeSplit,
    updateSplit,
    total,
    remaining,
    isValid,
    validationError,
    saveSplits,
    isLoading,
  } = useSplitTransaction(transaction.id, transaction.amount);

  // Reset when dialog closes
  React.useEffect(() => {
    if (!isOpen) {
      // Hook handles cleanup internally
    }
  }, [isOpen]);

  // Check if transaction is already reconciled
  const isReconciled = transaction.reconciled;
  const transactionAmount = new Decimal(transaction.amount).div(100).abs();

  const handleSave = async () => {
    if (!isValid) {
      throw new Error('Cannot save invalid split configuration');
    }

    try {
      await saveSplits();
      await onSave(splits);
      onClose();
    } catch (error) {
      console.error('Failed to save splits:', error);
      throw error; // Re-throw to show error to user (fail fast)
    }
  };

  const handleAddSplit = () => {
    // Calculate suggested amount for new split
    const remainingAmount = remaining.toString();
    addSplit(remainingAmount);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Split Transaction</DialogTitle>
          <DialogDescription>
            Divide this transaction across multiple categories. Split amounts must equal the
            transaction total.
          </DialogDescription>
        </DialogHeader>

        {/* Transaction Details */}
        <div className="space-y-4 py-4">
          <div className="rounded-lg border p-4 bg-muted/50">
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="font-medium text-muted-foreground">Description</p>
                <p className="font-medium">{transaction.description}</p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Date</p>
                <p className="font-medium">
                  {new Date(transaction.date).toLocaleDateString('en-ZA')}
                </p>
              </div>
              <div>
                <p className="font-medium text-muted-foreground">Amount</p>
                <p className="text-lg font-bold">
                  {formatCurrency(transactionAmount.toNumber())}
                </p>
              </div>
            </div>
          </div>

          {/* Reconciled Warning */}
          {isReconciled && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This transaction has already been reconciled. Splitting it may affect your
                reconciliation records. Please ensure you understand the implications before
                proceeding.
              </AlertDescription>
            </Alert>
          )}

          {/* Split Rows */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Split Allocations</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddSplit}
                disabled={splits.length >= 10 || isLoading}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Split
              </Button>
            </div>

            {splits.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <p>No splits yet. Click &quot;Add Split&quot; to begin.</p>
              </div>
            )}

            {splits.map((split, index) => (
              <SplitRowInput
                key={split.id}
                split={split}
                index={index}
                onUpdate={(updates) => updateSplit(split.id, updates)}
                onRemove={() => removeSplit(split.id)}
                disabled={isLoading}
                canRemove={splits.length > 2}
              />
            ))}

            {splits.length > 0 && splits.length < 2 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  A split transaction requires at least 2 allocations. Add another split to
                  continue.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Summary */}
          {splits.length > 0 && (
            <SplitSummary
              transactionAmount={transactionAmount}
              total={total}
              remaining={remaining}
              isValid={isValid}
            />
          )}

          {/* Validation Error */}
          {validationError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{validationError}</AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!isValid || splits.length < 2 || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Split'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
