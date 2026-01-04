/**
 * Enrollment Table Component
 * REQ-BILL-009: Enrollment Register UI
 *
 * @description DataTable wrapper for enrollments with:
 * - Filtering support (by parent, status, search)
 * - Pagination
 * - Sorting
 * - Row actions (view, edit, withdraw)
 */

import * as React from 'react';
import { DataTable } from '@/components/tables/data-table';
import { getEnrollmentColumns, EnrollmentColumnOptions } from './enrollment-columns';
import { EnrollmentFilters, EnrollmentFiltersState } from './enrollment-filters';
import { useEnrollmentsList, EnrollmentChild, ChildWithEnrollment } from '@/hooks/use-enrollments';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, Loader2 } from 'lucide-react';

interface EnrollmentTableProps {
  className?: string;
}

export function EnrollmentTable({ className }: EnrollmentTableProps) {
  const [filters, setFilters] = React.useState<EnrollmentFiltersState>({
    status: 'all',
  });

  // Build query parameters from filters
  const queryParams = React.useMemo(() => ({
    enrollment_status: filters.status !== 'all' ? filters.status : undefined,
    parent_id: filters.parentId,
    search: filters.search,
    page: 1,
    limit: 50,
  }), [filters]);

  const { data, isLoading, isError, error, refetch } = useEnrollmentsList(queryParams);

  const handleView = (child: EnrollmentChild | ChildWithEnrollment) => {
    // TODO: Navigate to child detail page or open modal
    console.log('View child enrollment:', child);
  };

  const handleEdit = (child: EnrollmentChild | ChildWithEnrollment) => {
    // TODO: Open edit enrollment dialog
    console.log('Edit child enrollment:', child);
  };

  const handleWithdraw = async (child: EnrollmentChild | ChildWithEnrollment) => {
    // TODO: Implement withdraw confirmation and mutation
    console.log('Withdraw child:', child);
  };

  const columns = React.useMemo(
    () => getEnrollmentColumns({
      onView: handleView,
      onEdit: handleEdit,
      onWithdraw: handleWithdraw,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  if (isLoading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p>Loading enrollments...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Failed to load enrollments: {error instanceof Error ? error.message : 'Unknown error'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className={className}>
      {/* Filters */}
      <EnrollmentFilters
        filters={filters}
        onFiltersChange={setFilters}
        className="mb-4"
      />

      {/* Data Table */}
      <DataTable
        columns={columns}
        data={data?.data || []}
        pageSize={data?.meta.limit || 50}
        isLoading={isLoading}
      />

      {/* Summary */}
      {data && (
        <div className="mt-4 text-sm text-muted-foreground">
          Showing {data.data.length} of {data.meta.total} enrolled children
        </div>
      )}
    </div>
  );
}
