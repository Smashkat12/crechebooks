/**
 * Transaction Table Column Definitions
 *
 * Defines columns for the transactions DataTable:
 * - Date, Description, Amount, Category, Status, Confidence, Actions
 */

import { ColumnDef } from '@tanstack/react-table';
import { ITransaction, TransactionStatus, TransactionType } from '@crechebooks/types';
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
import { MoreHorizontal, Eye, Edit, Trash2, Split } from 'lucide-react';
import { ConfidenceBadge } from './confidence-badge';
import { CategorizationReasoning } from './CategorizationReasoning';
import { formatCurrency, formatDate } from '@/lib/utils';

interface TransactionActionsProps {
  transaction: ITransaction;
  onView?: (transaction: ITransaction) => void;
  onEdit?: (transaction: ITransaction) => void;
  onSplit?: (transaction: ITransaction) => void;
  onDelete?: (transaction: ITransaction) => void;
}

function TransactionActions({
  transaction,
  onView,
  onEdit,
  onSplit,
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
        {onSplit && (
          <DropdownMenuItem onClick={() => onSplit(transaction)}>
            <Split className="mr-2 h-4 w-4" />
            Split Transaction
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

function StatusBadge({ status }: { status: TransactionStatus | string }) {
  const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
    // Uppercase (from API/enum)
    CATEGORIZED: { label: 'Categorized', variant: 'default' },
    PENDING: { label: 'Pending', variant: 'secondary' },
    RECONCILED: { label: 'Reconciled', variant: 'default' },
    NEEDS_REVIEW: { label: 'Needs Review', variant: 'destructive' },
    // Lowercase fallback
    categorized: { label: 'Categorized', variant: 'default' },
    pending: { label: 'Pending', variant: 'secondary' },
    reconciled: { label: 'Reconciled', variant: 'default' },
    needs_review: { label: 'Needs Review', variant: 'destructive' },
  };

  const statusStr = typeof status === 'string' ? status : String(status);
  const config = statusConfig[statusStr] || { label: statusStr, variant: 'secondary' as const };

  return (
    <Badge variant={config.variant}>
      {config.label}
    </Badge>
  );
}

export interface TransactionColumnOptions {
  onView?: (transaction: ITransaction) => void;
  onEdit?: (transaction: ITransaction) => void;
  onSplit?: (transaction: ITransaction) => void;
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
        const amountCents = row.getValue('amount') as number;
        const type = row.original.type as string;
        const isCredit = type === 'CREDIT';
        // Amount is stored in cents, convert to rand for display
        const amountRand = amountCents / 100;
        return (
          <div className={isCredit ? 'text-green-600' : 'text-red-600'}>
            {isCredit ? '+' : '-'}{formatCurrency(Math.abs(amountRand))}
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
        const reasoning = (row.original as any).categorizationReasoning as string | undefined;
        const confidence = row.getValue('confidence') as number | undefined;
        const alternatives = (row.original as any).categorizationAlternatives as Array<{ category: string; confidence: number }> | undefined;
        const matchedPatterns = (row.original as any).matchedPatterns as string[] | undefined;

        if (!code && !categoryId) {
          return <span className="text-muted-foreground">Uncategorized</span>;
        }

        return (
          <div className="flex items-center gap-2 max-w-[250px]">
            <div className="flex-1 truncate" title={code || categoryId || ''}>
              {code || categoryId}
            </div>
            {reasoning && confidence !== undefined && (
              <CategorizationReasoning
                reasoning={reasoning}
                confidence={confidence}
                alternatives={alternatives}
                matchedPatterns={matchedPatterns}
                mode="compact"
              />
            )}
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
          onSplit={options.onSplit}
          onDelete={options.onDelete}
        />
      ),
    },
  ];
}
