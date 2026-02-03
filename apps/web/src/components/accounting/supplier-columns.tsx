'use client';

/**
 * TASK-ACCT-UI-004: Supplier Data Table Columns
 * Column definitions for the suppliers data table.
 */

import { ColumnDef } from '@tanstack/react-table';
import Link from 'next/link';
import { MoreHorizontal, Pencil, Eye, FileText, Receipt } from 'lucide-react';
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
import type { Supplier } from '@/hooks/use-suppliers';

interface SupplierColumnsOptions {
  onCreateBill?: (supplier: Supplier) => void;
}

export function createSupplierColumns(options: SupplierColumnsOptions = {}): ColumnDef<Supplier>[] {
  return [
    {
      accessorKey: 'name',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Supplier Name" />,
      cell: ({ row }) => (
        <Link
          href={`/accounting/suppliers/${row.original.id}`}
          className="font-medium hover:underline"
        >
          {row.getValue('name')}
        </Link>
      ),
    },
    {
      accessorKey: 'tradingName',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Trading As" />,
      cell: ({ row }) => {
        const tradingName = row.getValue('tradingName') as string | null;
        return tradingName ? (
          <span className="text-muted-foreground">{tradingName}</span>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      accessorKey: 'email',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Email" />,
      cell: ({ row }) => {
        const email = row.getValue('email') as string | null;
        return email ? (
          <a href={`mailto:${email}`} className="text-sm hover:underline">
            {email}
          </a>
        ) : (
          <span className="text-muted-foreground">-</span>
        );
      },
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => {
        const phone = row.getValue('phone') as string | null;
        return phone || <span className="text-muted-foreground">-</span>;
      },
    },
    {
      accessorKey: 'paymentTermsDays',
      header: ({ column }) => <DataTableColumnHeader column={column} title="Terms" />,
      cell: ({ row }) => {
        const days = row.getValue('paymentTermsDays') as number;
        return <span className="font-mono">{days} days</span>;
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
        const supplier = row.original;

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
                <Link href={`/accounting/suppliers/${supplier.id}`}>
                  <Eye className="mr-2 h-4 w-4" />
                  View
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/accounting/suppliers/${supplier.id}/edit`}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => options.onCreateBill?.(supplier)}>
                <Receipt className="mr-2 h-4 w-4" />
                Create Bill
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/accounting/suppliers/${supplier.id}/statement`}>
                  <FileText className="mr-2 h-4 w-4" />
                  Statement
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];
}

// Default export for simple usage without actions
export const supplierColumns = createSupplierColumns();
