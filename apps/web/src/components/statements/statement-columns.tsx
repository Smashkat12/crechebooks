'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { MoreHorizontal, Eye, Download, CheckCircle, Send } from 'lucide-react';
import type { StatementSummary, StatementStatus } from '@/hooks/use-statements';
import { formatCentsToRands } from '@/hooks/use-statements';

const statusVariants: Record<StatementStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  DRAFT: 'secondary',
  FINAL: 'default',
  DELIVERED: 'outline',
  CANCELLED: 'destructive',
};

const statusLabels: Record<StatementStatus, string> = {
  DRAFT: 'Draft',
  FINAL: 'Final',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
};

interface CreateColumnsOptions {
  onView: (statement: StatementSummary) => void;
  onDownload: (statement: StatementSummary) => void;
  onFinalize: (statement: StatementSummary) => void;
  onSend: (statement: StatementSummary) => void;
}

export function createStatementColumns({
  onView,
  onDownload,
  onFinalize,
  onSend,
}: CreateColumnsOptions): ColumnDef<StatementSummary>[] {
  return [
    {
      accessorKey: 'statement_number',
      header: 'Statement #',
      cell: ({ row }) => (
        <span className="font-medium">{row.original.statement_number}</span>
      ),
    },
    {
      accessorKey: 'parent',
      header: 'Parent',
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.parent.name}</div>
          {row.original.parent.email && (
            <div className="text-sm text-muted-foreground">{row.original.parent.email}</div>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'period',
      header: 'Period',
      cell: ({ row }) => {
        const start = new Date(row.original.period_start).toLocaleDateString('en-ZA', {
          day: 'numeric',
          month: 'short',
        });
        const end = new Date(row.original.period_end).toLocaleDateString('en-ZA', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        });
        return `${start} - ${end}`;
      },
    },
    {
      accessorKey: 'opening_balance_cents',
      header: 'Opening',
      cell: ({ row }) => formatCentsToRands(row.original.opening_balance_cents),
    },
    {
      accessorKey: 'total_charges_cents',
      header: 'Charges',
      cell: ({ row }) => (
        <span className="text-red-600">
          {formatCentsToRands(row.original.total_charges_cents)}
        </span>
      ),
    },
    {
      accessorKey: 'total_payments_cents',
      header: 'Payments',
      cell: ({ row }) => (
        <span className="text-green-600">
          {formatCentsToRands(row.original.total_payments_cents)}
        </span>
      ),
    },
    {
      accessorKey: 'closing_balance_cents',
      header: 'Closing',
      cell: ({ row }) => {
        const balance = row.original.closing_balance_cents;
        return (
          <span className={balance > 0 ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
            {formatCentsToRands(balance)}
          </span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={statusVariants[row.original.status]}>
          {statusLabels[row.original.status]}
        </Badge>
      ),
    },
    {
      accessorKey: 'generated_at',
      header: 'Generated',
      cell: ({ row }) =>
        new Date(row.original.generated_at).toLocaleDateString('en-ZA', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const statement = row.original;
        const isDraft = statement.status === 'DRAFT';
        const isFinal = statement.status === 'FINAL';

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
              <DropdownMenuItem onClick={() => onView(statement)}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onDownload(statement)}>
                <Download className="mr-2 h-4 w-4" />
                Download PDF
              </DropdownMenuItem>
              {isDraft && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onFinalize(statement)}>
                    <CheckCircle className="mr-2 h-4 w-4" />
                    Finalize
                  </DropdownMenuItem>
                </>
              )}
              {isFinal && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onSend(statement)}>
                    <Send className="mr-2 h-4 w-4" />
                    Send to Parent
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}
