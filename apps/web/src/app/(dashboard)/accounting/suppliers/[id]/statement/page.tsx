'use client';

/**
 * TASK-ACCT-UI-004: Supplier Statement Page
 * View supplier statement with date range selection.
 */

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileText, Download, Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table';
import { useSupplier, useSupplierStatement, type SupplierBill } from '@/hooks/use-suppliers';
import { formatCurrency, formatDate } from '@/lib/utils';

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

export default function SupplierStatementPage() {
  const params = useParams();
  const supplierId = params.id as string;

  // Default to last 3 months
  const today = new Date();
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const [fromDate, setFromDate] = useState(threeMonthsAgo.toISOString().split('T')[0]);
  const [toDate, setToDate] = useState(today.toISOString().split('T')[0]);

  const { data: supplier } = useSupplier(supplierId);
  const { data: statement, isLoading, error } = useSupplierStatement(
    supplierId,
    fromDate,
    toDate
  );

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive font-medium">Failed to load statement</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  const bills = statement?.bills || [];
  const openingBalance = statement?.openingBalanceCents || 0;
  const closingBalance = statement?.closingBalanceCents || 0;

  // Calculate running balance
  let runningBalance = openingBalance;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href={`/accounting/suppliers/${supplierId}`}>
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Supplier Statement</h1>
            <p className="text-muted-foreground">{supplier?.name || 'Loading...'}</p>
          </div>
        </div>
        <Button variant="outline" disabled>
          <Download className="h-4 w-4 mr-2" />
          Export PDF
        </Button>
      </div>

      {/* Date Range Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Statement Period
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-2">
              <Label htmlFor="fromDate">From</Label>
              <Input
                id="fromDate"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-44"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="toDate">To</Label>
              <Input
                id="toDate"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-44"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Statement Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Opening Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono">
              {formatCurrency(openingBalance / 100)}
            </div>
            <p className="text-xs text-muted-foreground">As at {formatDate(fromDate)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Transaction Count</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bills.length}</div>
            <p className="text-xs text-muted-foreground">Bills in period</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Closing Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold font-mono ${closingBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}
            >
              {formatCurrency(closingBalance / 100)}
            </div>
            <p className="text-xs text-muted-foreground">As at {formatDate(toDate)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Statement Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Statement Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : bills.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No transactions in selected period</p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Opening Balance Row */}
                  <TableRow className="bg-muted/50">
                    <TableCell>{formatDate(fromDate)}</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell className="font-medium">Opening Balance</TableCell>
                    <TableCell>-</TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className="text-right">-</TableCell>
                    <TableCell className="text-right font-mono font-medium">
                      {formatCurrency(openingBalance / 100)}
                    </TableCell>
                  </TableRow>

                  {/* Bill Rows */}
                  {bills.map((bill) => {
                    // Bill increases balance (debit)
                    runningBalance += bill.totalCents;
                    const debitAmount = bill.totalCents;

                    // Payment decreases balance (credit)
                    runningBalance -= bill.paidCents;
                    const creditAmount = bill.paidCents;

                    return (
                      <TableRow key={bill.id}>
                        <TableCell>{formatDate(bill.billDate)}</TableCell>
                        <TableCell className="font-mono">{bill.billNumber}</TableCell>
                        <TableCell>
                          Bill from {bill.supplierName}
                          {bill.purchaseOrderRef && (
                            <span className="text-muted-foreground ml-2">
                              (PO: {bill.purchaseOrderRef})
                            </span>
                          )}
                        </TableCell>
                        <TableCell>{getBillStatusBadge(bill.status)}</TableCell>
                        <TableCell className="text-right font-mono">
                          {debitAmount > 0 ? formatCurrency(debitAmount / 100) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {creditAmount > 0 ? formatCurrency(creditAmount / 100) : '-'}
                        </TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {formatCurrency(runningBalance / 100)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={4} className="font-bold">
                      Closing Balance
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {formatCurrency(
                        bills.reduce((sum, bill) => sum + bill.totalCents, 0) / 100
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {formatCurrency(
                        bills.reduce((sum, bill) => sum + bill.paidCents, 0) / 100
                      )}
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono font-bold ${closingBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}
                    >
                      {formatCurrency(closingBalance / 100)}
                    </TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
