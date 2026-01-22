'use client';

/**
 * Payment Detail Modal Component
 * TASK-PORTAL-015: Parent Portal Payments Page
 *
 * Modal component showing payment details:
 * - Payment header (date, amount, reference)
 * - Payment method (EFT, Card, etc.)
 * - Invoice allocations table
 * - Receipt download button (if available)
 */

import { Receipt, Download, FileText, X, AlertCircle, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { useParentPayment, useDownloadPaymentReceipt } from '@/hooks/parent-portal/use-parent-payments';
import type { ParentPaymentStatus } from '@/hooks/parent-portal/use-parent-payments';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

interface PaymentDetailProps {
  paymentId: string | null;
  open: boolean;
  onClose: () => void;
}

const statusConfig: Record<
  ParentPaymentStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' }
> = {
  completed: { label: 'Completed', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  failed: { label: 'Failed', variant: 'destructive' },
};

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-8 w-24" />
      </div>

      {/* Info grid skeleton */}
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1">
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-5 w-24" />
          </div>
        ))}
      </div>

      {/* Table skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-32" />
        <div className="rounded-md border">
          <div className="p-4 space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PaymentDetail({ paymentId, open, onClose }: PaymentDetailProps) {
  const { data: payment, isLoading, error } = useParentPayment(paymentId || '', open && !!paymentId);
  const { downloadReceipt } = useDownloadPaymentReceipt();
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownloadReceipt = async () => {
    if (!payment) return;

    setIsDownloading(true);
    try {
      await downloadReceipt(payment.id, payment.reference);
      toast({
        title: 'Receipt downloaded',
        description: 'Your receipt has been downloaded successfully',
      });
    } catch (err) {
      toast({
        title: 'Download failed',
        description: err instanceof Error ? err.message : 'Failed to download receipt',
        variant: 'destructive',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5" />
            Payment Details
          </DialogTitle>
          <DialogDescription>
            View payment information and invoice allocations
          </DialogDescription>
        </DialogHeader>

        {isLoading && <DetailSkeleton />}

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Failed to load payment details: {error.message}
            </AlertDescription>
          </Alert>
        )}

        {payment && (
          <div className="space-y-6">
            {/* Payment Header */}
            <div className="flex justify-between items-start">
              <div>
                <h3 className="text-2xl font-bold">{formatCurrency(payment.amount)}</h3>
                <p className="text-sm text-muted-foreground">
                  {formatDate(payment.paymentDate)}
                </p>
              </div>
              <Badge variant={statusConfig[payment.status].variant} className="text-sm">
                {statusConfig[payment.status].label}
              </Badge>
            </div>

            <Separator />

            {/* Payment Info Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Reference</p>
                <p className="font-mono font-medium">{payment.reference}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Method</p>
                <p className="font-medium">{payment.method}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Date</p>
                <p className="font-medium">{formatDate(payment.paymentDate)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide">Status</p>
                <p className="font-medium">{statusConfig[payment.status].label}</p>
              </div>
            </div>

            {payment.notes && (
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
                <p className="text-sm">{payment.notes}</p>
              </div>
            )}

            <Separator />

            {/* Invoice Allocations */}
            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Invoice Allocations
              </h4>

              {payment.allocations.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No invoice allocations found</p>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Child</TableHead>
                        <TableHead className="text-right">Invoice Total</TableHead>
                        <TableHead className="text-right">Allocated</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payment.allocations.map((allocation) => (
                        <TableRow key={allocation.invoiceId}>
                          <TableCell className="font-medium">
                            {allocation.invoiceNumber}
                          </TableCell>
                          <TableCell>{allocation.childName || '-'}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {formatCurrency(allocation.invoiceTotal)}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-green-600">
                            {formatCurrency(allocation.allocatedAmount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-4">
              <Button variant="outline" onClick={onClose}>
                <X className="h-4 w-4 mr-2" />
                Close
              </Button>
              {payment.hasReceipt && (
                <Button onClick={handleDownloadReceipt} disabled={isDownloading}>
                  {isDownloading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Download Receipt
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
