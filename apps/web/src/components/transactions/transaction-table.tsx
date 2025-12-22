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
import { useTransactionsList } from '@/hooks/use-transactions';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';

interface TransactionTableProps {
  tenantId: string;
  className?: string;
}

export function TransactionTable({ tenantId, className }: TransactionTableProps) {
  const [filters, setFilters] = React.useState<TransactionFiltersState>({
    status: 'all',
  });
  const [selectedTransaction, setSelectedTransaction] = React.useState<ITransaction | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // Build query parameters from filters
  const queryParams = React.useMemo(() => ({
    tenantId,
    startDate: filters.dateRange?.from?.toISOString(),
    endDate: filters.dateRange?.to?.toISOString(),
    status: filters.status !== 'all' ? filters.status : undefined,
    categoryCode: filters.categoryCode,
    search: filters.search,
  }), [tenantId, filters]);

  const { data, isLoading, isError, error, refetch } = useTransactionsList(queryParams);

  const handleEdit = (transaction: ITransaction) => {
    setSelectedTransaction(transaction);
    setDialogOpen(true);
  };

  const handleView = (transaction: ITransaction) => {
    // TODO: Implement view details modal or navigate to detail page
    console.log('View transaction:', transaction);
  };

  const handleDelete = async (transaction: ITransaction) => {
    // TODO: Implement delete confirmation and mutation
    console.log('Delete transaction:', transaction);
  };

  const handleCategorizationSuccess = () => {
    refetch();
  };

  const columns = React.useMemo(
    () => getTransactionColumns({
      onView: handleView,
      onEdit: handleEdit,
      onDelete: handleDelete,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleView, handleEdit, handleDelete]
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
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load transactions: {error instanceof Error ? error.message : 'Unknown error'}
        </AlertDescription>
      </Alert>
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
        pageSize={data?.limit || 10}
        isLoading={isLoading}
      />

      {/* Categorization Dialog */}
      <CategorizationDialog
        transaction={selectedTransaction}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleCategorizationSuccess}
      />
    </div>
  );
}
