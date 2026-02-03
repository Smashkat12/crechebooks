'use client';

/**
 * TASK-ACCT-UI-002: Journal Entry Table Columns
 * Column definitions for the journal entry data table.
 */

import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { format } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { DataTableColumnHeader } from '@/components/tables/data-table-column-header';
import type { JournalEntry, SourceType } from '@/hooks/use-general-ledger';

/**
 * Format amount in ZAR (South African Rand)
 * Values are in cents, convert to Rand for display
 */
function formatZAR(cents: number): string {
  const rands = cents / 100;
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(rands);
}

const SOURCE_COLORS: Record<SourceType, string> = {
  CATEGORIZATION: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  PAYROLL: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  INVOICE: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  PAYMENT: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  MANUAL: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
};

const SOURCE_LABELS: Record<SourceType, string> = {
  CATEGORIZATION: 'Categorization',
  PAYROLL: 'Payroll',
  INVOICE: 'Invoice',
  PAYMENT: 'Payment',
  MANUAL: 'Manual',
};

export const journalEntryColumns: ColumnDef<JournalEntry>[] = [
  {
    accessorKey: 'date',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    cell: ({ row }) => {
      const dateValue = row.getValue('date') as string;
      return <span className="whitespace-nowrap">{format(new Date(dateValue), 'dd/MM/yyyy')}</span>;
    },
  },
  {
    accessorKey: 'accountCode',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Account" />,
    cell: ({ row }) => (
      <Link
        href={`/accounting/general-ledger/${row.original.accountCode}`}
        className="font-mono text-sm hover:underline text-primary"
      >
        {row.original.accountCode}
      </Link>
    ),
  },
  {
    accessorKey: 'accountName',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Account Name" />,
    cell: ({ row }) => (
      <span className="text-sm">{row.getValue('accountName')}</span>
    ),
  },
  {
    accessorKey: 'description',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
    cell: ({ row }) => (
      <div className="max-w-[300px] truncate text-sm" title={row.getValue('description') as string}>
        {row.getValue('description')}
      </div>
    ),
  },
  {
    accessorKey: 'debitCents',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Debit" className="text-right" />
    ),
    cell: ({ row }) => {
      const amount = row.getValue('debitCents') as number;
      return amount > 0 ? (
        <span className="font-mono text-sm text-right block tabular-nums">{formatZAR(amount)}</span>
      ) : (
        <span className="text-muted-foreground text-right block">-</span>
      );
    },
  },
  {
    accessorKey: 'creditCents',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Credit" className="text-right" />
    ),
    cell: ({ row }) => {
      const amount = row.getValue('creditCents') as number;
      return amount > 0 ? (
        <span className="font-mono text-sm text-right block tabular-nums">{formatZAR(amount)}</span>
      ) : (
        <span className="text-muted-foreground text-right block">-</span>
      );
    },
  },
  {
    accessorKey: 'sourceType',
    header: 'Source',
    cell: ({ row }) => {
      const source = row.getValue('sourceType') as SourceType;
      return (
        <Badge className={SOURCE_COLORS[source]} variant="outline">
          {SOURCE_LABELS[source]}
        </Badge>
      );
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id));
    },
  },
  {
    accessorKey: 'reference',
    header: 'Reference',
    cell: ({ row }) => {
      const ref = row.getValue('reference') as string | undefined;
      return ref ? (
        <span className="text-sm font-mono">{ref}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    },
  },
];

/**
 * Columns for account ledger view (without account code/name columns)
 */
export const accountLedgerColumns: ColumnDef<JournalEntry>[] = [
  {
    accessorKey: 'date',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Date" />,
    cell: ({ row }) => {
      const dateValue = row.getValue('date') as string;
      return <span className="whitespace-nowrap">{format(new Date(dateValue), 'dd/MM/yyyy')}</span>;
    },
  },
  {
    accessorKey: 'description',
    header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
    cell: ({ row }) => (
      <div className="max-w-[400px] truncate text-sm" title={row.getValue('description') as string}>
        {row.getValue('description')}
      </div>
    ),
  },
  {
    accessorKey: 'debitCents',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Debit" className="text-right" />
    ),
    cell: ({ row }) => {
      const amount = row.getValue('debitCents') as number;
      return amount > 0 ? (
        <span className="font-mono text-sm text-right block tabular-nums">{formatZAR(amount)}</span>
      ) : (
        <span className="text-muted-foreground text-right block">-</span>
      );
    },
  },
  {
    accessorKey: 'creditCents',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Credit" className="text-right" />
    ),
    cell: ({ row }) => {
      const amount = row.getValue('creditCents') as number;
      return amount > 0 ? (
        <span className="font-mono text-sm text-right block tabular-nums">{formatZAR(amount)}</span>
      ) : (
        <span className="text-muted-foreground text-right block">-</span>
      );
    },
  },
  {
    accessorKey: 'sourceType',
    header: 'Source',
    cell: ({ row }) => {
      const source = row.getValue('sourceType') as SourceType;
      return (
        <Badge className={SOURCE_COLORS[source]} variant="outline">
          {SOURCE_LABELS[source]}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'reference',
    header: 'Reference',
    cell: ({ row }) => {
      const ref = row.getValue('reference') as string | undefined;
      return ref ? (
        <span className="text-sm font-mono">{ref}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      );
    },
  },
];
