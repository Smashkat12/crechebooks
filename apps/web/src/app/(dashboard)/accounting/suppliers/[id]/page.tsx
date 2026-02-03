'use client';

/**
 * TASK-ACCT-UI-004: Supplier Detail Page
 * View supplier details, bills, and record payments.
 */

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Pencil,
  Plus,
  FileText,
  Building2,
  Mail,
  Phone,
  MapPin,
  CreditCard,
  Calendar,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { BillForm } from '@/components/accounting/bill-form';
import { BillTable } from '@/components/accounting/bill-table';
import { PaymentForm } from '@/components/accounting/payment-form';
import {
  useSupplier,
  useSupplierStatement,
  useCreateBill,
  useRecordPayment,
  type SupplierBill,
  type CreateBillDto,
  type RecordPaymentDto,
} from '@/hooks/use-suppliers';
import { useAccountsList } from '@/hooks/use-accounts';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';

export default function SupplierDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const supplierId = params.id as string;

  const [showBillDialog, setShowBillDialog] = useState(false);
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<SupplierBill | null>(null);

  // Open bill dialog if URL has createBill param
  useEffect(() => {
    if (searchParams.get('createBill') === 'true') {
      setShowBillDialog(true);
    }
  }, [searchParams]);

  // Date range for statement (last 12 months)
  const today = new Date();
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const fromDate = yearAgo.toISOString().split('T')[0];
  const toDate = today.toISOString().split('T')[0];

  const { data: supplier, isLoading, error } = useSupplier(supplierId);
  const { data: statement } = useSupplierStatement(supplierId, fromDate, toDate);
  const { data: accounts } = useAccountsList({ isActive: true });

  const createBill = useCreateBill(supplierId);
  const recordPayment = useRecordPayment(
    selectedBillForPayment?.id || '',
    supplierId
  );

  const handleCreateBill = (data: CreateBillDto) => {
    createBill.mutate(data, {
      onSuccess: () => {
        toast({
          title: 'Bill created',
          description: `Bill ${data.billNumber} has been recorded.`,
        });
        setShowBillDialog(false);
      },
      onError: (error) => {
        toast({
          title: 'Failed to create bill',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  const handleRecordPayment = (data: RecordPaymentDto) => {
    recordPayment.mutate(data, {
      onSuccess: () => {
        toast({
          title: 'Payment recorded',
          description: `Payment of ${formatCurrency(data.amountCents / 100)} has been recorded.`,
        });
        setSelectedBillForPayment(null);
      },
      onError: (error) => {
        toast({
          title: 'Failed to record payment',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive font-medium">Failed to load supplier</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32 mt-2" />
          </div>
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!supplier) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Supplier not found</p>
      </div>
    );
  }

  const bills = statement?.bills || [];
  const totalOutstanding = bills.reduce((sum, bill) => sum + bill.balanceDueCents, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/accounting/suppliers">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold tracking-tight">{supplier.name}</h1>
              <Badge variant={supplier.isActive ? 'default' : 'secondary'}>
                {supplier.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            {supplier.tradingName && (
              <p className="text-muted-foreground">Trading as: {supplier.tradingName}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/accounting/suppliers/${supplierId}/statement`}>
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Statement
            </Button>
          </Link>
          <Link href={`/accounting/suppliers/${supplierId}/edit`}>
            <Button variant="outline">
              <Pencil className="h-4 w-4 mr-2" />
              Edit
            </Button>
          </Link>
          <Button onClick={() => setShowBillDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Bill
          </Button>
        </div>
      </div>

      {/* Supplier Info Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Contact Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {supplier.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <a href={`mailto:${supplier.email}`} className="hover:underline">
                  {supplier.email}
                </a>
              </div>
            )}
            {supplier.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{supplier.phone}</span>
              </div>
            )}
            {supplier.address && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                <span className="whitespace-pre-line">{supplier.address}</span>
              </div>
            )}
            {!supplier.email && !supplier.phone && !supplier.address && (
              <p className="text-sm text-muted-foreground">No contact info</p>
            )}
          </CardContent>
        </Card>

        {/* Registration Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Registration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {supplier.vatNumber && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">VAT Number:</span>
                <span className="font-mono">{supplier.vatNumber}</span>
              </div>
            )}
            {supplier.registrationNumber && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Reg. Number:</span>
                <span className="font-mono">{supplier.registrationNumber}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Payment Terms:</span>
              <span>{supplier.paymentTermsDays} days</span>
            </div>
            {!supplier.vatNumber && !supplier.registrationNumber && (
              <p className="text-sm text-muted-foreground">No registration info</p>
            )}
          </CardContent>
        </Card>

        {/* Bank Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4" />
              Bank Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {supplier.bankName ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Bank:</span>
                  <span>{supplier.bankName}</span>
                </div>
                {supplier.branchCode && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Branch Code:</span>
                    <span className="font-mono">{supplier.branchCode}</span>
                  </div>
                )}
                {supplier.accountNumber && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Account:</span>
                    <span className="font-mono">
                      ****{supplier.accountNumber.slice(-4)}
                    </span>
                  </div>
                )}
                {supplier.accountType && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Type:</span>
                    <span>{supplier.accountType}</span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No bank details</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Outstanding Balance */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Outstanding Balance</CardTitle>
          <div className="text-2xl font-bold font-mono">
            {totalOutstanding > 0 ? (
              <span className="text-red-600">{formatCurrency(totalOutstanding / 100)}</span>
            ) : (
              <span className="text-emerald-600">{formatCurrency(0)}</span>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* Bills Tab */}
      <Tabs defaultValue="bills">
        <TabsList>
          <TabsTrigger value="bills" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Bills ({bills.length})
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bills" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <BillTable
                bills={bills}
                supplierId={supplierId}
                onRecordPayment={setSelectedBillForPayment}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Activity history coming soon</p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Create Bill Dialog */}
      <Dialog open={showBillDialog} onOpenChange={setShowBillDialog}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create Bill for {supplier.name}</DialogTitle>
          </DialogHeader>
          <BillForm
            accounts={accounts}
            defaultAccountId={supplier.defaultAccountId}
            onSubmit={handleCreateBill}
            isLoading={createBill.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Record Payment Dialog */}
      <Dialog
        open={!!selectedBillForPayment}
        onOpenChange={() => setSelectedBillForPayment(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          {selectedBillForPayment && (
            <PaymentForm
              bill={selectedBillForPayment}
              onSubmit={handleRecordPayment}
              onCancel={() => setSelectedBillForPayment(null)}
              isLoading={recordPayment.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
