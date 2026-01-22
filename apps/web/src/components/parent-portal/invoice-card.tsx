'use client';

/**
 * Invoice Card Component (Mobile View)
 * TASK-PORTAL-013: Parent Portal Invoices Page
 *
 * Card layout for displaying invoice on mobile:
 * - Invoice number, date, child name
 * - Amount prominently displayed
 * - Status badge (paid=green, pending=yellow, overdue=red)
 * - View details button
 */

import { ChevronRight } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/utils';

export type InvoiceStatus = 'paid' | 'pending' | 'overdue';

export interface InvoiceCardData {
  id: string;
  invoiceNumber: string;
  date: string;
  childName?: string;
  amount: number;
  status: InvoiceStatus;
}

interface InvoiceCardProps {
  invoice: InvoiceCardData;
  onViewDetails?: (invoiceId: string) => void;
}

const statusConfig: Record<
  InvoiceStatus,
  { label: string; variant: 'success' | 'warning' | 'destructive' }
> = {
  paid: { label: 'Paid', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  overdue: { label: 'Overdue', variant: 'destructive' },
};

export function InvoiceCard({ invoice, onViewDetails }: InvoiceCardProps) {
  const status = statusConfig[invoice.status];

  return (
    <Card
      className={`cursor-pointer transition-colors hover:bg-muted/50 ${
        invoice.status === 'overdue' ? 'border-red-200 bg-red-50/50' : ''
      }`}
      onClick={() => onViewDetails?.(invoice.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          {/* Left side: Invoice details */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm truncate">
                {invoice.invoiceNumber}
              </span>
              <Badge variant={status.variant} className="text-xs">
                {status.label}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {formatDate(invoice.date)}
            </p>
            {invoice.childName && (
              <p className="text-sm text-muted-foreground truncate">
                {invoice.childName}
              </p>
            )}
          </div>

          {/* Right side: Amount and action */}
          <div className="flex flex-col items-end gap-2">
            <span
              className={`text-lg font-bold ${
                invoice.status === 'overdue' ? 'text-red-600' : ''
              }`}
            >
              {formatCurrency(invoice.amount)}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onViewDetails?.(invoice.id);
              }}
            >
              View
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
