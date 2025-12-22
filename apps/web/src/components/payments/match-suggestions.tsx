/**
 * Match Suggestions Component
 *
 * Displays AI-generated payment matching suggestions with confidence scores
 */

import * as React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils';

interface PaymentSuggestion {
  invoiceId: string;
  parentName: string;
  childName: string;
  amount: number;
  confidence: number;
  reason: string;
}

interface MatchSuggestionsProps {
  suggestions: PaymentSuggestion[];
  selectedInvoiceId?: string;
  onSelectSuggestion: (invoiceId: string) => void;
  isLoading?: boolean;
}

export function MatchSuggestions({
  suggestions,
  selectedInvoiceId,
  onSelectSuggestion,
  isLoading = false,
}: MatchSuggestionsProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardContent className="p-4">
              <div className="space-y-2">
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (suggestions.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No matching suggestions found.</p>
        <p className="text-sm mt-1">Try searching manually below.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {suggestions.map((suggestion) => {
        const isSelected = selectedInvoiceId === suggestion.invoiceId;
        const confidenceVariant =
          suggestion.confidence >= 0.8
            ? 'default'
            : suggestion.confidence >= 0.6
            ? 'outline'
            : 'secondary';

        return (
          <Card
            key={suggestion.invoiceId}
            className={`cursor-pointer transition-colors hover:border-primary ${
              isSelected ? 'border-primary bg-primary/5' : ''
            }`}
            onClick={() => onSelectSuggestion(suggestion.invoiceId)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">{suggestion.parentName}</h4>
                    <Badge variant={confidenceVariant}>
                      {Math.round(suggestion.confidence * 100)}% match
                    </Badge>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    <p>Child: {suggestion.childName}</p>
                    <p>Amount: {formatCurrency(suggestion.amount)}</p>
                  </div>

                  {suggestion.reason && (
                    <p className="text-sm text-muted-foreground italic">
                      {suggestion.reason}
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-end gap-2">
                  {isSelected ? (
                    <Button size="sm" className="gap-2">
                      <Check className="h-4 w-4" />
                      Selected
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline">
                      Select
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
