/**
 * Confidence Indicator Component
 *
 * Visual gauge displaying AI categorization confidence with:
 * - Progress bar representation
 * - Color-coded confidence levels
 * - Optional needs review indicator
 * - Accessibility features (ARIA labels, patterns)
 */

import * as React from 'react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { AlertCircle } from 'lucide-react';

export interface ConfidenceIndicatorProps {
  confidence: number; // 0-100
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  showNeedsReview?: boolean;
  threshold?: number; // Default 80
}

const SIZE_CONFIG = {
  sm: {
    container: 'gap-1',
    progress: 'h-1.5 w-16',
    text: 'text-xs',
    icon: 'h-3 w-3',
  },
  md: {
    container: 'gap-2',
    progress: 'h-2 w-24',
    text: 'text-sm',
    icon: 'h-4 w-4',
  },
  lg: {
    container: 'gap-3',
    progress: 'h-3 w-32',
    text: 'text-base',
    icon: 'h-5 w-5',
  },
};

export function ConfidenceIndicator({
  confidence,
  size = 'md',
  showLabel = true,
  showNeedsReview = true,
  threshold = 80,
}: ConfidenceIndicatorProps): React.ReactElement {
  const sizeConfig = SIZE_CONFIG[size];
  const needsReview = confidence < threshold;

  // Color coding based on confidence level
  const getConfidenceColor = (): string => {
    if (confidence >= threshold) return 'bg-green-500'; // High confidence
    if (confidence >= 50) return 'bg-yellow-500'; // Medium confidence
    return 'bg-red-500'; // Low confidence
  };

  // Accessibility label
  const confidenceLevel = confidence >= threshold ? 'high' : confidence >= 50 ? 'medium' : 'low';
  const ariaLabel = `${confidence}% confidence - ${confidenceLevel} confidence level${needsReview ? ' - needs review' : ''}`;

  return (
    <div
      className={cn('flex items-center', sizeConfig.container)}
      role="status"
      aria-label={ariaLabel}
    >
      {/* Progress Bar with Pattern for Color-blind Accessibility */}
      <div className="relative">
        <Progress
          value={confidence}
          className={cn(sizeConfig.progress, 'bg-muted')}
          aria-hidden="true"
        />
        {/* Colored overlay */}
        <div
          className={cn(
            'absolute top-0 left-0 h-full rounded-full transition-all',
            getConfidenceColor()
          )}
          style={{ width: `${confidence}%` }}
        >
          {/* Pattern overlay for color-blind accessibility */}
          {needsReview && (
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 4px)',
              }}
            />
          )}
        </div>
      </div>

      {/* Confidence Label */}
      {showLabel && (
        <span className={cn('font-medium tabular-nums', sizeConfig.text)}>
          {Math.round(confidence)}%
        </span>
      )}

      {/* Needs Review Indicator */}
      {showNeedsReview && needsReview && (
        <AlertCircle
          className={cn('text-yellow-600', sizeConfig.icon)}
          aria-label="Needs review"
        />
      )}
    </div>
  );
}
