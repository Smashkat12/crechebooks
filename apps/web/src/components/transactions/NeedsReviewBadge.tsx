/**
 * Needs Review Badge Component
 *
 * Warning badge displayed for low confidence categorizations:
 * - Shows when confidence is below threshold (default 80%)
 * - Accessible with screen readers
 * - Color-blind friendly design
 */

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface NeedsReviewBadgeProps {
  confidence: number; // 0-100
  threshold?: number; // Default 80
  className?: string;
}

export function NeedsReviewBadge({
  confidence,
  threshold = 80,
  className,
}: NeedsReviewBadgeProps): React.ReactElement | null {
  const needsReview = confidence < threshold;

  if (!needsReview) {
    return null;
  }

  // Determine severity based on how far below threshold
  const severity = confidence < 50 ? 'critical' : 'warning';
  const severityConfig = {
    critical: {
      variant: 'destructive' as const,
      bgClass: 'bg-red-500 hover:bg-red-600',
      label: 'Needs Review',
    },
    warning: {
      variant: 'warning' as const,
      bgClass: 'bg-yellow-500 hover:bg-yellow-600',
      label: 'Review Suggested',
    },
  };

  const config = severityConfig[severity];

  return (
    <Badge
      variant={config.variant}
      className={cn(
        'flex items-center gap-1',
        config.bgClass,
        'text-white',
        className
      )}
      role="status"
      aria-label={`${config.label} - Confidence: ${confidence}%`}
    >
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      <span>{config.label}</span>
    </Badge>
  );
}
