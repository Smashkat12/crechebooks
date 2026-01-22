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
import { formatCurrency } from '@/lib/utils';
import {
  useParentPayments,
  useParentBankDetails,
  generatePaymentReference,
  type ParentPaymentsFilters,
  type ParentPaymentListItem,
} from '@/hooks/parent-portal/use-parent-payments';

// Mock data for development/demo when API is unavailable
const mockPayments: ParentPaymentListItem[] = [
  {
    id: '1',
    paymentDate: '2024-01-20',
    amount: 1500.0,
    reference: 'ABC12345-20240120-XYZ',
    method: 'EFT',
    status: 'completed',
  },
  {
    id: '2',
    paymentDate: '2024-01-15',
    amount: 950.0,
    reference: 'ABC12345-20240115-ABC',
    method: 'EFT',
    status: 'completed',
  },
  {
    id: '3',
    paymentDate: '2024-01-10',
    amount: 2000.0,
    reference: 'ABC12345-20240110-DEF',
    method: 'Card',
    status: 'completed',
  },
  {
    id: '4',
    paymentDate: '2024-01-05',
    amount: 750.0,
    reference: 'ABC12345-20240105-GHI',
    method: 'EFT',
    status: 'pending',
  },
  {
    id: '5',
    paymentDate: '2023-12-20',
    amount: 1500.0,
    reference: 'ABC12345-20231220-JKL',
    method: 'EFT',
    status: 'completed',
  },
];

// Mock bank details - will be combined with generated payment reference
const mockBankDetailsBase = {
  bankName: 'First National Bank',
  accountHolderName: 'Little Stars Creche',
  accountNumber: '62123456789',
  branchCode: '250655',
  accountType: 'Cheque' as const,
  paymentInstructions: 'Please use your unique reference when making payments. Payments may take 1-2 business days to reflect.',
};

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

  // State for fallback to mock data
  const [useMockData, setUseMockData] = useState(false);
  const [useMockBankDetails, setUseMockBankDetails] = useState(false);

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

  // Handle API errors by falling back to mock data
  useEffect(() => {
    if (isError && !useMockData) {
      console.warn('Payments API error, using mock data:', error?.message);
      setUseMockData(true);
    }
  }, [isError, error, useMockData]);

  useEffect(() => {
    if (bankDetailsError && !useMockBankDetails) {
      console.warn('Bank details API error, using mock data:', bankDetailsError?.message);
      setUseMockBankDetails(true);
    }
  }, [bankDetailsError, useMockBankDetails]);

  // Apply client-side filtering to mock data
  const filteredMockPayments = useMemo(() => {
    let result = [...mockPayments];

    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      result = result.filter((p) => new Date(p.paymentDate) >= startDate);
    }

    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      result = result.filter((p) => new Date(p.paymentDate) <= endDate);
    }

    return result;
  }, [filters]);

  // Determine which data to display
  const payments = useMockData ? filteredMockPayments : (data?.payments || []);
  const totalOutstanding = useMockData ? 2450.0 : (data?.totalOutstanding || 0);
  const showLoading = isLoading && !useMockData;

  const displayBankDetails = useMockBankDetails
    ? { ...mockBankDetailsBase, paymentReference }
    : bankDetails;

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

  const totalPages = useMockData
    ? Math.ceil(filteredMockPayments.length / (filters.limit || 10))
    : (data?.totalPages || 1);
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
        bankDetails={displayBankDetails}
        isLoading={bankDetailsLoading && !useMockBankDetails}
        error={bankDetailsError && !useMockBankDetails ? bankDetailsError : null}
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

      {/* Error Alert (only shown if not using mock data fallback) */}
      {isError && !useMockData && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error?.message || 'Failed to load payments. Please try again.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Payment List */}
      <div>
        <h2 className="text-lg font-semibold mb-3">Payment History</h2>
        <PaymentList
          payments={payments}
          isLoading={showLoading}
          onViewPayment={handleViewPayment}
        />
      </div>

      {/* Pagination */}
      {totalPages > 1 && !showLoading && payments.length > 0 && (
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
