'use client';

/**
 * TASK-ACCT-UI-005: Quote Data Table Columns
 * Column definitions for the quotes data table.
 */

import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { format } from 'date-fns';
import { MoreHorizontal, Eye, Send, Pencil, CheckCircle, XCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/tables/data-table-column-header';
import { QuoteStatusBadge } from './quote-status-badge';
import { formatCurrency } from '@/lib/utils';
import type { Quote } from '@/hooks/use-quotes';

interface QuoteColumnsOptions {
  onSend?: (quote: Quote) => void;
  onAccept?: (quote: Quote) => void;
  onDecline?: (quote: Quote) => void;
  onConvert?: (quote: Quote) => void;
}

export function createQuoteColumns(options: QuoteColumnsOptions = {}): ColumnDef<Quote>[] {
  return [
    {
      accessorKey: 'quoteNumber',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Quote #" />,
      cell: ({ row }) => (
        <Link
          href={`/accounting/quotes/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.getValue('quoteNumber')}
        </Link>
      ),
    },
    {
      accessorKey: 'recipientName',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Recipient" />,
      cell: ({ row }) => (
        <div>
          <div className="font-medium">{row.original.recipientName}</div>
          <div className="text-sm text-muted-foreground">{row.original.recipientEmail}</div>
        </div>
      ),
    },
    {
      accessorKey: 'childName',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Child" />,
      cell: ({ row }) =>
        row.original.childName || <span className="text-muted-foreground">-</span>,
    },
    {
      accessorKey: 'quoteDate',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
      cell: ({ row }) => format(new Date(row.getValue('quoteDate')), 'dd MMM yyyy'),
    },
    {
      accessorKey: 'expiryDate',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Expires" />,
      cell: ({ row }) => {
        const expiry = new Date(row.getValue('expiryDate'));
        const isExpired = expiry < new Date() && row.original.status !== 'CONVERTED' && row.original.status !== 'ACCEPTED';
        return (
          <span className={isExpired ? 'text-red-600' : ''}>
            {format(expiry, 'dd MMM yyyy')}
          </span>
        );
      },
    },
    {
      accessorKey: 'totalCents',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Total" />,
      cell: ({ row }) => (
        <span className="font-mono">{formatCurrency(row.getValue<number>('totalCents') / 100)}</span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => <QuoteStatusBadge status={row.getValue('status')} />,
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const quote = row.original;
        const canSend = quote.status === 'DRAFT';
        const canEdit = quote.status === 'DRAFT';
        const canAccept = quote.status === 'SENT' || quote.status === 'VIEWED';
        const canDecline = quote.status === 'SENT' || quote.status === 'VIEWED';
        const canConvert = quote.status === 'ACCEPTED';

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/accounting/quotes/${quote.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              {canEdit && (
                <DropdownMenuItem asChild>
                  <Link href={`/accounting/quotes/${quote.id}/edit`}>
                    <Pencil className="mr-2 h-4 w-4" />
                    Edit
                  </Link>
                </DropdownMenuItem>
              )}
              {canSend && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => options.onSend?.(quote)}>
                    <Send className="mr-2 h-4 w-4" />
                    Send Quote
                  </DropdownMenuItem>
                </>
              )}
              {(canAccept || canDecline) && <DropdownMenuSeparator />}
              {canAccept && (
                <DropdownMenuItem onClick={() => options.onAccept?.(quote)}>
                  <CheckCircle className="mr-2 h-4 w-4 text-emerald-600" />
                  Mark Accepted
                </DropdownMenuItem>
              )}
              {canDecline && (
                <DropdownMenuItem onClick={() => options.onDecline?.(quote)}>
                  <XCircle className="mr-2 h-4 w-4 text-red-600" />
                  Mark Declined
                </DropdownMenuItem>
              )}
              {canConvert && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => options.onConvert?.(quote)}>
                    <ArrowRight className="mr-2 h-4 w-4 text-blue-600" />
                    Convert to Invoice
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

// Default export for simple usage without actions
export const quoteColumns = createQuoteColumns();
