'use client';

/**
 * TASK-ACCT-UI-004: Payables Aging Table Component
 * Display accounts payable aging by supplier.
 */

import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import type { SupplierBill } from '@/hooks/use-suppliers';

interface SupplierAgingRow {
  supplierId: string;
  supplierName: string;
  current: number;
  days30: number;
  days60: number;
  days90: number;
  over90: number;
  total: number;
}

interface PayablesAgingTableProps {
  bills: SupplierBill[];
}

function calculateAgingBucket(dueDate: string): 'current' | 'days30' | 'days60' | 'days90' | 'over90' {
  const due = new Date(dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = today.getTime() - due.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return 'current';
  if (diffDays <= 30) return 'days30';
  if (diffDays <= 60) return 'days60';
  if (diffDays <= 90) return 'days90';
  return 'over90';
}

export function PayablesAgingTable({ bills }: PayablesAgingTableProps) {
  // Group bills by supplier and calculate aging buckets
  const agingBySupplier = bills.reduce<Record<string, SupplierAgingRow>>((acc, bill) => {
    if (bill.balanceDueCents <= 0) return acc;

    const bucket = calculateAgingBucket(bill.dueDate);

    if (!acc[bill.supplierId]) {
      acc[bill.supplierId] = {
        supplierId: bill.supplierId,
        supplierName: bill.supplierName,
        current: 0,
        days30: 0,
        days60: 0,
        days90: 0,
        over90: 0,
        total: 0,
      };
    }

    acc[bill.supplierId][bucket] += bill.balanceDueCents;
    acc[bill.supplierId].total += bill.balanceDueCents;

    return acc;
  }, {});

  const rows = Object.values(agingBySupplier).sort((a, b) => b.total - a.total);

  // Calculate totals
  const totals = rows.reduce(
    (acc, row) => ({
      current: acc.current + row.current,
      days30: acc.days30 + row.days30,
      days60: acc.days60 + row.days60,
      days90: acc.days90 + row.days90,
      over90: acc.over90 + row.over90,
      total: acc.total + row.total,
    }),
    { current: 0, days30: 0, days60: 0, days90: 0, over90: 0, total: 0 }
  );

  if (rows.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No outstanding payables</p>
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Supplier</TableHead>
            <TableHead className="text-right">Current</TableHead>
            <TableHead className="text-right">1-30 Days</TableHead>
            <TableHead className="text-right">31-60 Days</TableHead>
            <TableHead className="text-right">61-90 Days</TableHead>
            <TableHead className="text-right">90+ Days</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.supplierId}>
              <TableCell>
                <Link
                  href={`/accounting/suppliers/${row.supplierId}`}
                  className="font-medium hover:underline"
                >
                  {row.supplierName}
                </Link>
              </TableCell>
              <TableCell className="text-right font-mono">
                {row.current > 0 ? formatCurrency(row.current / 100) : '-'}
              </TableCell>
              <TableCell
                className={`text-right font-mono ${row.days30 > 0 ? 'text-amber-600' : ''}`}
              >
                {row.days30 > 0 ? formatCurrency(row.days30 / 100) : '-'}
              </TableCell>
              <TableCell
                className={`text-right font-mono ${row.days60 > 0 ? 'text-orange-600' : ''}`}
              >
                {row.days60 > 0 ? formatCurrency(row.days60 / 100) : '-'}
              </TableCell>
              <TableCell
                className={`text-right font-mono ${row.days90 > 0 ? 'text-red-500' : ''}`}
              >
                {row.days90 > 0 ? formatCurrency(row.days90 / 100) : '-'}
              </TableCell>
              <TableCell
                className={`text-right font-mono ${row.over90 > 0 ? 'text-red-700 font-medium' : ''}`}
              >
                {row.over90 > 0 ? formatCurrency(row.over90 / 100) : '-'}
              </TableCell>
              <TableCell className="text-right font-mono font-medium">
                {formatCurrency(row.total / 100)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-bold">Total</TableCell>
            <TableCell className="text-right font-mono font-bold">
              {formatCurrency(totals.current / 100)}
            </TableCell>
            <TableCell
              className={`text-right font-mono font-bold ${totals.days30 > 0 ? 'text-amber-600' : ''}`}
            >
              {formatCurrency(totals.days30 / 100)}
            </TableCell>
            <TableCell
              className={`text-right font-mono font-bold ${totals.days60 > 0 ? 'text-orange-600' : ''}`}
            >
              {formatCurrency(totals.days60 / 100)}
            </TableCell>
            <TableCell
              className={`text-right font-mono font-bold ${totals.days90 > 0 ? 'text-red-500' : ''}`}
            >
              {formatCurrency(totals.days90 / 100)}
            </TableCell>
            <TableCell
              className={`text-right font-mono font-bold ${totals.over90 > 0 ? 'text-red-700' : ''}`}
            >
              {formatCurrency(totals.over90 / 100)}
            </TableCell>
            <TableCell className="text-right font-mono font-bold">
              {formatCurrency(totals.total / 100)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}
