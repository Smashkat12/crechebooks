'use client';

/**
 * Enrollments Page
 * TASK-BILL-019: Enrollment Register Dedicated View
 *
 * @description Dedicated enrollment register with filters, search, and bulk operations
 * Features:
 * - All enrollments with child, parent, fee tier, dates, status
 * - Status filters (active by default)
 * - Search by child/parent name
 * - Fee tier filter
 * - Sortable columns
 * - Pagination (50 per page)
 * - Bulk status change
 * - Export to CSV
 */

import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  EnrollmentTable,
  EnrollmentFilters,
  BulkActionsBar,
} from '@/components/enrollments';
import type { EnrollmentFiltersState } from '@/components/enrollments/EnrollmentFilters';
import {
  useEnrollments,
  useUpdateEnrollmentStatus,
  useBulkUpdateEnrollmentStatus,
} from '@/hooks/use-enrollments';
import { exportEnrollments } from '@/lib/api/enrollments';

const PAGE_SIZE = 50;

export default function EnrollmentsPage() {
  const { toast } = useToast();
  const [filters, setFilters] = React.useState<EnrollmentFiltersState>({
    status: 'active',
  });
  const [page, setPage] = React.useState(1);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [isExporting, setIsExporting] = React.useState(false);

  // Reset page when filters change
  React.useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [filters]);

  // Build query parameters
  const queryParams = React.useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      status: filters.status !== 'all' ? filters.status : undefined,
      feeTierId: filters.feeTierId,
      search: filters.search,
    }),
    [page, filters]
  );

  const { data, isLoading, isError, error, refetch } = useEnrollments(queryParams);
  const updateStatusMutation = useUpdateEnrollmentStatus();
  const bulkUpdateMutation = useBulkUpdateEnrollmentStatus();

  const handleStatusChange = async (enrollmentId: string, status: 'active' | 'inactive' | 'pending') => {
    try {
      await updateStatusMutation.mutateAsync({ enrollmentId, status });
      toast({
        title: 'Status updated',
        description: `Enrollment status changed to ${status}`,
      });
      refetch();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to update enrollment status',
        variant: 'destructive',
      });
    }
  };

  const handleBulkStatusChange = async (status: 'active' | 'inactive' | 'pending') => {
    try {
      const enrollmentIds = Array.from(selectedIds);
      await bulkUpdateMutation.mutateAsync({ enrollmentIds, status });
      toast({
        title: 'Bulk update complete',
        description: `Updated ${enrollmentIds.length} enrollment(s) to ${status}`,
      });
      setSelectedIds(new Set());
      refetch();
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to update enrollments',
        variant: 'destructive',
      });
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      // Export all filtered data (not just current page)
      const csvData = await exportEnrollments({
        status: filters.status !== 'all' ? filters.status : undefined,
        feeTierId: filters.feeTierId,
        search: filters.search,
      });

      // Download CSV file
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `enrollments-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

      toast({
        title: 'Export successful',
        description: 'Enrollments have been exported to CSV',
      });
    } catch (err) {
      toast({
        title: 'Error',
        description: 'Failed to export enrollments',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Enrollments</h1>
          <p className="text-muted-foreground">
            Manage child enrollments and fee tiers
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={isExporting}>
            {isExporting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-2" />
            )}
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <EnrollmentFilters
            filters={filters}
            onFiltersChange={setFilters}
          />
        </CardContent>
      </Card>

      {/* Bulk Actions */}
      {selectedIds.size > 0 && (
        <BulkActionsBar
          selectedCount={selectedIds.size}
          onClearSelection={() => setSelectedIds(new Set())}
          onBulkStatusChange={handleBulkStatusChange}
          isLoading={bulkUpdateMutation.isPending}
        />
      )}

      {/* Table */}
      <Card>
        <CardContent className="pt-6">
          {isError ? (
            <div className="flex h-[400px] items-center justify-center">
              <p className="text-destructive">
                Error loading enrollments: {error instanceof Error ? error.message : 'Unknown error'}
              </p>
            </div>
          ) : (
            <>
              <EnrollmentTable
                enrollments={data?.enrollments || []}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onStatusChange={handleStatusChange}
                isLoading={isLoading}
              />

              {/* Pagination */}
              {data && data.total > PAGE_SIZE && (
                <div className="flex items-center justify-between py-4 mt-4">
                  <div className="text-sm text-muted-foreground">
                    Showing {((page - 1) * PAGE_SIZE) + 1} to {Math.min(page * PAGE_SIZE, data.total)} of {data.total} enrollments
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                    >
                      Previous
                    </Button>
                    <span className="text-sm">
                      Page {page} of {Math.ceil(data.total / PAGE_SIZE)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(Math.ceil(data.total / PAGE_SIZE), p + 1))}
                      disabled={page >= Math.ceil(data.total / PAGE_SIZE)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
