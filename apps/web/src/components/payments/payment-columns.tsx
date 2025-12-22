/**
 * Payment Table Column Definitions
 *
 * Defines columns for the payments DataTable:
 * - Date, Amount, Reference, Status, Matched Invoice, Confidence, Actions
 */

import { ColumnDef } from '@tanstack/react-table';
import { IPayment, PaymentStatus, MatchMethod } from '@crechebooks/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Eye, Link2, Unlink } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';

interface PaymentActionsProps {
  payment: IPayment;
  onView?: (payment: IPayment) => void;
  onMatch?: (payment: IPayment) => void;
  onUnmatch?: (payment: IPayment) => void;
}

function PaymentActions({
  payment,
  onView,
  onMatch,
  onUnmatch
}: PaymentActionsProps) {
  const isUnmatched = payment.status === PaymentStatus.UNMATCHED;
  const canUnmatch = payment.status === PaymentStatus.MATCHED ||
                     payment.status === PaymentStatus.PARTIALLY_MATCHED;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {onView && (
          <DropdownMenuItem onClick={() => onView(payment)}>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>
        )}
        {isUnmatched && onMatch && (
          <DropdownMenuItem onClick={() => onMatch(payment)}>
            <Link2 className="mr-2 h-4 w-4" />
            Match Payment
          </DropdownMenuItem>
        )}
        {canUnmatch && onUnmatch && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onUnmatch(payment)}
              className="text-destructive"
            >
              <Unlink className="mr-2 h-4 w-4" />
              Unmatch
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusBadge({ status }: { status: PaymentStatus }) {
  const statusConfig: Record<PaymentStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
    [PaymentStatus.UNMATCHED]: { label: 'Unmatched', variant: 'destructive' },
    [PaymentStatus.PARTIALLY_MATCHED]: { label: 'Partial', variant: 'outline' },
    [PaymentStatus.MATCHED]: { label: 'Matched', variant: 'default' },
    [PaymentStatus.ALLOCATED]: { label: 'Allocated', variant: 'default' },
  };

  const config = statusConfig[status];

  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  );
}

function ConfidenceBadge({ confidence }: { confidence?: number }) {
  if (confidence === undefined) {
    return <span className="text-muted-foreground text-sm">-</span>;
  }

  const variant =
    confidence >= 0.8
      ? 'default'
      : confidence >= 0.6
      ? 'outline'
      : 'secondary';

  return (
    <Badge variant={variant}>
      {Math.round(confidence * 100)}%
    </Badge>
  );
}

function MatchMethodBadge({ method }: { method?: MatchMethod }) {
  if (!method) return null;

  const methodLabels: Record<MatchMethod, string> = {
    [MatchMethod.EXACT]: 'Exact',
    [MatchMethod.REFERENCE]: 'Reference',
    [MatchMethod.AMOUNT]: 'Amount',
    [MatchMethod.AI]: 'AI',
    [MatchMethod.MANUAL]: 'Manual',
  };

  return (
    <span className="text-xs text-muted-foreground">
      {methodLabels[method]}
    </span>
  );
}

export interface PaymentColumnOptions {
  onView?: (payment: IPayment) => void;
  onMatch?: (payment: IPayment) => void;
  onUnmatch?: (payment: IPayment) => void;
}

export function getPaymentColumns(
  options: PaymentColumnOptions = {}
): ColumnDef<IPayment>[] {
  return [
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => formatDate(row.getValue('date')),
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }) => {
        const amount = row.getValue('amount') as number;
        return (
          <div className="font-medium">
            {formatCurrency(amount)}
          </div>
        );
      },
    },
    {
      accessorKey: 'reference',
      header: 'Reference',
      cell: ({ row }) => {
        const reference = row.getValue('reference') as string | undefined;
        return (
          <div className="max-w-[200px] truncate" title={reference || ''}>
            {reference || <span className="text-muted-foreground">-</span>}
          </div>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <StatusBadge status={row.getValue('status')} />
      ),
    },
    {
      id: 'matchedInvoice',
      header: 'Matched Invoice',
      cell: ({ row }) => {
        const payment = row.original;
        const hasAllocations = payment.allocations && payment.allocations.length > 0;

        if (!hasAllocations) {
          return <span className="text-muted-foreground text-sm">None</span>;
        }

        const allocationCount = payment.allocations.length;

        return (
          <div className="flex flex-col gap-1">
            <span className="text-sm">
              {allocationCount} invoice{allocationCount > 1 ? 's' : ''}
            </span>
            <MatchMethodBadge method={payment.matchedBy} />
          </div>
        );
      },
    },
    {
      accessorKey: 'matchConfidence',
      header: 'Confidence',
      cell: ({ row }) => {
        const confidence = row.getValue('matchConfidence') as number | undefined;
        return <ConfidenceBadge confidence={confidence} />;
      },
    },
    {
      id: 'unallocatedAmount',
      header: 'Unallocated',
      cell: ({ row }) => {
        const unallocated = row.original.unallocatedAmount;

        if (unallocated === 0) {
          return <span className="text-muted-foreground text-sm">-</span>;
        }

        return (
          <div className="text-amber-600 font-medium">
            {formatCurrency(unallocated)}
          </div>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <PaymentActions
          payment={row.original}
          onView={options.onView}
          onMatch={options.onMatch}
          onUnmatch={options.onUnmatch}
        />
      ),
    },
  ];
}
