/**
 * Confidence Badge Component
 *
 * Displays AI categorization confidence with color coding:
 * - Green: ≥80% (high confidence)
 * - Yellow: 50-79% (medium confidence)
 * - Red: <50% (low confidence)
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ConfidenceBadgeProps {
  confidence: number; // Accepts 0-100 (percentage) or 0-1 (decimal)
  className?: string;
}

export function ConfidenceBadge({ confidence, className }: ConfidenceBadgeProps) {
  // Normalize: if confidence > 1, assume it's already 0-100; otherwise multiply by 100
  const percentage = confidence > 1 ? Math.round(confidence) : Math.round(confidence * 100);
  // Use normalized value for comparisons (0-100 scale)
  const normalized = confidence > 1 ? confidence : confidence * 100;

  const variant = normalized >= 80
    ? 'default'
    : normalized >= 50
    ? 'secondary'
    : 'destructive';

  const colorClass = normalized >= 80
    ? 'bg-green-500 hover:bg-green-600 text-white'
    : normalized >= 50
    ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
    : 'bg-red-500 hover:bg-red-600 text-white';

  return (
    <Badge
      variant={variant}
      className={cn(colorClass, className)}
    >
      {percentage}%
    </Badge>
  );
}
