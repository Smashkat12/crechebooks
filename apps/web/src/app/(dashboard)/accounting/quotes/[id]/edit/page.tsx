'use client';

/**
 * TASK-ACCT-UI-005: Edit Quote Page
 * Form page for editing an existing quote.
 */

import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { QuoteForm } from '@/components/accounting/quote-form';
import { useQuote, useUpdateQuote, type CreateQuoteDto } from '@/hooks/use-quotes';
import { useFeeStructures } from '@/hooks/use-fee-structures';
import { useToast } from '@/hooks/use-toast';

export default function EditQuotePage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const quoteId = params.id as string;

  const { data: quote, isLoading, error } = useQuote(quoteId);
  const { data: feeStructuresData } = useFeeStructures();
  const updateQuote = useUpdateQuote(quoteId);

  const handleSubmit = (data: CreateQuoteDto) => {
    updateQuote.mutate(data, {
      onSuccess: (updatedQuote) => {
        toast({
          title: 'Quote updated',
          description: `Quote ${updatedQuote.quoteNumber} has been updated successfully.`,
        });
        router.push(`/accounting/quotes/${quoteId}`);
      },
      onError: (error) => {
        toast({
          title: 'Failed to update quote',
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

  // Only allow editing DRAFT quotes
  if (quote.status !== 'DRAFT') {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-destructive font-medium">Cannot edit this quote</p>
          <p className="text-sm text-muted-foreground mt-1">
            Only draft quotes can be edited. This quote has already been sent.
          </p>
          <Link href={`/accounting/quotes/${quoteId}`} className="mt-4 inline-block">
            <Button variant="outline">View Quote</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href={`/accounting/quotes/${quoteId}`}>
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Quote</h1>
          <p className="text-muted-foreground">
            {quote.quoteNumber} - {quote.recipientName}
          </p>
        </div>
      </div>

      {/* Form */}
      <QuoteForm
        quote={quote}
        feeStructures={feeStructuresData?.fee_structures}
        onSubmit={handleSubmit}
        isLoading={updateQuote.isPending}
        mode="edit"
      />
    </div>
  );
}
