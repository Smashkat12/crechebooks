/**
 * Categorization Dialog Component
 *
 * Modal dialog for AI-assisted transaction categorization with:
 * - Transaction details display
 * - AI suggestion with confidence score
 * - Category dropdown to override suggestion
 * - Notes field for user comments
 * - Save/Cancel actions
 */

import * as React from 'react';
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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Sparkles, AlertCircle } from 'lucide-react';
import { CategorySelect } from './category-select';
import { ConfidenceBadge } from './confidence-badge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useCategorizeTransaction } from '@/hooks/use-transactions';

interface CategorizationDialogProps {
  transaction: ITransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CategorizationDialog({
  transaction,
  open,
  onOpenChange,
  onSuccess,
}: CategorizationDialogProps) {
  const [selectedCategory, setSelectedCategory] = React.useState<string>('');
  const [notes, setNotes] = React.useState('');

  const categorizeTransaction = useCategorizeTransaction();

  // Reset form when dialog opens/closes or transaction changes
  React.useEffect(() => {
    if (transaction && open) {
      setSelectedCategory(transaction.categoryId || '');
      setNotes('');
    } else {
      setSelectedCategory('');
      setNotes('');
    }
  }, [transaction, open]);

  if (!transaction) return null;

  const hasAiSuggestion = transaction.categoryId && transaction.confidence;
  const isLowConfidence = transaction.confidence !== undefined && transaction.confidence < 0.5;

  const handleSave = async () => {
    if (!selectedCategory) return;

    try {
      await categorizeTransaction.mutateAsync({
        transactionId: transaction.id,
        categoryId: selectedCategory,
        confidence: transaction.confidence || 1.0,
        notes: notes || undefined,
      });

      onOpenChange(false);
      onSuccess?.();
    } catch (error) {
      console.error('Failed to categorize transaction:', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Categorize Transaction</DialogTitle>
          <DialogDescription>
            Review and confirm the AI categorization or select a different category.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Transaction Details */}
          <div className="space-y-3 rounded-lg border p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Date</p>
                <p className="text-sm">{formatDate(transaction.date)}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Amount</p>
                <p className={`text-sm font-medium ${
                  transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {formatCurrency(Math.abs(transaction.amount / 100))}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Description</p>
              <p className="text-sm">{transaction.description}</p>
            </div>
          </div>

          {/* AI Suggestion */}
          {hasAiSuggestion && (
            <Alert>
              <Sparkles className="h-4 w-4" />
              <AlertDescription>
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-medium">AI Suggestion</p>
                    <p className="text-sm text-muted-foreground">
                      {transaction.accountCode || transaction.categoryId}
                    </p>
                  </div>
                  <ConfidenceBadge confidence={transaction.confidence || 0} />
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Low Confidence Warning */}
          {isLowConfidence && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Low confidence categorization. Please review and confirm the category is correct.
              </AlertDescription>
            </Alert>
          )}

          {/* Category Selection */}
          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <CategorySelect
              value={selectedCategory}
              onValueChange={setSelectedCategory}
              placeholder="Select a category..."
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notes (Optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any additional notes about this categorization..."
              value={notes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={categorizeTransaction.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={!selectedCategory || categorizeTransaction.isPending}
          >
            {categorizeTransaction.isPending ? 'Saving...' : 'Save Category'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
