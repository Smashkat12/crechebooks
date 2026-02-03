'use client';

/**
 * TASK-ACCT-UI-005: Quote Detail Page
 * View quote details with actions.
 */

import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  ArrowLeft,
  Pencil,
  Send,
  CheckCircle,
  XCircle,
  ArrowRight,
  Printer,
  Mail,
  Phone,
  Calendar,
  User,
  Baby,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QuoteStatusBadge } from '@/components/accounting/quote-status-badge';
import { QuotePreview } from '@/components/accounting/quote-preview';
import {
  SendQuoteDialog,
  AcceptQuoteDialog,
  DeclineQuoteDialog,
  ConvertQuoteDialog,
} from '@/components/accounting/quote-actions';
import {
  useQuote,
  useSendQuote,
  useAcceptQuote,
  useDeclineQuote,
  useConvertQuote,
} from '@/hooks/use-quotes';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';

export default function QuoteDetailPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const quoteId = params.id as string;

  // Dialog states
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [showAcceptDialog, setShowAcceptDialog] = useState(false);
  const [showDeclineDialog, setShowDeclineDialog] = useState(false);
  const [showConvertDialog, setShowConvertDialog] = useState(false);

  // Handle URL action params
  useEffect(() => {
    const action = searchParams.get('action');
    if (action === 'send') setShowSendDialog(true);
    else if (action === 'accept') setShowAcceptDialog(true);
    else if (action === 'decline') setShowDeclineDialog(true);
    else if (action === 'convert') setShowConvertDialog(true);
  }, [searchParams]);

  const { data: quote, isLoading, error } = useQuote(quoteId);

  const sendQuote = useSendQuote();
  const acceptQuote = useAcceptQuote();
  const declineQuote = useDeclineQuote();
  const convertQuote = useConvertQuote();

  const handleSend = () => {
    if (!quote) return;
    sendQuote.mutate(quote.id, {
      onSuccess: () => {
        toast({
          title: 'Quote sent',
          description: `Quote ${quote.quoteNumber} has been sent to ${quote.recipientEmail}.`,
        });
        setShowSendDialog(false);
      },
      onError: (error) => {
        toast({
          title: 'Failed to send quote',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  const handleAccept = () => {
    if (!quote) return;
    acceptQuote.mutate(quote.id, {
      onSuccess: () => {
        toast({
          title: 'Quote accepted',
          description: `Quote ${quote.quoteNumber} has been marked as accepted.`,
        });
        setShowAcceptDialog(false);
      },
      onError: (error) => {
        toast({
          title: 'Failed to accept quote',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  const handleDecline = (reason: string) => {
    if (!quote) return;
    declineQuote.mutate(
      { id: quote.id, reason },
      {
        onSuccess: () => {
          toast({
            title: 'Quote declined',
            description: `Quote ${quote.quoteNumber} has been marked as declined.`,
          });
          setShowDeclineDialog(false);
        },
        onError: (error) => {
          toast({
            title: 'Failed to decline quote',
            description: error.message,
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleConvert = (dueDate?: string, notes?: string) => {
    if (!quote) return;
    convertQuote.mutate(
      { id: quote.id, dueDate, notes },
      {
        onSuccess: () => {
          toast({
            title: 'Quote converted',
            description: `Quote ${quote.quoteNumber} has been converted to an invoice.`,
          });
          setShowConvertDialog(false);
        },
        onError: (error) => {
          toast({
            title: 'Failed to convert quote',
            description: error.message,
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handlePrint = () => {
    window.print();
  };

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive font-medium">Failed to load quote</p>
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

  if (!quote) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Quote not found</p>
      </div>
    );
  }

  const canSend = quote.status === 'DRAFT';
  const canEdit = quote.status === 'DRAFT';
  const canAccept = quote.status === 'SENT' || quote.status === 'VIEWED';
  const canDecline = quote.status === 'SENT' || quote.status === 'VIEWED';
  const canConvert = quote.status === 'ACCEPTED';
  const isExpired = new Date(quote.expiryDate) < new Date() && !['CONVERTED', 'ACCEPTED', 'DECLINED'].includes(quote.status);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 print:hidden">
        <div className="flex items-center gap-4">
          <Link href="/accounting/quotes">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{quote.quoteNumber}</h1>
              <QuoteStatusBadge status={quote.status} />
              {isExpired && quote.status !== 'EXPIRED' && (
                <Badge variant="destructive">Expired</Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Created {format(new Date(quote.createdAt), 'dd MMM yyyy')}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          {canEdit && (
            <Link href={`/accounting/quotes/${quote.id}/edit`}>
              <Button variant="outline">
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
            </Link>
          )}
          {canSend && (
            <Button onClick={() => setShowSendDialog(true)}>
              <Send className="h-4 w-4 mr-2" />
              Send Quote
            </Button>
          )}
          {canAccept && (
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setShowAcceptDialog(true)}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Accept
            </Button>
          )}
          {canDecline && (
            <Button variant="destructive" onClick={() => setShowDeclineDialog(true)}>
              <XCircle className="h-4 w-4 mr-2" />
              Decline
            </Button>
          )}
          {canConvert && (
            <Button onClick={() => setShowConvertDialog(true)}>
              <ArrowRight className="h-4 w-4 mr-2" />
              Convert to Invoice
            </Button>
          )}
        </div>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="details" className="print:hidden">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="mt-4 space-y-6">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            {/* Recipient Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Recipient
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="font-medium">{quote.recipientName}</p>
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${quote.recipientEmail}`} className="hover:underline">
                    {quote.recipientEmail}
                  </a>
                </div>
                {quote.recipientPhone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{quote.recipientPhone}</span>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Child Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Baby className="h-4 w-4" />
                  Child Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {quote.childName ? (
                  <>
                    <p className="font-medium">{quote.childName}</p>
                    {quote.childDob && (
                      <p className="text-sm text-muted-foreground">
                        DOB: {format(new Date(quote.childDob), 'dd MMM yyyy')}
                      </p>
                    )}
                    {quote.expectedStartDate && (
                      <p className="text-sm text-muted-foreground">
                        Start: {format(new Date(quote.expectedStartDate), 'dd MMM yyyy')}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">No child information</p>
                )}
              </CardContent>
            </Card>

            {/* Quote Info */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Quote Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Quote Date:</span>
                  <span>{format(new Date(quote.quoteDate), 'dd MMM yyyy')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Expiry Date:</span>
                  <span className={isExpired ? 'text-red-600' : ''}>
                    {format(new Date(quote.expiryDate), 'dd MMM yyyy')}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Validity:</span>
                  <span>{quote.validityDays} days</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle>Fee Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
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

              <div className="flex justify-end mt-4">
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
            </CardContent>
          </Card>

          {/* Notes */}
          {quote.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Terms & Conditions</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{quote.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Status History */}
          {(quote.sentAt || quote.viewedAt || quote.acceptedAt || quote.declinedAt) && (
            <Card>
              <CardHeader>
                <CardTitle>Status History</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created</span>
                    <span>{format(new Date(quote.createdAt), 'dd MMM yyyy HH:mm')}</span>
                  </div>
                  {quote.sentAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Sent</span>
                      <span>{format(new Date(quote.sentAt), 'dd MMM yyyy HH:mm')}</span>
                    </div>
                  )}
                  {quote.viewedAt && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Viewed</span>
                      <span>{format(new Date(quote.viewedAt), 'dd MMM yyyy HH:mm')}</span>
                    </div>
                  )}
                  {quote.acceptedAt && (
                    <div className="flex justify-between text-emerald-600">
                      <span>Accepted</span>
                      <span>{format(new Date(quote.acceptedAt), 'dd MMM yyyy HH:mm')}</span>
                    </div>
                  )}
                  {quote.declinedAt && (
                    <div className="flex justify-between text-red-600">
                      <span>Declined</span>
                      <span>{format(new Date(quote.declinedAt), 'dd MMM yyyy HH:mm')}</span>
                    </div>
                  )}
                  {quote.declineReason && (
                    <div className="mt-2 p-3 bg-red-50 rounded-md">
                      <p className="text-sm text-red-600">
                        <strong>Decline Reason:</strong> {quote.declineReason}
                      </p>
                    </div>
                  )}
                  {quote.convertedToInvoiceId && (
                    <div className="mt-2 p-3 bg-blue-50 rounded-md">
                      <p className="text-sm text-blue-600">
                        <strong>Converted to Invoice:</strong>{' '}
                        <Link
                          href={`/invoices/${quote.convertedToInvoiceId}`}
                          className="underline hover:no-underline"
                        >
                          View Invoice
                        </Link>
                      </p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="preview" className="mt-4">
          <QuotePreview quote={quote} />
        </TabsContent>
      </Tabs>

      {/* Print View */}
      <div className="hidden print:block">
        <QuotePreview quote={quote} />
      </div>

      {/* Action Dialogs */}
      <SendQuoteDialog
        quote={quote}
        open={showSendDialog}
        onOpenChange={setShowSendDialog}
        onConfirm={handleSend}
        isLoading={sendQuote.isPending}
      />
      <AcceptQuoteDialog
        quote={quote}
        open={showAcceptDialog}
        onOpenChange={setShowAcceptDialog}
        onConfirm={handleAccept}
        isLoading={acceptQuote.isPending}
      />
      <DeclineQuoteDialog
        quote={quote}
        open={showDeclineDialog}
        onOpenChange={setShowDeclineDialog}
        onConfirm={handleDecline}
        isLoading={declineQuote.isPending}
      />
      <ConvertQuoteDialog
        quote={quote}
        open={showConvertDialog}
        onOpenChange={setShowConvertDialog}
        onConfirm={handleConvert}
        isLoading={convertQuote.isPending}
      />
    </div>
  );
}
