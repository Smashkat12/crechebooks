'use client';

/**
 * Parent Portal Payments Page
 * TASK-PORTAL-015: Parent Portal Payments Page
 *
 * Displays payment history and bank details for making payments:
 * - Page title "My Payments"
 * - Bank details card prominently displayed
 * - Payment history list with date filter
 * - Outstanding amount banner
 * - Payment detail modal
 */

import { useEffect, useState, useMemo, Suspense, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CreditCard, Loader2, AlertCircle, Calendar, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { BankDetailsCard } from '@/components/parent-portal/bank-details-card';
import { PaymentList } from '@/components/parent-portal/payment-list';
import { PaymentDetail } from '@/components/parent-portal/payment-detail';
import { formatCurrency } from '@/lib/utils/format';
import {
  useParentPayments,
  useParentBankDetails,
  generatePaymentReference,
  type ParentPaymentsFilters,
} from '@/hooks/parent-portal/use-parent-payments';

function PaymentsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Parse filters from URL
  const filters: ParentPaymentsFilters = useMemo(
    () => ({
      startDate: searchParams.get('startDate') || undefined,
      endDate: searchParams.get('endDate') || undefined,
      page: searchParams.get('page') ? parseInt(searchParams.get('page')!, 10) : 1,
      limit: 10,
    }),
    [searchParams]
  );

  // Local filter state for controlled inputs
  const [startDate, setStartDate] = useState(filters.startDate || '');
  const [endDate, setEndDate] = useState(filters.endDate || '');

  // Modal state
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null);

  // Get parent ID for reference generation (in production, this would come from session)
  const [parentId, setParentId] = useState<string>('');
  const [paymentReference, setPaymentReference] = useState<string>('');

  // Fetch payments and bank details
  const { data, isLoading, error, isError } = useParentPayments(filters);
  const {
    data: bankDetails,
    isLoading: bankDetailsLoading,
    error: bankDetailsError,
  } = useParentBankDetails();

  // Check authentication on mount
  useEffect(() => {
    const token = localStorage.getItem('parent_session_token');
    if (!token) {
      router.push('/parent/login');
    }
    // Extract parent ID from token or session (simplified for demo)
    const mockParentId = 'P12345678';
    setParentId(mockParentId);
    setPaymentReference(generatePaymentReference(mockParentId));
  }, [router]);

  // Handle filter changes
  const applyFilters = () => {
    const params = new URLSearchParams();
    if (startDate) params.set('startDate', startDate);
    if (endDate) params.set('endDate', endDate);
    params.set('page', '1');
    router.push(`/parent/payments?${params.toString()}`);
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    router.push('/parent/payments');
  };

  // Handle pagination
  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('page', String(newPage));
    router.push(`/parent/payments?${params.toString()}`);
  };

  const handleViewPayment = (paymentId: string) => {
    setSelectedPaymentId(paymentId);
  };

  const handleClosePaymentDetail = () => {
    setSelectedPaymentId(null);
  };

  const handleReferenceChange = useCallback((ref: string) => {
    setPaymentReference(ref);
  }, []);

  if (isError) {
    return (
      <div className="max-w-lg mx-auto mt-8">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error?.message || 'Unable to load your payments. Please try again.'}
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

  const payments = data?.payments || [];
  const totalOutstanding = data?.totalOutstanding || 0;
  const totalPages = data?.totalPages || 1;
  const currentPage = filters.page || 1;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CreditCard className="h-6 w-6" />
          My Payments
        </h1>
        <p className="text-muted-foreground mt-1">
          View payment history and make EFT payments
        </p>
      </div>

      {/* Outstanding Amount Banner */}
      {totalOutstanding > 0 && (
        <Alert variant="destructive" className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Outstanding Balance</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>
              You have an outstanding balance of{' '}
              <strong className="text-lg">{formatCurrency(totalOutstanding)}</strong>
            </span>
            <Button variant="destructive" size="sm" onClick={() => {}}>
              Pay Now
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Bank Details Card */}
      <BankDetailsCard
        bankDetails={bankDetails}
        isLoading={bankDetailsLoading}
        error={bankDetailsError ?? null}
        paymentReference={paymentReference}
      />

      {/* Date Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Filter by Date
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 items-end">
            <div className="w-full sm:w-auto">
              <Label htmlFor="startDate" className="text-sm">From</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full sm:w-40"
              />
            </div>
            <div className="w-full sm:w-auto">
              <Label htmlFor="endDate" className="text-sm">To</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full sm:w-40"
              />
            </div>
            <div className="flex gap-2 w-full sm:w-auto">
              <Button onClick={applyFilters} className="flex-1 sm:flex-none">
                Apply Filter
              </Button>
              {(startDate || endDate) && (
                <Button variant="outline" onClick={clearFilters}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payment List */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Payment History</h2>
        <PaymentList
          payments={payments}
          isLoading={isLoading}
          onViewPayment={handleViewPayment}
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && !isLoading && payments.length > 0 && (
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

      {/* Payment Detail Modal */}
      <PaymentDetail
        paymentId={selectedPaymentId}
        open={!!selectedPaymentId}
        onClose={handleClosePaymentDetail}
      />
    </div>
  );
}

// Loading fallback for Suspense
function PaymentsLoadingFallback() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// Main page component with Suspense boundary for useSearchParams
export default function ParentPaymentsPage() {
  return (
    <Suspense fallback={<PaymentsLoadingFallback />}>
      <PaymentsPageContent />
    </Suspense>
  );
}
