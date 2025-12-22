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
  confidence: number;
  className?: string;
}

export function ConfidenceBadge({ confidence, className }: ConfidenceBadgeProps) {
  const percentage = Math.round(confidence * 100);

  const variant = confidence >= 0.8
    ? 'default'
    : confidence >= 0.5
    ? 'secondary'
    : 'destructive';

  const colorClass = confidence >= 0.8
    ? 'bg-green-500 hover:bg-green-600 text-white'
    : confidence >= 0.5
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
