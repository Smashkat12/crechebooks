'use client';

/**
 * TASK-ACCT-UI-004: Supplier List Page
 * Main page for viewing and managing suppliers.
 */

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Building2, Receipt, DollarSign, Search, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/tables/data-table';
import { DataTableSkeleton } from '@/components/tables/data-table-skeleton';
import { Input } from '@/components/ui/input';
import { useSuppliersList, usePayablesSummary, type Supplier } from '@/hooks/use-suppliers';
import { createSupplierColumns } from '@/components/accounting/supplier-columns';
import { formatCurrency } from '@/lib/utils';

export default function SuppliersPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');

  const { data: suppliers, isLoading, error } = useSuppliersList({
    search: search || undefined,
  });

  const { data: payablesSummary } = usePayablesSummary();

  const handleCreateBill = useCallback(
    (supplier: Supplier) => {
      router.push(`/accounting/suppliers/${supplier.id}?createBill=true`);
    },
    [router]
  );

  const columns = useMemo(
    () =>
      createSupplierColumns({
        onCreateBill: handleCreateBill,
      }),
    [handleCreateBill]
  );

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive font-medium">Failed to load suppliers</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Suppliers</h1>
          <p className="text-muted-foreground">Manage suppliers and accounts payable</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/accounting/payables">
            <Button variant="outline">
              <Receipt className="h-4 w-4 mr-2" />
              Payables Aging
            </Button>
          </Link>
          <Link href="/accounting/suppliers/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Supplier
            </Button>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      {payablesSummary && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Payable</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {formatCurrency(payablesSummary.totalDueCents / 100)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Overdue</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-red-600">
                {formatCurrency(payablesSummary.overdueCents / 100)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Due This Week</CardTitle>
              <Receipt className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-amber-600">
                {formatCurrency(payablesSummary.dueThisWeekCents / 100)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Suppliers</CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{payablesSummary.supplierCount}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Suppliers Table */}
      <Card>
        <CardHeader>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search suppliers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <DataTableSkeleton columns={7} rows={10} />
          ) : (
            <DataTable
              columns={columns}
              data={suppliers || []}
              emptyMessage="No suppliers found. Click 'Add Supplier' to create your first supplier."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
