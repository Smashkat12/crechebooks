'use client';

/**
 * Invoice List Component
 * TASK-PORTAL-013: Parent Portal Invoices Page
 *
 * Displays invoices with responsive design:
 * - Desktop: Table view with columns (Invoice #, Date, Child, Amount, Status, Actions)
 * - Mobile: Card view using InvoiceCard component
 * - Loading skeleton state
 * - Empty state message
 */

import { FileText } from 'lucide-react';
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
import { formatCurrency, formatDate } from '@/lib/utils';
import { InvoiceCard, type InvoiceCardData, type InvoiceStatus } from './invoice-card';

export interface InvoiceListItem {
  id: string;
  invoiceNumber: string;
  date: string;
  childName?: string;
  amount: number;
  status: InvoiceStatus;
}

interface InvoiceListProps {
  invoices: InvoiceListItem[];
  isLoading?: boolean;
  onViewInvoice?: (invoiceId: string) => void;
}

const statusConfig: Record<
  InvoiceStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' }
> = {
  paid: { label: 'Paid', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  overdue: { label: 'Overdue', variant: 'destructive' },
};

// Loading skeleton for desktop table
function TableSkeleton() {
  return (
    <div className="hidden md:block">
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Child</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-5 w-16" /></TableCell>
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
        <div key={i} className="rounded-lg border p-4">
          <div className="flex justify-between items-start">
            <div className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="text-right space-y-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-8 w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Empty state component
function EmptyState() {
  return (
    <div className="text-center py-12 px-4">
      <FileText className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
      <h3 className="text-lg font-medium mb-2">No invoices found</h3>
      <p className="text-muted-foreground max-w-md mx-auto">
        You don&apos;t have any invoices matching the current filters. Try adjusting
        your filters or check back later.
      </p>
    </div>
  );
}

export function InvoiceList({ invoices, isLoading, onViewInvoice }: InvoiceListProps) {
  if (isLoading) {
    return (
      <>
        <TableSkeleton />
        <CardsSkeleton />
      </>
    );
  }

  if (invoices.length === 0) {
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
                <TableHead>Invoice #</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Child</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoices.map((invoice) => {
                const status = statusConfig[invoice.status];
                return (
                  <TableRow
                    key={invoice.id}
                    className={`cursor-pointer ${
                      invoice.status === 'overdue' ? 'bg-red-50/50' : ''
                    }`}
                    onClick={() => onViewInvoice?.(invoice.id)}
                  >
                    <TableCell className="font-medium">
                      {invoice.invoiceNumber}
                    </TableCell>
                    <TableCell>{formatDate(invoice.date)}</TableCell>
                    <TableCell>{invoice.childName || '-'}</TableCell>
                    <TableCell
                      className={`text-right font-semibold ${
                        invoice.status === 'overdue' ? 'text-red-600' : ''
                      }`}
                    >
                      {formatCurrency(invoice.amount)}
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
                          onViewInvoice?.(invoice.id);
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
        {invoices.map((invoice) => (
          <InvoiceCard
            key={invoice.id}
            invoice={invoice as InvoiceCardData}
            onViewDetails={onViewInvoice}
          />
        ))}
      </div>
    </>
  );
}
