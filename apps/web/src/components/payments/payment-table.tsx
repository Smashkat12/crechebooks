/**
 * Payment Table Component
 *
 * DataTable wrapper for payments with:
 * - Filtering support
 * - Pagination
 * - Sorting
 * - Row actions (view, match, unmatch)
 */

import * as React from 'react';
import { IPayment } from '@crechebooks/types';
import { DataTable } from '@/components/tables/data-table';
import { getPaymentColumns, PaymentColumnOptions } from './payment-columns';
import { PaymentFilters, PaymentFiltersState } from './payment-filters';
import { MatchPaymentDialog } from './match-payment-dialog';
import { usePaymentsList } from '@/hooks/use-payments';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';

interface PaymentTableProps {
  tenantId: string;
  className?: string;
}

export function PaymentTable({ tenantId, className }: PaymentTableProps) {
  const [filters, setFilters] = React.useState<PaymentFiltersState>({
    status: 'all',
  });
  const [selectedPayment, setSelectedPayment] = React.useState<IPayment | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // Build query parameters from filters
  const queryParams = React.useMemo(() => ({
    tenantId,
    startDate: filters.dateRange?.from?.toISOString(),
    endDate: filters.dateRange?.to?.toISOString(),
    status: filters.status !== 'all' ? filters.status : undefined,
    search: filters.search,
  }), [tenantId, filters]);

  const { data, isLoading, isError, error, refetch } = usePaymentsList(queryParams);

  const handleMatch = (payment: IPayment) => {
    setSelectedPayment(payment);
    setDialogOpen(true);
  };

  const handleView = (payment: IPayment) => {
    // TODO: Implement view details modal or navigate to detail page
  };

  const handleUnmatch = async (payment: IPayment) => {
    // TODO: Implement unmatch confirmation and mutation
  };

  const handleMatchSuccess = () => {
    refetch();
  };

  const columns = React.useMemo(
    () => getPaymentColumns({
      onView: handleView,
      onMatch: handleMatch,
      onUnmatch: handleUnmatch,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [handleView, handleMatch, handleUnmatch]
  );

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p>Loading payments...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load payments: {error instanceof Error ? error.message : 'Unknown error'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={className}>
      {/* Filters */}
      <PaymentFilters
        filters={filters}
        onFiltersChange={setFilters}
        className="mb-4"
      />

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={data?.payments || []}
        pageSize={data?.limit || 10}
        isLoading={isLoading}
      />

      {/* Match Payment Dialog */}
      <MatchPaymentDialog
        payment={selectedPayment}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSuccess={handleMatchSuccess}
      />
    </div>
  );
}
