"use client";

import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AgingBadge } from "./aging-badge";
import { formatCurrency, formatDate } from "@/lib/utils";

export interface ArrearsRow {
  id: string;
  parentId: string;
  parentName: string;
  parentEmail: string;
  childrenCount: number;
  totalOutstanding: number;
  agingBand: "current" | "1-30" | "31-60" | "61-90" | "90+";
  lastPaymentDate: string | null;
  lastReminderDate: string | null;
  oldestInvoiceDate: string;
}

interface ArrearsColumnsProps {
  onViewDetails: (parentId: string) => void;
  onSendReminder: (parentId: string) => void;
}

export const createArrearsColumns = ({
  onViewDetails,
  onSendReminder,
}: ArrearsColumnsProps): ColumnDef<ArrearsRow>[] => [
  {
    accessorKey: "parentName",
    header: "Parent",
    cell: ({ row }) => {
      const parentName = row.getValue("parentName") as string;
      const parentEmail = row.original.parentEmail;
      return (
        <div className="flex flex-col">
          <span className="font-medium">{parentName}</span>
          <span className="text-sm text-muted-foreground">{parentEmail}</span>
        </div>
      );
    },
  },
  {
    accessorKey: "childrenCount",
    header: "Children",
    cell: ({ row }) => {
      const count = row.getValue("childrenCount") as number;
      return <span>{count}</span>;
    },
  },
  {
    accessorKey: "totalOutstanding",
    header: "Total Outstanding",
    cell: ({ row }) => {
      const amount = row.getValue("totalOutstanding") as number;
      return (
        <span className="font-semibold text-destructive">
          {formatCurrency(amount)}
        </span>
      );
    },
  },
  {
    accessorKey: "agingBand",
    header: "Aging Band",
    cell: ({ row }) => {
      const band = row.getValue("agingBand") as ArrearsRow["agingBand"];
      return <AgingBadge band={band} />;
    },
  },
  {
    accessorKey: "lastPaymentDate",
    header: "Last Payment",
    cell: ({ row }) => {
      const date = row.getValue("lastPaymentDate") as string | null;
      return date ? (
        <span className="text-sm">{formatDate(date)}</span>
      ) : (
        <span className="text-sm text-muted-foreground">Never</span>
      );
    },
  },
  {
    accessorKey: "lastReminderDate",
    header: "Last Reminder",
    cell: ({ row }) => {
      const date = row.getValue("lastReminderDate") as string | null;
      return date ? (
        <span className="text-sm">{formatDate(date)}</span>
      ) : (
        <span className="text-sm text-muted-foreground">Never</span>
      );
    },
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => {
      const parentId = row.original.parentId;

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
            <DropdownMenuItem onClick={() => onViewDetails(parentId)}>
              View Details
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onSendReminder(parentId)}>
              Send Reminder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(parentId)}
            >
              Copy Parent ID
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
  },
];
