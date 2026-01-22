'use client';

/**
 * Payment List Component
 * TASK-PORTAL-015: Parent Portal Payments Page
 *
 * Displays payment history with:
 * - Payment date, amount, reference, status columns
 * - Click to view detail modal
 * - Loading skeleton state
 * - Empty state message
 * - Responsive design (table on desktop, cards on mobile)
 */

import { CreditCard, ChevronRight } from 'lucide-react';
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
import { Card } from '@/components/ui/card';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import type { ParentPaymentListItem, ParentPaymentStatus } from '@/hooks/parent-portal/use-parent-payments';

interface PaymentListProps {
  payments: ParentPaymentListItem[];
  isLoading?: boolean;
  onViewPayment?: (paymentId: string) => void;
}

const statusConfig: Record<
  ParentPaymentStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' }
> = {
  completed: { label: 'Completed', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  failed: { label: 'Failed', variant: 'destructive' },
};

// Loading skeleton for desktop table
function TableSkeleton() {
  return (
    <div className="hidden md:block">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Reference</TableHead>
              <TableHead>Method</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-8 w-16 ml-auto" /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// Loading skeleton for mobile cards
function CardsSkeleton() {
  return (
    <div className="md:hidden space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i} className="p-4">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-3 w-16" />
            </div>
            <div className="text-right space-y-2">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

// Empty state component
function EmptyState() {
  return (
    <div className="text-center py-12 px-4">
      <CreditCard className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
      <h3 className="text-lg font-medium mb-2">No payments found</h3>
      <p className="text-muted-foreground max-w-md mx-auto">
        You don&apos;t have any payments matching the current filters. Try adjusting
        your date range or check back later.
      </p>
    </div>
  );
}

// Mobile payment card
function PaymentCard({
  payment,
  onView,
}: {
  payment: ParentPaymentListItem;
  onView?: () => void;
}) {
  const status = statusConfig[payment.status];

  return (
    <Card
      className={cn(
        'p-4 cursor-pointer transition-colors hover:bg-muted/50',
        payment.status === 'failed' && 'border-red-200 bg-red-50/50'
      )}
      onClick={onView}
    >
      <div className="flex justify-between items-start">
        <div className="space-y-1">
          <div className="font-medium">{formatDate(payment.paymentDate)}</div>
          <div className="text-sm text-muted-foreground font-mono">
            {payment.reference}
          </div>
          <div className="text-xs text-muted-foreground">{payment.method}</div>
        </div>
        <div className="text-right space-y-1">
          <div className="font-semibold text-lg">{formatCurrency(payment.amount)}</div>
          <Badge variant={status.variant}>{status.label}</Badge>
        </div>
      </div>
      <div className="flex justify-end mt-2">
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Card>
  );
}

export function PaymentList({ payments, isLoading, onViewPayment }: PaymentListProps) {
  if (isLoading) {
    return (
      <>
        <TableSkeleton />
        <CardsSkeleton />
      </>
    );
  }

  if (payments.length === 0) {
    return <EmptyState />;
  }

  return (
    <>
      {/* Desktop Table View */}
      <div className="hidden md:block">
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Method</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((payment) => {
                const status = statusConfig[payment.status];
                return (
                  <TableRow
                    key={payment.id}
                    className={cn(
                      'cursor-pointer',
                      payment.status === 'failed' && 'bg-red-50/50'
                    )}
                    onClick={() => onViewPayment?.(payment.id)}
                  >
                    <TableCell>{formatDate(payment.paymentDate)}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {payment.reference}
                    </TableCell>
                    <TableCell>{payment.method}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatCurrency(payment.amount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewPayment?.(payment.id);
                        }}
                      >
                        View
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-3">
        {payments.map((payment) => (
          <PaymentCard
            key={payment.id}
            payment={payment}
            onView={() => onViewPayment?.(payment.id)}
          />
        ))}
      </div>
    </>
  );
}
