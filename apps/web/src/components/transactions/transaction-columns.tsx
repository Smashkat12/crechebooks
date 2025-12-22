/**
 * Transaction Table Column Definitions
 *
 * Defines columns for the transactions DataTable:
 * - Date, Description, Amount, Category, Status, Confidence, Actions
 */

import { ColumnDef } from '@tanstack/react-table';
import { ITransaction, TransactionStatus } from '@crechebooks/types';
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
import { MoreHorizontal, Eye, Edit, Trash2 } from 'lucide-react';
import { ConfidenceBadge } from './confidence-badge';
import { formatCurrency, formatDate } from '@/lib/utils';

interface TransactionActionsProps {
  transaction: ITransaction;
  onView?: (transaction: ITransaction) => void;
  onEdit?: (transaction: ITransaction) => void;
  onDelete?: (transaction: ITransaction) => void;
}

function TransactionActions({
  transaction,
  onView,
  onEdit,
  onDelete
}: TransactionActionsProps) {
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
          <DropdownMenuItem onClick={() => onView(transaction)}>
            <Eye className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>
        )}
        {onEdit && (
          <DropdownMenuItem onClick={() => onEdit(transaction)}>
            <Edit className="mr-2 h-4 w-4" />
            Edit Category
          </DropdownMenuItem>
        )}
        {onDelete && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(transaction)}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusBadge({ status }: { status: TransactionStatus }) {
  const statusConfig: Record<TransactionStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
    [TransactionStatus.CATEGORIZED]: { label: 'Categorized', variant: 'default' },
    [TransactionStatus.PENDING]: { label: 'Pending', variant: 'secondary' },
    [TransactionStatus.RECONCILED]: { label: 'Reconciled', variant: 'default' },
    [TransactionStatus.NEEDS_REVIEW]: { label: 'Needs Review', variant: 'destructive' },
  };

  const config = statusConfig[status];

  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  );
}

export interface TransactionColumnOptions {
  onView?: (transaction: ITransaction) => void;
  onEdit?: (transaction: ITransaction) => void;
  onDelete?: (transaction: ITransaction) => void;
}

export function getTransactionColumns(
  options: TransactionColumnOptions = {}
): ColumnDef<ITransaction>[] {
  return [
    {
      accessorKey: 'date',
      header: 'Date',
      cell: ({ row }) => formatDate(row.getValue('date')),
    },
    {
      accessorKey: 'description',
      header: 'Description',
      cell: ({ row }) => {
        const description = row.getValue('description') as string;
        return (
          <div className="max-w-[300px] truncate" title={description}>
            {description}
          </div>
        );
      },
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: ({ row }) => {
        const amount = row.getValue('amount') as number;
        return (
          <div className={amount >= 0 ? 'text-green-600' : 'text-red-600'}>
            {formatCurrency(Math.abs(amount))}
          </div>
        );
      },
    },
    {
      accessorKey: 'accountCode',
      header: 'Category',
      cell: ({ row }) => {
        const code = row.getValue('accountCode') as string | null;
        const categoryId = row.original.categoryId;

        if (!code && !categoryId) {
          return <span className="text-muted-foreground">Uncategorized</span>;
        }

        return (
          <div className="max-w-[200px] truncate" title={code || categoryId || ''}>
            {code || categoryId}
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
      accessorKey: 'confidence',
      header: 'Confidence',
      cell: ({ row }) => {
        const confidence = row.getValue('confidence') as number | undefined;

        if (confidence === undefined) {
          return <span className="text-muted-foreground">-</span>;
        }

        return <ConfidenceBadge confidence={confidence} />;
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <TransactionActions
          transaction={row.original}
          onView={options.onView}
          onEdit={options.onEdit}
          onDelete={options.onDelete}
        />
      ),
    },
  ];
}
