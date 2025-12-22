import { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Eye, Send, Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Invoice } from "@/types/invoice";
import { InvoiceStatusBadge } from "./invoice-status-badge";

interface InvoiceActionsProps {
  invoice: Invoice;
  onView: (invoice: Invoice) => void;
  onSend: (invoice: Invoice) => void;
  onDownload: (invoice: Invoice) => void;
  onDelete: (invoice: Invoice) => void;
}

function InvoiceActions({
  invoice,
  onView,
  onSend,
  onDownload,
  onDelete,
}: InvoiceActionsProps) {
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
        <DropdownMenuItem onClick={() => onView(invoice)}>
          <Eye className="mr-2 h-4 w-4" />
          View Invoice
        </DropdownMenuItem>
        {invoice.status !== "paid" && invoice.status !== "cancelled" && (
          <DropdownMenuItem onClick={() => onSend(invoice)}>
            <Send className="mr-2 h-4 w-4" />
            Send Invoice
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={() => onDownload(invoice)}>
          <Download className="mr-2 h-4 w-4" />
          Download PDF
        </DropdownMenuItem>
        {invoice.status === "draft" && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDelete(invoice)}
              className="text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Draft
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function createInvoiceColumns(
  onView: (invoice: Invoice) => void,
  onSend: (invoice: Invoice) => void,
  onDownload: (invoice: Invoice) => void,
  onDelete: (invoice: Invoice) => void
): ColumnDef<Invoice>[] {
  return [
    {
      accessorKey: "invoiceNumber",
      header: "Invoice #",
      cell: ({ row }) => (
        <div className="font-medium">{row.getValue("invoiceNumber")}</div>
      ),
    },
    {
      accessorKey: "parentName",
      header: "Parent",
    },
    {
      accessorKey: "childName",
      header: "Child",
      cell: ({ row }) => {
        const lines = row.original.lines || [];
        if (lines.length === 0) {
          return row.original.childName || '-';
        }
        const childCount = new Set(lines.map((l) => l.childName)).size;
        return childCount > 1 ? `${childCount} children` : lines[0]?.childName;
      },
    },
    {
      accessorKey: "totalAmount",
      header: "Amount",
      cell: ({ row }) => {
        // Use totalCents from invoice if available
        if (row.original.totalCents !== undefined) {
          return formatCurrency(row.original.totalCents / 100);
        }
        const lines = row.original.lines || [];
        if (lines.length === 0) {
          return formatCurrency(0);
        }
        const subtotal = lines.reduce(
          (sum, line) => sum + line.amount,
          0
        );
        const vat = subtotal * ((row.original.vatRate || 0) / 100);
        return formatCurrency(subtotal + vat);
      },
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <InvoiceStatusBadge status={row.getValue("status")} />
      ),
    },
    {
      accessorKey: "dueDate",
      header: "Due Date",
      cell: ({ row }) => formatDate(row.getValue("dueDate")),
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <InvoiceActions
          invoice={row.original}
          onView={onView}
          onSend={onSend}
          onDownload={onDownload}
          onDelete={onDelete}
        />
      ),
    },
  ];
}
