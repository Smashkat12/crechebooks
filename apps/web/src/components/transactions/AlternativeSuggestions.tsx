/**
 * Alternative Suggestions Component
 *
 * Displays alternative category suggestions with confidence scores:
 * - Shows up to 3 alternative categories
 * - Displays confidence for each alternative
 * - Accessible with screen readers
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ConfidenceIndicator } from './ConfidenceIndicator';

export interface AlternativeSuggestion {
  category: string;
  confidence: number; // 0-100
}

export interface AlternativeSuggestionsProps {
  alternatives: AlternativeSuggestion[];
  maxDisplay?: number;
  className?: string;
}

export function AlternativeSuggestions({
  alternatives,
  maxDisplay = 3,
  className,
}: AlternativeSuggestionsProps): React.ReactElement {
  // Sort by confidence descending and take top N
  const topAlternatives = React.useMemo(() => {
    return [...alternatives]
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, maxDisplay);
  }, [alternatives, maxDisplay]);

  if (topAlternatives.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        No alternative suggestions available
      </p>
    );
  }

  return (
    <div className={cn('space-y-2', className)} role="list">
      {topAlternatives.map((alt, idx) => (
        <div
          key={`${alt.category}-${idx}`}
          className="flex items-center justify-between gap-4 rounded-md border border-muted bg-muted/30 px-3 py-2"
          role="listitem"
        >
          {/* Category Name */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" title={alt.category}>
              {alt.category}
            </p>
          </div>

          {/* Confidence Indicator */}
          <ConfidenceIndicator
            confidence={alt.confidence}
            size="sm"
            showLabel={true}
            showNeedsReview={false}
          />
        </div>
      ))}

      {/* Show count if more alternatives exist */}
      {alternatives.length > maxDisplay && (
        <p className="text-xs text-muted-foreground italic">
          +{alternatives.length - maxDisplay} more suggestion
          {alternatives.length - maxDisplay === 1 ? '' : 's'}
        </p>
      )}
    </div>
  );
}
