'use client';

/**
 * TASK-ACCT-UI-004: Accounts Payable Aging Report Page
 * Display aging report for all supplier bills.
 */

import Link from 'next/link';
import { ArrowLeft, AlertTriangle, DollarSign, Receipt, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useSuppliersList, usePayablesSummary } from '@/hooks/use-suppliers';
import { formatCurrency } from '@/lib/utils';

export default function PayablesAgingPage() {
  const { data: payablesSummary, isLoading: summaryLoading } = usePayablesSummary();
  const { data: suppliers, isLoading: suppliersLoading } = useSuppliersList();

  const isLoading = summaryLoading || suppliersLoading;

  // Calculate aging buckets from summary data
  const totalPayable = payablesSummary?.totalDueCents || 0;
  const overdue = payablesSummary?.overdueCents || 0;
  const dueThisWeek = payablesSummary?.dueThisWeekCents || 0;
  const current = totalPayable - overdue - dueThisWeek;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/accounting/suppliers">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Accounts Payable Aging</h1>
            <p className="text-muted-foreground">
              Overview of outstanding supplier bills by age
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Payable</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {formatCurrency(totalPayable / 100)}
              </div>
              <p className="text-xs text-muted-foreground">
                {payablesSummary?.supplierCount || 0} suppliers
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Current</CardTitle>
              <Clock className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-emerald-600">
                {formatCurrency(current / 100)}
              </div>
              <p className="text-xs text-muted-foreground">Not yet due</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Due This Week</CardTitle>
              <Receipt className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-amber-600">
                {formatCurrency(dueThisWeek / 100)}
              </div>
              <p className="text-xs text-muted-foreground">Due in 7 days</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-red-600">
                {formatCurrency(overdue / 100)}
              </div>
              <p className="text-xs text-muted-foreground">Past due date</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Aging Chart - Visual Bar */}
      {!isLoading && totalPayable > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Aging Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex h-4 rounded-full overflow-hidden bg-muted">
                {current > 0 && (
                  <div
                    className="bg-emerald-500"
                    style={{ width: `${(current / totalPayable) * 100}%` }}
                    title={`Current: ${formatCurrency(current / 100)}`}
                  />
                )}
                {dueThisWeek > 0 && (
                  <div
                    className="bg-amber-500"
                    style={{ width: `${(dueThisWeek / totalPayable) * 100}%` }}
                    title={`Due This Week: ${formatCurrency(dueThisWeek / 100)}`}
                  />
                )}
                {overdue > 0 && (
                  <div
                    className="bg-red-500"
                    style={{ width: `${(overdue / totalPayable) * 100}%` }}
                    title={`Overdue: ${formatCurrency(overdue / 100)}`}
                  />
                )}
              </div>
              <div className="flex justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span>Current ({((current / totalPayable) * 100).toFixed(0)}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span>Due This Week ({((dueThisWeek / totalPayable) * 100).toFixed(0)}%)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span>Overdue ({((overdue / totalPayable) * 100).toFixed(0)}%)</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Information Card */}
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <Receipt className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-medium mb-2">Detailed Aging Report</h3>
            <p className="text-muted-foreground mb-4 max-w-md mx-auto">
              View individual supplier bills and their aging status. Click on a supplier
              to see their statement and manage bills.
            </p>
            <Link href="/accounting/suppliers">
              <Button>
                View All Suppliers
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Supplier Quick List */}
      {suppliers && suppliers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Active Suppliers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
              {suppliers.filter(s => s.isActive).slice(0, 9).map((supplier) => (
                <Link
                  key={supplier.id}
                  href={`/accounting/suppliers/${supplier.id}`}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{supplier.name}</p>
                    {supplier.tradingName && (
                      <p className="text-sm text-muted-foreground truncate">
                        {supplier.tradingName}
                      </p>
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {supplier.paymentTermsDays}d terms
                  </span>
                </Link>
              ))}
            </div>
            {suppliers.filter(s => s.isActive).length > 9 && (
              <div className="text-center mt-4">
                <Link href="/accounting/suppliers">
                  <Button variant="link">View all {suppliers.filter(s => s.isActive).length} suppliers</Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
