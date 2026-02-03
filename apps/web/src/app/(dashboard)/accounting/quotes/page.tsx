'use client';

/**
 * TASK-ACCT-UI-005: Quote List Page
 * Main page for viewing and managing quotes.
 */

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Plus, FileText, TrendingUp, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DataTable } from '@/components/tables/data-table';
import { DataTableSkeleton } from '@/components/tables/data-table-skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  useQuotesList,
  useQuoteSummary,
  useSendQuote,
  useAcceptQuote,
  useDeclineQuote,
  useConvertQuote,
  type QuoteStatus,
  type Quote,
} from '@/hooks/use-quotes';
import { createQuoteColumns } from '@/components/accounting/quote-columns';
import {
  SendQuoteDialog,
  AcceptQuoteDialog,
  DeclineQuoteDialog,
  ConvertQuoteDialog,
} from '@/components/accounting/quote-actions';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency } from '@/lib/utils';

export default function QuotesPage() {
  const { toast } = useToast();
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | 'all'>('all');

  // Dialog states
  const [quoteToSend, setQuoteToSend] = useState<Quote | null>(null);
  const [quoteToAccept, setQuoteToAccept] = useState<Quote | null>(null);
  const [quoteToDecline, setQuoteToDecline] = useState<Quote | null>(null);
  const [quoteToConvert, setQuoteToConvert] = useState<Quote | null>(null);

  const {
    data: quotes,
    isLoading,
    error,
  } = useQuotesList({
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const { data: summary } = useQuoteSummary();

  const sendQuote = useSendQuote();
  const acceptQuote = useAcceptQuote();
  const declineQuote = useDeclineQuote();
  const convertQuote = useConvertQuote();

  const handleSend = useCallback((quote: Quote) => {
    setQuoteToSend(quote);
  }, []);

  const handleAccept = useCallback((quote: Quote) => {
    setQuoteToAccept(quote);
  }, []);

  const handleDecline = useCallback((quote: Quote) => {
    setQuoteToDecline(quote);
  }, []);

  const handleConvert = useCallback((quote: Quote) => {
    setQuoteToConvert(quote);
  }, []);

  const confirmSend = () => {
    if (!quoteToSend) return;
    sendQuote.mutate(quoteToSend.id, {
      onSuccess: () => {
        toast({
          title: 'Quote sent',
          description: `Quote ${quoteToSend.quoteNumber} has been sent to ${quoteToSend.recipientEmail}.`,
        });
        setQuoteToSend(null);
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

  const confirmAccept = () => {
    if (!quoteToAccept) return;
    acceptQuote.mutate(quoteToAccept.id, {
      onSuccess: () => {
        toast({
          title: 'Quote accepted',
          description: `Quote ${quoteToAccept.quoteNumber} has been marked as accepted.`,
        });
        setQuoteToAccept(null);
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

  const confirmDecline = (reason: string) => {
    if (!quoteToDecline) return;
    declineQuote.mutate(
      { id: quoteToDecline.id, reason },
      {
        onSuccess: () => {
          toast({
            title: 'Quote declined',
            description: `Quote ${quoteToDecline.quoteNumber} has been marked as declined.`,
          });
          setQuoteToDecline(null);
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

  const confirmConvert = (dueDate?: string, notes?: string) => {
    if (!quoteToConvert) return;
    convertQuote.mutate(
      { id: quoteToConvert.id, dueDate, notes },
      {
        onSuccess: () => {
          toast({
            title: 'Quote converted',
            description: `Quote ${quoteToConvert.quoteNumber} has been converted to an invoice.`,
          });
          setQuoteToConvert(null);
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

  const columns = useMemo(
    () =>
      createQuoteColumns({
        onSend: handleSend,
        onAccept: handleAccept,
        onDecline: handleDecline,
        onConvert: handleConvert,
      }),
    [handleSend, handleAccept, handleDecline, handleConvert]
  );

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive font-medium">Failed to load quotes</p>
          <p className="text-sm text-muted-foreground mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quotes</h1>
          <p className="text-muted-foreground">
            Send fee quotes to prospective parents
          </p>
        </div>
        <Link href="/accounting/quotes/new">
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Create Quote
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Value</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {formatCurrency(summary.totalValueCents / 100)}
              </div>
              <p className="text-xs text-muted-foreground">{summary.totalQuotes} quotes</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-amber-600">
                {formatCurrency(summary.pendingValueCents / 100)}
              </div>
              <p className="text-xs text-muted-foreground">
                {summary.sentCount} sent, {summary.draftCount} drafts
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Accepted</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600">{summary.acceptedCount}</div>
              <p className="text-xs text-muted-foreground">{summary.convertedCount} converted</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Declined</CardTitle>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-red-600">{summary.declinedCount}</div>
              <p className="text-xs text-muted-foreground">{summary.expiredCount} expired</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {(summary.conversionRate * 100).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">Quotes to enrollments</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Quotes Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as QuoteStatus | 'all')}
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="DRAFT">Draft</SelectItem>
                <SelectItem value="SENT">Sent</SelectItem>
                <SelectItem value="VIEWED">Viewed</SelectItem>
                <SelectItem value="ACCEPTED">Accepted</SelectItem>
                <SelectItem value="DECLINED">Declined</SelectItem>
                <SelectItem value="EXPIRED">Expired</SelectItem>
                <SelectItem value="CONVERTED">Converted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <DataTableSkeleton columns={8} rows={10} />
          ) : (
            <DataTable
              columns={columns}
              data={quotes || []}
              emptyMessage="No quotes found. Click 'Create Quote' to send a fee quote to a prospective parent."
            />
          )}
        </CardContent>
      </Card>

      {/* Action Dialogs */}
      <SendQuoteDialog
        quote={quoteToSend}
        open={!!quoteToSend}
        onOpenChange={(open) => !open && setQuoteToSend(null)}
        onConfirm={confirmSend}
        isLoading={sendQuote.isPending}
      />
      <AcceptQuoteDialog
        quote={quoteToAccept}
        open={!!quoteToAccept}
        onOpenChange={(open) => !open && setQuoteToAccept(null)}
        onConfirm={confirmAccept}
        isLoading={acceptQuote.isPending}
      />
      <DeclineQuoteDialog
        quote={quoteToDecline}
        open={!!quoteToDecline}
        onOpenChange={(open) => !open && setQuoteToDecline(null)}
        onConfirm={confirmDecline}
        isLoading={declineQuote.isPending}
      />
      <ConvertQuoteDialog
        quote={quoteToConvert}
        open={!!quoteToConvert}
        onOpenChange={(open) => !open && setQuoteToConvert(null)}
        onConfirm={confirmConvert}
        isLoading={convertQuote.isPending}
      />
    </div>
  );
}
