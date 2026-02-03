'use client';

/**
 * TASK-ACCT-UI-005: Create Quote Page
 * Form page for creating a new quote.
 */

import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { QuoteForm } from '@/components/accounting/quote-form';
import { useCreateQuote, type CreateQuoteDto } from '@/hooks/use-quotes';
import { useFeeStructures } from '@/hooks/use-fee-structures';
import { useToast } from '@/hooks/use-toast';

export default function NewQuotePage() {
  const router = useRouter();
  const { toast } = useToast();

  const { data: feeStructuresData } = useFeeStructures();
  const createQuote = useCreateQuote();

  const handleSubmit = (data: CreateQuoteDto) => {
    createQuote.mutate(data, {
      onSuccess: (quote) => {
        toast({
          title: 'Quote created',
          description: `Quote ${quote.quoteNumber} has been created successfully.`,
        });
        router.push(`/accounting/quotes/${quote.id}`);
      },
      onError: (error) => {
        toast({
          title: 'Failed to create quote',
          description: error.message,
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/accounting/quotes">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Create Quote</h1>
          <p className="text-muted-foreground">
            Send a fee quote to a prospective parent
          </p>
        </div>
      </div>

      {/* Form */}
      <QuoteForm
        feeStructures={feeStructuresData?.fee_structures}
        onSubmit={handleSubmit}
        isLoading={createQuote.isPending}
        mode="create"
      />
    </div>
  );
}
