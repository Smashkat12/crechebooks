/**
 * Transaction Detail Modal Component
 *
 * Displays full transaction details in a modal dialog.
 * Shows all transaction fields, categorization info, and status.
 *
 * Requirements:
 * - Display all transaction fields clearly
 * - Show categorization details with confidence
 * - Display reconciliation status
 * - Provide quick actions (Edit Category, Split)
 */

import * as React from 'react';
import { ITransaction, TransactionStatus, TransactionType } from '@crechebooks/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  Calendar,
  CreditCard,
  FileText,
  Hash,
  Tag,
  CheckCircle,
  AlertCircle,
  Clock,
  Percent,
  Edit,
  Split,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ConfidenceBadge } from './confidence-badge';

export interface TransactionDetailModalProps {
  transaction: ITransaction | null;
  isOpen: boolean;
  onClose: () => void;
  onEditCategory?: (transaction: ITransaction) => void;
  onSplitTransaction?: (transaction: ITransaction) => void;
}

function DetailRow({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-3 py-2 ${className || ''}`}>
      <Icon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <div className="text-sm font-medium mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: TransactionStatus | string }) {
  const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    CATEGORIZED: { label: 'Categorized', variant: 'default' },
    PENDING: { label: 'Pending', variant: 'secondary' },
    RECONCILED: { label: 'Reconciled', variant: 'default' },
    NEEDS_REVIEW: { label: 'Needs Review', variant: 'destructive' },
    categorized: { label: 'Categorized', variant: 'default' },
    pending: { label: 'Pending', variant: 'secondary' },
    reconciled: { label: 'Reconciled', variant: 'default' },
    needs_review: { label: 'Needs Review', variant: 'destructive' },
  };

  const statusStr = typeof status === 'string' ? status : String(status);
  const config = statusConfig[statusStr] || { label: statusStr, variant: 'outline' as const };

  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function TransactionDetailModal({
  transaction,
  isOpen,
  onClose,
  onEditCategory,
  onSplitTransaction,
}: TransactionDetailModalProps) {
  if (!transaction) {
    return null;
  }

  // Handle both enum values and string values from API
  const transactionType = String(transaction.type).toUpperCase();
  const isCredit = transactionType === 'CREDIT';
  const amountRand = Math.abs(transaction.amount) / 100;
  const formattedAmount = `${isCredit ? '+' : '-'}${formatCurrency(amountRand)}`;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Transaction Details</DialogTitle>
          <DialogDescription>
            Full details for this transaction
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Amount Section - Prominent Display */}
          <div className="rounded-lg border p-4 bg-muted/30">
            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-1">Amount</p>
              <p className={`text-3xl font-bold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                {formattedAmount}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {isCredit ? 'Credit (Income)' : 'Debit (Expense)'}
              </p>
            </div>
          </div>

          {/* Main Details */}
          <div className="space-y-1">
            <DetailRow
              icon={FileText}
              label="Description"
              value={transaction.description}
            />

            <DetailRow
              icon={Calendar}
              label="Date"
              value={formatDate(transaction.date)}
            />

            {transaction.reference && (
              <DetailRow
                icon={Hash}
                label="Reference"
                value={transaction.reference}
              />
            )}
          </div>

          <Separator />

          {/* Categorization Section */}
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Categorization
            </h4>

            <DetailRow
              icon={Tag}
              label="Category / Account Code"
              value={
                transaction.accountCode || transaction.categoryId ? (
                  <span className="font-mono">
                    {transaction.accountCode || transaction.categoryId}
                  </span>
                ) : (
                  <span className="text-muted-foreground italic">Uncategorized</span>
                )
              }
            />

            <DetailRow
              icon={Clock}
              label="Status"
              value={<StatusBadge status={transaction.status} />}
            />

            {transaction.confidence !== undefined && (
              <DetailRow
                icon={Percent}
                label="Confidence"
                value={<ConfidenceBadge confidence={transaction.confidence} />}
              />
            )}

            {transaction.needsReview && (
              <div className="flex items-center gap-2 p-2 rounded bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-yellow-700 dark:text-yellow-300">
                  This transaction needs manual review
                </span>
              </div>
            )}
          </div>

          <Separator />

          {/* Reconciliation Section */}
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Reconciliation
            </h4>

            <DetailRow
              icon={transaction.reconciled ? CheckCircle : Clock}
              label="Reconciliation Status"
              value={
                transaction.reconciled ? (
                  <Badge variant="default" className="bg-green-600">
                    Reconciled
                  </Badge>
                ) : (
                  <Badge variant="outline">Not Reconciled</Badge>
                )
              }
            />

            {transaction.reconciled && transaction.reconciledAt && (
              <DetailRow
                icon={Calendar}
                label="Reconciled At"
                value={formatDate(transaction.reconciledAt)}
              />
            )}
          </div>

          <Separator />

          {/* Technical Details */}
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Technical Details
            </h4>

            <DetailRow
              icon={CreditCard}
              label="Transaction ID"
              value={
                <span className="font-mono text-xs break-all">
                  {transaction.id}
                </span>
              }
            />

            {transaction.xeroTransactionId && (
              <DetailRow
                icon={Hash}
                label="Xero Transaction ID"
                value={
                  <span className="font-mono text-xs break-all">
                    {transaction.xeroTransactionId}
                  </span>
                }
              />
            )}

            {transaction.bankAccountId && (
              <DetailRow
                icon={CreditCard}
                label="Bank Account ID"
                value={
                  <span className="font-mono text-xs break-all">
                    {transaction.bankAccountId}
                  </span>
                }
              />
            )}
          </div>

          {/* Quick Actions */}
          {(onEditCategory || onSplitTransaction) && (
            <>
              <Separator />
              <div className="flex gap-2 pt-2">
                {onEditCategory && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onClose();
                      onEditCategory(transaction);
                    }}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Edit Category
                  </Button>
                )}
                {onSplitTransaction && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onClose();
                      onSplitTransaction(transaction);
                    }}
                  >
                    <Split className="h-4 w-4 mr-2" />
                    Split Transaction
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
