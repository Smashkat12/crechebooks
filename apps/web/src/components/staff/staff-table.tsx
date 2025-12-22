'use client';

import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, DollarSign, Calendar, Eye, Edit, Trash2 } from 'lucide-react';
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
import { DataTable } from '@/components/tables';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import type { IStaff, StaffStatus } from '@crechebooks/types';

interface StaffTableProps {
  staff: IStaff[];
  isLoading?: boolean;
  onView?: (staff: IStaff) => void;
  onEdit?: (staff: IStaff) => void;
  onDelete?: (staff: IStaff) => void;
}

const statusConfig: Record<StaffStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-green-100 text-green-800' },
  INACTIVE: { label: 'Inactive', className: 'bg-yellow-100 text-yellow-800' },
  TERMINATED: { label: 'Terminated', className: 'bg-red-100 text-red-800' },
};

export function StaffTable({
  staff,
  isLoading = false,
  onView,
  onEdit,
  onDelete,
}: StaffTableProps) {
  const columns: ColumnDef<IStaff>[] = [
    {
      accessorKey: 'employeeNumber',
      header: 'Emp #',
      cell: ({ row }) => (
        <span className="font-mono text-sm">{row.original.employeeNumber}</span>
      ),
    },
    {
      accessorKey: 'firstName',
      header: 'Name',
      cell: ({ row }) => (
        <div className="font-medium">
          {row.original.firstName} {row.original.lastName}
        </div>
      ),
    },
    {
      accessorKey: 'idNumber',
      header: 'ID Number',
      cell: ({ row }) => (
        <span className="font-mono text-sm">
          {row.original.idNumber.replace(/(\d{6})(\d{4})(\d{3})/, '$1 $2 $3')}
        </span>
      ),
    },
    {
      accessorKey: 'salary',
      header: 'Monthly Salary',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <span>{formatCurrency(row.original.salary / 100)}</span>
        </div>
      ),
    },
    {
      accessorKey: 'startDate',
      header: 'Start Date',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span>{formatDate(row.original.startDate)}</span>
        </div>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const config = statusConfig[row.original.status];
        return (
          <Badge variant="outline" className={config.className}>
            {config.label}
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {onView && (
              <DropdownMenuItem onClick={() => onView(row.original)}>
                <Eye className="mr-2 h-4 w-4" />
                View Details
              </DropdownMenuItem>
            )}
            {onEdit && (
              <DropdownMenuItem onClick={() => onEdit(row.original)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem
                onClick={() => onDelete(row.original)}
                className="text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Terminate
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={staff}
    />
  );
}
