'use client';

/**
 * TASK-ACCT-UI-005: Quote Preview Component
 * Preview component for displaying quote details in a print-friendly format.
 */

import { format } from 'date-fns';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { QuoteStatusBadge } from './quote-status-badge';
import { formatCurrency } from '@/lib/utils';
import type { Quote } from '@/hooks/use-quotes';

interface QuotePreviewProps {
  quote: Quote;
  tenantName?: string;
  tenantAddress?: string;
  tenantPhone?: string;
  tenantEmail?: string;
}

export function QuotePreview({
  quote,
  tenantName = 'CrecheBooks',
  tenantAddress,
  tenantPhone,
  tenantEmail,
}: QuotePreviewProps) {
  return (
    <Card className="print:shadow-none print:border-0">
      <CardHeader className="space-y-4">
        {/* Header with Logo/Name and Quote Number */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold">{tenantName}</h1>
            {tenantAddress && <p className="text-sm text-muted-foreground">{tenantAddress}</p>}
            {tenantPhone && <p className="text-sm text-muted-foreground">Tel: {tenantPhone}</p>}
            {tenantEmail && <p className="text-sm text-muted-foreground">{tenantEmail}</p>}
          </div>
          <div className="text-right">
            <h2 className="text-xl font-bold">QUOTE</h2>
            <p className="font-mono text-lg">{quote.quoteNumber}</p>
            <div className="mt-2">
              <QuoteStatusBadge status={quote.status} />
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Quote Details */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="font-semibold text-sm text-muted-foreground mb-1">QUOTE TO</h3>
            <p className="font-medium">{quote.recipientName}</p>
            <p className="text-sm">{quote.recipientEmail}</p>
            {quote.recipientPhone && <p className="text-sm">{quote.recipientPhone}</p>}
            {quote.childName && (
              <p className="text-sm mt-2">
                <span className="text-muted-foreground">Child: </span>
                {quote.childName}
              </p>
            )}
          </div>
          <div className="text-right">
            <div className="space-y-1">
              <p className="text-sm">
                <span className="text-muted-foreground">Date: </span>
                {format(new Date(quote.quoteDate), 'dd MMMM yyyy')}
              </p>
              <p className="text-sm">
                <span className="text-muted-foreground">Valid Until: </span>
                {format(new Date(quote.expiryDate), 'dd MMMM yyyy')}
              </p>
              {quote.expectedStartDate && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Expected Start: </span>
                  {format(new Date(quote.expectedStartDate), 'dd MMMM yyyy')}
                </p>
              )}
            </div>
          </div>
        </div>

        <Separator />

        {/* Line Items Table */}
        <div>
          <table className="w-full">
            <thead>
              <tr className="border-b text-sm text-muted-foreground">
                <th className="text-left py-2 font-medium">Description</th>
                <th className="text-right py-2 font-medium w-20">Qty</th>
                <th className="text-right py-2 font-medium w-28">Unit Price</th>
                <th className="text-right py-2 font-medium w-20">VAT</th>
                <th className="text-right py-2 font-medium w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {quote.lines.map((line) => (
                <tr key={line.id} className="border-b">
                  <td className="py-3">{line.description}</td>
                  <td className="text-right py-3">{line.quantity}</td>
                  <td className="text-right py-3 font-mono">
                    {formatCurrency(line.unitPriceCents / 100)}
                  </td>
                  <td className="text-right py-3 text-sm text-muted-foreground">
                    {line.vatType === 'STANDARD'
                      ? '15%'
                      : line.vatType === 'EXEMPT'
                        ? 'Exempt'
                        : line.vatType === 'ZERO_RATED'
                          ? '0%'
                          : '-'}
                  </td>
                  <td className="text-right py-3 font-mono">
                    {formatCurrency(line.lineTotalCents / 100)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-mono">{formatCurrency(quote.subtotalCents / 100)}</span>
            </div>
            {quote.vatAmountCents > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">VAT (15%)</span>
                <span className="font-mono">{formatCurrency(quote.vatAmountCents / 100)}</span>
              </div>
            )}
            <Separator />
            <div className="flex justify-between font-bold">
              <span>Total</span>
              <span className="font-mono">{formatCurrency(quote.totalCents / 100)}</span>
            </div>
          </div>
        </div>

        {/* Notes */}
        {quote.notes && (
          <>
            <Separator />
            <div>
              <h3 className="font-semibold text-sm text-muted-foreground mb-2">
                TERMS & CONDITIONS
              </h3>
              <p className="text-sm whitespace-pre-wrap">{quote.notes}</p>
            </div>
          </>
        )}

        {/* Status Information */}
        {(quote.sentAt || quote.viewedAt || quote.acceptedAt || quote.declinedAt) && (
          <>
            <Separator />
            <div className="text-sm text-muted-foreground">
              {quote.sentAt && (
                <p>Sent: {format(new Date(quote.sentAt), 'dd MMM yyyy HH:mm')}</p>
              )}
              {quote.viewedAt && (
                <p>Viewed: {format(new Date(quote.viewedAt), 'dd MMM yyyy HH:mm')}</p>
              )}
              {quote.acceptedAt && (
                <p className="text-emerald-600">
                  Accepted: {format(new Date(quote.acceptedAt), 'dd MMM yyyy HH:mm')}
                </p>
              )}
              {quote.declinedAt && (
                <p className="text-red-600">
                  Declined: {format(new Date(quote.declinedAt), 'dd MMM yyyy HH:mm')}
                  {quote.declineReason && ` - ${quote.declineReason}`}
                </p>
              )}
            </div>
          </>
        )}

        {/* Footer */}
        <div className="pt-4 text-center text-xs text-muted-foreground print:mt-8">
          <p>This quote is valid for {quote.validityDays} days from the date of issue.</p>
          <p>Education services are VAT exempt under Section 12(h) of the VAT Act.</p>
        </div>
      </CardContent>
    </Card>
  );
}
