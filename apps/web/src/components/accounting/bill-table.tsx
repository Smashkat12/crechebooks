'use client';

/**
 * TASK-ACCT-UI-004: Bill Table Component
 * Display a list of supplier bills with status and actions.
 */

import Link from 'next/link';
import { MoreHorizontal, DollarSign, Eye, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils';
import type { SupplierBill } from '@/hooks/use-suppliers';

interface BillTableProps {
  bills: SupplierBill[];
  supplierId: string;
  onRecordPayment?: (bill: SupplierBill) => void;
}

function getBillStatusBadge(status: SupplierBill['status']) {
  switch (status) {
    case 'DRAFT':
      return <Badge variant="secondary">Draft</Badge>;
    case 'UNPAID':
      return <Badge variant="outline">Unpaid</Badge>;
    case 'PARTIALLY_PAID':
      return (
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
          Partial
        </Badge>
      );
    case 'PAID':
      return (
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
          Paid
        </Badge>
      );
    case 'OVERDUE':
      return (
        <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
          Overdue
        </Badge>
      );
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

export function BillTable({ bills, supplierId, onRecordPayment }: BillTableProps) {
  if (bills.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>No bills found for this supplier</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bill #</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead className="text-right">Paid</TableHead>
            <TableHead className="text-right">Balance</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {bills.map((bill) => {
            const isOverdue =
              bill.status !== 'PAID' &&
              new Date(bill.dueDate) < new Date() &&
              bill.balanceDueCents > 0;

            return (
              <TableRow key={bill.id} className={isOverdue ? 'bg-red-50/50' : undefined}>
                <TableCell className="font-mono font-medium">{bill.billNumber}</TableCell>
                <TableCell>{formatDate(bill.billDate)}</TableCell>
                <TableCell className={isOverdue ? 'text-red-600 font-medium' : ''}>
                  {formatDate(bill.dueDate)}
                </TableCell>
                <TableCell>{getBillStatusBadge(bill.status)}</TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(bill.totalCents / 100)}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(bill.paidCents / 100)}
                </TableCell>
                <TableCell className="text-right font-mono font-medium">
                  {formatCurrency(bill.balanceDueCents / 100)}
                </TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="h-8 w-8 p-0">
                        <span className="sr-only">Open menu</span>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/accounting/suppliers/${supplierId}/bills/${bill.id}`}>
                          <Eye className="mr-2 h-4 w-4" />
                          View Details
                        </Link>
                      </DropdownMenuItem>
                      {bill.balanceDueCents > 0 && (
                        <DropdownMenuItem onClick={() => onRecordPayment?.(bill)}>
                          <DollarSign className="mr-2 h-4 w-4" />
                          Record Payment
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
