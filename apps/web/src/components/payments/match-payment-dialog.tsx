/**
 * Match Payment Dialog Component
 *
 * Dialog for matching payments to invoices with:
 * - AI match suggestions with confidence scores
 * - Manual invoice search
 * - Allocation form for partial payments
 */

import * as React from 'react';
import { IPayment } from '@crechebooks/types';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils';
import { MatchSuggestions } from './match-suggestions';
import { InvoiceSearch } from './invoice-search';
import { AllocationForm } from './allocation-form';
import { usePaymentSuggestions, useAllocatePayment } from '@/hooks/use-payments';
import { Separator } from '@/components/ui/separator';

interface MatchPaymentDialogProps {
  payment: IPayment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function MatchPaymentDialog({
  payment,
  open,
  onOpenChange,
  onSuccess,
}: MatchPaymentDialogProps) {
  const [selectedInvoiceId, setSelectedInvoiceId] = React.useState<string | undefined>();
  const [activeTab, setActiveTab] = React.useState<'suggestions' | 'search'>('suggestions');

  const { data: suggestions, isLoading: suggestionsLoading } = usePaymentSuggestions(
    payment?.id || '',
    !!payment?.id && open
  );

  const allocatePayment = useAllocatePayment();

  // Reset state when dialog opens/closes
  React.useEffect(() => {
    if (!open) {
      setSelectedInvoiceId(undefined);
      setActiveTab('suggestions');
    }
  }, [open]);

  const handleSelectSuggestion = (invoiceId: string) => {
    setSelectedInvoiceId(invoiceId);
  };

  const handleAllocate = async (data: { allocations: { invoiceId: string; amount: number }[] }) => {
    if (!payment) return;

    try {
      await allocatePayment.mutateAsync({
        paymentId: payment.id,
        allocations: data.allocations,
      });

      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to allocate payment:', error);
    }
  };

  if (!payment) return null;

  const selectedSuggestion = suggestions?.find((s) => s.invoiceId === selectedInvoiceId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Match Payment</DialogTitle>
          <DialogDescription>
            Match this payment to an invoice or allocate it manually
          </DialogDescription>
        </DialogHeader>

        {/* Payment Details */}
        <div className="rounded-lg border p-4 space-y-2">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Amount</p>
              <p className="font-semibold text-lg">{formatCurrency(payment.amount)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Date</p>
              <p className="font-medium">{formatDate(payment.date)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Reference</p>
              <p className="font-medium">{payment.reference || 'N/A'}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Source</p>
              <p className="font-medium">{payment.source}</p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Tabs for Suggestions vs Manual Search */}
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'suggestions' | 'search')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="suggestions">AI Suggestions</TabsTrigger>
            <TabsTrigger value="search">Manual Search</TabsTrigger>
          </TabsList>

          <TabsContent value="suggestions" className="space-y-4">
            <MatchSuggestions
              suggestions={suggestions || []}
              selectedInvoiceId={selectedInvoiceId}
              onSelectSuggestion={handleSelectSuggestion}
              isLoading={suggestionsLoading}
            />
          </TabsContent>

          <TabsContent value="search" className="space-y-4">
            <InvoiceSearch
              tenantId={payment.tenantId}
              selectedInvoiceId={selectedInvoiceId}
              onSelectInvoice={setSelectedInvoiceId}
            />
          </TabsContent>
        </Tabs>

        {/* Allocation Form */}
        {selectedInvoiceId && (
          <>
            <Separator />
            <div className="space-y-4">
              <h3 className="font-semibold">Allocate Payment</h3>

              <AllocationForm
                paymentAmount={payment.amount}
                invoiceId={selectedInvoiceId}
                invoiceAmount={selectedSuggestion?.amount}
                onSubmit={handleAllocate}
                isSubmitting={allocatePayment.isPending}
              />
            </div>
          </>
        )}

        {/* Error Display */}
        {allocatePayment.isError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to allocate payment: {
                allocatePayment.error instanceof Error
                  ? allocatePayment.error.message
                  : 'Unknown error'
              }
            </AlertDescription>
          </Alert>
        )}

        {/* Success Display */}
        {allocatePayment.isSuccess && (
          <Alert>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-600">
              Payment allocated successfully!
            </AlertDescription>
          </Alert>
        )}
      </DialogContent>
    </Dialog>
  );
}
