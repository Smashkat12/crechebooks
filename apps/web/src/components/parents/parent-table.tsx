'use client';

import { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Mail, Phone, Users, Eye, Edit, Trash2 } from 'lucide-react';
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
import type { IParent, CommunicationMethod } from '@crechebooks/types';

interface ParentTableProps {
  parents: IParent[];
  isLoading?: boolean;
  onView?: (parent: IParent) => void;
  onEdit?: (parent: IParent) => void;
  onDelete?: (parent: IParent) => void;
}

const communicationLabels: Record<CommunicationMethod, string> = {
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
  SMS: 'SMS',
  BOTH: 'Both',
};

export function ParentTable({
  parents,
  isLoading = false,
  onView,
  onEdit,
  onDelete,
}: ParentTableProps) {
  const columns: ColumnDef<IParent>[] = [
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
      accessorKey: 'email',
      header: 'Email',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm">{row.original.email}</span>
        </div>
      ),
    },
    {
      accessorKey: 'phone',
      header: 'Phone',
      cell: ({ row }) => (
        row.original.phone ? (
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm">{row.original.phone}</span>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )
      ),
    },
    {
      accessorKey: 'children',
      header: 'Children',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>{row.original.children.length}</span>
        </div>
      ),
    },
    {
      accessorKey: 'preferredContact',
      header: 'Contact Method',
      cell: ({ row }) => (
        <Badge variant="outline">
          {communicationLabels[row.original.preferredContact]}
        </Badge>
      ),
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
                Delete
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
      data={parents}
    />
  );
}
