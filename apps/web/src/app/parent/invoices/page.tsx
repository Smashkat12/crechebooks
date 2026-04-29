'use client';

/**
 * Parent Portal Invoices List Page
 * TASK-PORTAL-013: Parent Portal Invoices Page
 *
 * Displays all invoices for the logged-in parent with:
 * - Page title "My Invoices"
 * - Status filter dropdown (All, Paid, Pending, Overdue)
 * - Date range filter
 * - Responsive invoice list (table on desktop, cards on mobile)
 * - Pagination
 */

import { useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { InvoiceFilters } from '@/components/parent-portal/invoice-filters';
import { InvoiceList } from '@/components/parent-portal/invoice-list';
import {
  useParentInvoices,
  type ParentInvoicesFilters,
} from '@/hooks/parent-portal/use-parent-invoices';

function InvoicesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse filters from URL
  const filters: ParentInvoicesFilters = useMemo(
    () => ({
      status: (searchParams.get('status') as ParentInvoicesFilters['status']) || 'all',
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1,
      limit: 10,
    }),
    [searchParams]
  );

  // Fetch invoices
  const { data, isLoading, error, isError } = useParentInvoices(filters);

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem('parent_session_token');
    if (!token) {
      router.push('/parent/login');
    }
  }, [router]);

  if (isError) {
    return (
      <div className="max-w-lg mx-auto mt-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error?.message || 'Unable to load your invoices. Please try again.'}
          </AlertDescription>
        </Alert>
        <Button
          className="mt-4 w-full"
          variant="outline"
          onClick={() => window.location.reload()}
        >
          Try Again
        </Button>
      </div>
    );
  }

  const invoices = data?.invoices || [];
  const totalPages = data?.totalPages || 1;
  const currentPage = filters.page || 1;

  const handleViewInvoice = (invoiceId: string) => {
    router.push(`/parent/invoices/${invoiceId}`);
  };

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(newPage));
    router.push(`/parent/invoices?${params.toString()}`);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileText className="h-6 w-6" />
          My Invoices
        </h1>
        <p className="text-muted-foreground mt-1">
          View and download your invoices
        </p>
      </div>

      {/* Filters */}
      <InvoiceFilters />

      {/* Invoice List */}
      <InvoiceList
        invoices={invoices}
        isLoading={isLoading}
        onViewInvoice={handleViewInvoice}
      />

      {/* Pagination */}
      {totalPages > 1 && !isLoading && invoices.length > 0 && (
        <div className="flex justify-center gap-2 pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
          >
            Previous
          </Button>
          <span className="flex items-center px-4 text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

// Loading fallback for Suspense
function InvoicesLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// Main page component with Suspense boundary for useSearchParams
export default function ParentInvoicesPage() {
  return (
    <Suspense fallback={<InvoicesLoadingFallback />}>
      <InvoicesPageContent />
    </Suspense>
  );
}
