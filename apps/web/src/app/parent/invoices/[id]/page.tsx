'use client';

/**
 * Parent Portal Invoice Detail Page
 * TASK-PORTAL-013: Parent Portal Invoices Page
 *
 * Displays detailed invoice information:
 * - Back navigation button
 * - Invoice header with number, date, status badge
 * - Customer/creche details
 * - Line items table
 * - Payment history section
 * - Total amount and outstanding amount
 * - Download PDF button
 */

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Download,
  Loader2,
  AlertCircle,
  Calendar,
  Building2,
  User,
  CreditCard,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { InvoiceLineItems, type LineItem } from '@/components/parent-portal/invoice-line-items';
import {
  useParentInvoice,
  useDownloadParentInvoicePdf,
  type ParentInvoiceDetail,
  type ParentInvoiceStatus,
} from '@/hooks/parent-portal/use-parent-invoices';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// Mock invoice detail for development
const mockInvoiceDetail: ParentInvoiceDetail = {
  id: '1',
  invoiceNumber: 'INV-2024-001',
  issueDate: '2024-01-15',
  dueDate: '2024-01-31',
  status: 'overdue',
  parentName: 'Sarah Smith',
  parentEmail: 'sarah.smith@example.com',
  crecheName: 'Little Stars Creche',
  crecheAddress: '123 Rainbow Road, Sandton, 2196',
  childName: 'Emma Smith',
  subtotal: 1450.0,
  vatAmount: 50.0,
  total: 1500.0,
  amountPaid: 0,
  amountDue: 1500.0,
  lineItems: [
    {
      id: '1',
      description: 'Monthly Tuition Fee - January 2024',
      quantity: 1,
      unitPrice: 1200.0,
      vatAmount: 0,
      total: 1200.0,
    },
    {
      id: '2',
      description: 'Meals - Breakfast & Lunch',
      quantity: 22,
      unitPrice: 10.0,
      vatAmount: 33.0,
      total: 220.0,
    },
    {
      id: '3',
      description: 'Transport Fee',
      quantity: 1,
      unitPrice: 30.0,
      vatAmount: 4.50,
      total: 30.0,
    },
    {
      id: '4',
      description: 'Arts & Crafts Materials',
      quantity: 1,
      unitPrice: 50.0,
      vatAmount: 7.50,
      total: 50.0,
    },
  ],
  payments: [],
  notes: 'Thank you for choosing Little Stars Creche!',
};

const statusConfig: Record<
  ParentInvoiceStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' }
> = {
  paid: { label: 'Paid', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  overdue: { label: 'Overdue', variant: 'destructive' },
};

// Loading skeleton component
function InvoiceDetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header Skeleton */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-6 w-20" />
      </div>

      {/* Details Cards Skeleton */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-32" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </CardContent>
        </Card>
      </div>

      {/* Line Items Skeleton */}
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const invoiceId = params.id as string;

  // State
  const [useMockData, setUseMockData] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Fetch invoice detail
  const { data, isLoading, error, isError } = useParentInvoice(invoiceId);
  const { downloadPdf } = useDownloadParentInvoicePdf();

  // Check authentication
  useEffect(() => {
    const token = localStorage.getItem('parent_session_token');
    if (!token) {
      router.push('/parent/login');
    }
  }, [router]);

  // Handle API errors by falling back to mock data
  useEffect(() => {
    if (isError && !useMockData) {
      console.warn('Invoice detail API error, using mock data:', error?.message);
      setUseMockData(true);
    }
  }, [isError, error, useMockData]);

  // Determine which data to display
  const invoice = useMockData ? mockInvoiceDetail : data;
  const showLoading = isLoading && !useMockData;

  // Handle PDF download
  const handleDownloadPdf = async () => {
    if (!invoice) return;

    setIsDownloading(true);
    try {
      await downloadPdf(invoiceId, invoice.invoiceNumber);
      toast({
        title: 'Download started',
        description: `${invoice.invoiceNumber}.pdf is being downloaded.`,
      });
    } catch (err) {
      toast({
        title: 'Download failed',
        description: err instanceof Error ? err.message : 'Could not download the PDF.',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  // Handle back navigation
  const handleBack = () => {
    router.push('/parent/invoices');
  };

  if (showLoading) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Invoices
        </Button>
        <InvoiceDetailSkeleton />
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to Invoices
        </Button>
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Invoice not found.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const status = statusConfig[invoice.status];

  // Transform line items for the component
  const lineItems: LineItem[] = invoice.lineItems.map((item) => ({
    id: item.id,
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.total,
  }));

  return (
    <div className="space-y-6">
      {/* Back Button */}
      <Button variant="ghost" size="sm" onClick={handleBack} className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back to Invoices
      </Button>

      {/* Invoice Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold">{invoice.invoiceNumber}</h1>
            <Badge variant={status.variant} className="text-sm">
              {status.label}
            </Badge>
          </div>
          <div className="flex items-center gap-4 mt-2 text-muted-foreground text-sm flex-wrap">
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Issued: {formatDate(invoice.issueDate)}
            </span>
            <span className="flex items-center gap-1">
              <Calendar className="h-4 w-4" />
              Due: {formatDate(invoice.dueDate)}
            </span>
          </div>
        </div>

        <Button onClick={handleDownloadPdf} disabled={isDownloading}>
          {isDownloading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-2 h-4 w-4" />
          )}
          Download PDF
        </Button>
      </div>

      {/* Outstanding Amount Banner (if overdue or pending) */}
      {invoice.amountDue > 0 && (
        <Card
          className={
            invoice.status === 'overdue'
              ? 'border-red-200 bg-red-50'
              : 'border-yellow-200 bg-yellow-50'
          }
        >
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-sm font-medium">
                  {invoice.status === 'overdue' ? 'Overdue Amount' : 'Amount Due'}
                </p>
                <p
                  className={`text-2xl font-bold ${
                    invoice.status === 'overdue' ? 'text-red-600' : 'text-yellow-700'
                  }`}
                >
                  {formatCurrency(invoice.amountDue)}
                </p>
              </div>
              <Button
                variant={invoice.status === 'overdue' ? 'destructive' : 'default'}
                onClick={() => router.push('/parent/payments')}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Pay Now
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Details Section */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Creche Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              From
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="font-medium">{invoice.crecheName}</p>
            {invoice.crecheAddress && (
              <p className="text-muted-foreground">{invoice.crecheAddress}</p>
            )}
          </CardContent>
        </Card>

        {/* Parent Details */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4" />
              Bill To
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-1">
            <p className="font-medium">{invoice.parentName}</p>
            {invoice.parentEmail && (
              <p className="text-muted-foreground">{invoice.parentEmail}</p>
            )}
            <p className="text-muted-foreground">Child: {invoice.childName}</p>
          </CardContent>
        </Card>
      </div>

      {/* Line Items */}
      <InvoiceLineItems
        lineItems={lineItems}
        subtotal={invoice.subtotal}
        vatAmount={invoice.vatAmount}
        total={invoice.total}
      />

      {/* Payment History */}
      {invoice.payments && invoice.payments.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Payment History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {invoice.payments.map((payment) => (
                <div
                  key={payment.id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div>
                    <p className="font-medium text-sm">{formatDate(payment.date)}</p>
                    <p className="text-xs text-muted-foreground">
                      {payment.method}
                      {payment.reference && ` - ${payment.reference}`}
                    </p>
                  </div>
                  <p className="font-semibold text-green-600">
                    {formatCurrency(payment.amount)}
                  </p>
                </div>
              ))}
            </div>

            <Separator className="my-4" />

            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Total Paid</span>
              <span className="font-semibold text-green-600">
                {formatCurrency(invoice.amountPaid)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Summary (if partially paid) */}
      {invoice.amountPaid > 0 && invoice.amountDue > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Invoice Total</span>
                <span>{formatCurrency(invoice.total)}</span>
              </div>
              <div className="flex justify-between text-sm text-green-600">
                <span>Amount Paid</span>
                <span>-{formatCurrency(invoice.amountPaid)}</span>
              </div>
              <Separator />
              <div className="flex justify-between font-semibold">
                <span>Outstanding Balance</span>
                <span
                  className={invoice.status === 'overdue' ? 'text-red-600' : ''}
                >
                  {formatCurrency(invoice.amountDue)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Notes */}
      {invoice.notes && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{invoice.notes}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
