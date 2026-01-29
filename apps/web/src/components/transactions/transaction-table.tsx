/**
 * Transaction Table Component
 *
 * DataTable wrapper for transactions with:
 * - Filtering support
 * - Pagination
 * - Sorting
 * - Row actions (view, edit, delete)
 */

import * as React from 'react';
import { ITransaction } from '@crechebooks/types';
import { DataTable } from '@/components/tables/data-table';
import { getTransactionColumns, TransactionColumnOptions } from './transaction-columns';
import { TransactionFilters, TransactionFiltersState } from './transaction-filters';
import { CategorizationDialog } from './categorization-dialog';
import { SplitTransactionModal, SplitRow } from './SplitTransactionModal';
import { TransactionDetailModal } from './TransactionDetailModal';
import { useTransactionsList } from '@/hooks/use-transactions';
import type { Alert as _Alert, AlertDescription as _AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, Loader2, FileSpreadsheet } from 'lucide-react';

interface TransactionTableProps {
  tenantId: string;
  className?: string;
  year?: number;
}

const PAGE_SIZE = 20;

export function TransactionTable({ tenantId, className, year }: TransactionTableProps) {
  const [filters, setFilters] = React.useState<TransactionFiltersState>({
    status: 'all',
  });
  const [page, setPage] = React.useState(1);
  const [selectedTransaction, setSelectedTransaction] = React.useState<ITransaction | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [splitModalOpen, setSplitModalOpen] = React.useState(false);
  const [splitTransaction, setSplitTransaction] = React.useState<ITransaction | null>(null);
  const [detailModalOpen, setDetailModalOpen] = React.useState(false);
  const [viewTransaction, setViewTransaction] = React.useState<ITransaction | null>(null);

  // Reset page when filters or year change
  React.useEffect(() => {
    setPage(1);
  }, [filters, year]);

  // Build query parameters from filters
  // year=0 means "All Years" - don't filter by year
  const queryParams = React.useMemo(() => ({
    tenantId,
    page,
    limit: PAGE_SIZE,
    startDate: filters.dateRange?.from?.toISOString(),
    endDate: filters.dateRange?.to?.toISOString(),
    status: filters.status !== 'all' ? filters.status : undefined,
    categoryCode: filters.categoryCode,
    search: filters.search,
    year: !filters.dateRange?.from && !filters.dateRange?.to && year && year > 0 ? year : undefined,
  }), [tenantId, page, filters, year]);

  const { data, isLoading, isError, error, refetch } = useTransactionsList(queryParams);

  const handleEdit = (transaction: ITransaction) => {
    setSelectedTransaction(transaction);
    setDialogOpen(true);
  };

  const handleView = (transaction: ITransaction) => {
    setViewTransaction(transaction);
    setDetailModalOpen(true);
  };

  const handleDelete = async (transaction: ITransaction) => {
    // TODO: Implement delete confirmation and mutation
  };

  const handleSplit = (transaction: ITransaction) => {
    setSplitTransaction(transaction);
    setSplitModalOpen(true);
  };

  const handleSplitSave = async (splits: SplitRow[]) => {
    // Split save is handled by the modal's hook
    await refetch();
  };

  const handleCategorizationSuccess = () => {
    refetch();
  };

  const columns = React.useMemo(
    () => getTransactionColumns({
      onView: handleView,
      onEdit: handleEdit,
      onSplit: handleSplit,
      onDelete: handleDelete,
    }),
     
    [handleView, handleEdit, handleSplit, handleDelete]
  );

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p>Loading transactions...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="h-10 w-10 text-destructive mb-4" />
        <h3 className="text-lg font-medium mb-1">Unable to load transactions</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Something went wrong while fetching your transactions. Please try again.
        </p>
        <Button variant="outline" onClick={() => refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  const hasTransactions = (data?.transactions?.length ?? 0) > 0;
  const hasActiveFilters = filters.status !== 'all' || filters.search || filters.categoryCode || filters.dateRange;

  // Empty state when no transactions exist at all
  if (!hasTransactions && !hasActiveFilters) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <FileSpreadsheet className="h-12 w-12 text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium mb-1">No transactions yet</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Import a bank statement to get started. Once imported, transactions will appear here for categorization and reconciliation.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Filters */}
      <TransactionFilters
        filters={filters}
        onFiltersChange={setFilters}
        className="mb-4"
      />

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={data?.transactions || []}
        pageSize={PAGE_SIZE}
        isLoading={isLoading}
        manualPagination={true}
      />

      {/* Server-side Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between py-4">
          <div className="text-sm text-muted-foreground">
            Showing {((page - 1) * PAGE_SIZE) + 1} to {Math.min(page * PAGE_SIZE, data.total)} of {data.total} transactions
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded border px-3 py-1 text-sm disabled:opacity-50 hover:bg-muted"
            >
              Previous
            </button>
            <span className="text-sm">
              Page {page} of {Math.ceil(data.total / PAGE_SIZE)}
            </span>
            <button
              onClick={() => setPage(p => Math.min(Math.ceil(data.total / PAGE_SIZE), p + 1))}
              disabled={page >= Math.ceil(data.total / PAGE_SIZE)}
              className="rounded border px-3 py-1 text-sm disabled:opacity-50 hover:bg-muted"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Categorization Dialog */}
      <CategorizationDialog
        transaction={selectedTransaction}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleCategorizationSuccess}
      />

      {/* Split Transaction Modal */}
      {splitTransaction && (
        <SplitTransactionModal
          transaction={splitTransaction}
          isOpen={splitModalOpen}
          onClose={() => {
            setSplitModalOpen(false);
            setSplitTransaction(null);
          }}
          onSave={handleSplitSave}
        />
      )}

      {/* Transaction Detail Modal */}
      <TransactionDetailModal
        transaction={viewTransaction}
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setViewTransaction(null);
        }}
        onEditCategory={handleEdit}
        onSplitTransaction={handleSplit}
      />
    </div>
  );
}
