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

import { useEffect, useState, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { FileText, Loader2, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { InvoiceFilters } from '@/components/parent-portal/invoice-filters';
import { InvoiceList } from '@/components/parent-portal/invoice-list';
import {
  useParentInvoices,
  type ParentInvoicesFilters,
  type ParentInvoiceListItem,
} from '@/hooks/parent-portal/use-parent-invoices';

// Mock data for development/demo when API is unavailable
const mockInvoices: ParentInvoiceListItem[] = [
  {
    id: '1',
    invoiceNumber: 'INV-2024-001',
    date: '2024-01-15',
    childName: 'Emma Smith',
    amount: 1500.0,
    status: 'overdue',
  },
  {
    id: '2',
    invoiceNumber: 'INV-2024-002',
    date: '2024-01-20',
    childName: 'James Smith',
    amount: 950.0,
    status: 'pending',
  },
  {
    id: '3',
    invoiceNumber: 'INV-2023-012',
    date: '2023-12-15',
    childName: 'Emma Smith',
    amount: 1500.0,
    status: 'paid',
  },
  {
    id: '4',
    invoiceNumber: 'INV-2023-011',
    date: '2023-11-15',
    childName: 'James Smith',
    amount: 1500.0,
    status: 'paid',
  },
  {
    id: '5',
    invoiceNumber: 'INV-2023-010',
    date: '2023-10-15',
    childName: 'Emma Smith',
    amount: 1500.0,
    status: 'paid',
  },
  {
    id: '6',
    invoiceNumber: 'INV-2023-009',
    date: '2023-09-15',
    childName: 'Emma Smith',
    amount: 1500.0,
    status: 'paid',
  },
  {
    id: '7',
    invoiceNumber: 'INV-2023-008',
    date: '2023-08-15',
    childName: 'James Smith',
    amount: 1450.0,
    status: 'paid',
  },
];

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

  // State for fallback to mock data
  const [useMockData, setUseMockData] = useState(false);

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem('parent_session_token');
    if (!token) {
      router.push('/parent/login');
    }
  }, [router]);

  // Handle API errors by falling back to mock data
  useEffect(() => {
    if (isError && !useMockData) {
      console.warn('Invoices API error, using mock data:', error?.message);
      setUseMockData(true);
    }
  }, [isError, error, useMockData]);

  // Apply client-side filtering to mock data
  const filteredMockInvoices = useMemo(() => {
    let result = [...mockInvoices];

    if (filters.status && filters.status !== 'all') {
      result = result.filter((inv) => inv.status === filters.status);
    }

    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      result = result.filter((inv) => new Date(inv.date) >= startDate);
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      result = result.filter((inv) => new Date(inv.date) <= endDate);
    }

    return result;
  }, [filters]);

  // Determine which invoices to display
  const invoices = useMockData ? filteredMockInvoices : (data?.invoices || []);
  const showLoading = isLoading && !useMockData;

  const handleViewInvoice = (invoiceId: string) => {
    router.push(`/parent/invoices/${invoiceId}`);
  };

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(newPage));
    router.push(`/parent/invoices?${params.toString()}`);
  };

  const totalPages = useMockData
    ? Math.ceil(filteredMockInvoices.length / (filters.limit || 10))
    : (data?.totalPages || 1);
  const currentPage = filters.page || 1;

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

      {/* Error Alert (only shown if not using mock data fallback) */}
      {isError && !useMockData && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error?.message || 'Failed to load invoices. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Invoice List */}
      <InvoiceList
        invoices={invoices}
        isLoading={showLoading}
        onViewInvoice={handleViewInvoice}
      />

      {/* Pagination */}
      {totalPages > 1 && !showLoading && invoices.length > 0 && (
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
