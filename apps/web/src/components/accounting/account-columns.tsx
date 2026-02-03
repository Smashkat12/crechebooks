'use client';

/**
 * TASK-ACCT-UI-001: Account Data Table Columns
 * Column definitions for the accounts data table.
 */

import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { MoreHorizontal, Pencil, Eye, XCircle, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/tables/data-table-column-header';
import { AccountTypeBadge } from './account-type-badge';
import type { Account } from '@/hooks/use-accounts';

interface AccountColumnsOptions {
  onDeactivate?: (id: string) => void;
  onReactivate?: (id: string) => void;
}

export function createAccountColumns(options: AccountColumnsOptions = {}): ColumnDef<Account>[] {
  return [
    {
      accessorKey: 'code',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Code" />,
      cell: ({ row }) => (
        <Link
          href={`/accounting/accounts/${row.original.id}`}
          className="font-mono font-medium hover:underline"
        >
          {row.getValue('code')}
        </Link>
      ),
    },
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{row.getValue('name')}</span>
          {row.original.isEducationExempt && (
            <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
              VAT Exempt
            </Badge>
          )}
          {row.original.isSystem && (
            <Badge variant="secondary" className="text-xs">
              System
            </Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'type',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Type" />,
      cell: ({ row }) => <AccountTypeBadge type={row.getValue('type')} />,
      filterFn: (row, id, value) => value.includes(row.getValue(id)),
    },
    {
      accessorKey: 'subType',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Sub Type" />,
      cell: ({ row }) => {
        const subType = row.getValue('subType') as string | null;
        return subType ? (
          <span className="text-sm text-muted-foreground">
            {subType.replace(/_/g, ' ')}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">-</span>
        );
      },
    },
    {
      accessorKey: 'isActive',
      header: 'Status',
      cell: ({ row }) => (
        <Badge variant={row.original.isActive ? 'default' : 'secondary'}>
          {row.original.isActive ? 'Active' : 'Inactive'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => {
        const account = row.original;

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
                <Link href={`/accounting/accounts/${account.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              {!account.isSystem && (
                <>
                  <DropdownMenuItem asChild>
                    <Link href={`/accounting/accounts/${account.id}/edit`}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {account.isActive ? (
                    <DropdownMenuItem
                      onClick={() => options.onDeactivate?.(account.id)}
                      className="text-destructive focus:text-destructive"
                    >
                      <XCircle className="mr-2 h-4 w-4" />
                      Deactivate
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={() => options.onReactivate?.(account.id)}>
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Reactivate
                    </DropdownMenuItem>
                  )}
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
export const accountColumns = createAccountColumns();
