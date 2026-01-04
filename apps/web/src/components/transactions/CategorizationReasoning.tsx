/**
 * Categorization Reasoning Component
 *
 * Displays AI categorization reasoning with:
 * - Confidence score
 * - Reasoning explanation text
 * - Alternative suggestions
 * - Matched patterns
 * - Expandable tooltip/popover for details
 */

import * as React from 'react';
import { Info } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ConfidenceIndicator } from './ConfidenceIndicator';
import { AlternativeSuggestions } from './AlternativeSuggestions';
import { cn } from '@/lib/utils';

export interface CategorizationReasoningProps {
  reasoning: string;
  confidence: number; // 0-100
  alternatives?: Array<{ category: string; confidence: number }>;
  matchedPatterns?: string[];
  mode?: 'compact' | 'full'; // Compact = tooltip, Full = inline
  className?: string;
}

export function CategorizationReasoning({
  reasoning,
  confidence,
  alternatives,
  matchedPatterns,
  mode = 'compact',
  className,
}: CategorizationReasoningProps): React.ReactElement {
  const hasAlternatives = alternatives && alternatives.length > 0;
  const hasPatterns = matchedPatterns && matchedPatterns.length > 0;

  // Compact mode: Icon with popover
  if (mode === 'compact') {
    return (
      <div className={cn('inline-flex items-center', className)}>
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
              aria-label="View categorization reasoning"
            >
              <Info className="h-4 w-4" aria-hidden="true" />
              <span className="sr-only">View categorization reasoning</span>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-80" align="start">
            <div className="space-y-3">
              {/* Confidence */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Confidence</h4>
                <ConfidenceIndicator
                  confidence={confidence}
                  size="md"
                  showLabel={true}
                  showNeedsReview={true}
                />
              </div>

              {/* Reasoning */}
              <div>
                <h4 className="text-sm font-semibold mb-1">Reasoning</h4>
                <p className="text-sm text-muted-foreground">{reasoning}</p>
              </div>

              {/* Matched Patterns */}
              {hasPatterns && (
                <div>
                  <h4 className="text-sm font-semibold mb-1">Matched Patterns</h4>
                  <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                    {matchedPatterns.map((pattern, idx) => (
                      <li key={idx}>{pattern}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Alternative Suggestions */}
              {hasAlternatives && (
                <div>
                  <h4 className="text-sm font-semibold mb-2">Alternative Suggestions</h4>
                  <AlternativeSuggestions alternatives={alternatives} />
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    );
  }

  // Full mode: Inline display
  return (
    <div className={cn('space-y-4', className)}>
      {/* Confidence */}
      <div>
        <h4 className="text-sm font-semibold mb-2">Confidence</h4>
        <ConfidenceIndicator
          confidence={confidence}
          size="lg"
          showLabel={true}
          showNeedsReview={true}
        />
      </div>

      {/* Reasoning */}
      <div>
        <h4 className="text-sm font-semibold mb-1">Reasoning</h4>
        <p className="text-sm text-muted-foreground">{reasoning}</p>
      </div>

      {/* Matched Patterns */}
      {hasPatterns && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Matched Patterns</h4>
          <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
            {matchedPatterns.map((pattern, idx) => (
              <li key={idx}>{pattern}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Alternative Suggestions */}
      {hasAlternatives && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Alternative Suggestions</h4>
          <AlternativeSuggestions alternatives={alternatives} />
        </div>
      )}
    </div>
  );
}
