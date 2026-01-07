/**
 * Enrollment Status Badge
 *
 * Colored badge for enrollment status:
 * - active: green
 * - inactive: gray
 * - pending: yellow
 * - graduated: blue
 * - withdrawn: red
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface EnrollmentStatusBadgeProps {
  status: string;
  className?: string;
}

const statusConfig: Record<string, { label: string; variant: 'success' | 'secondary' | 'warning' | 'default' | 'destructive' }> = {
  active: {
    label: 'Active',
    variant: 'success',
  },
  inactive: {
    label: 'Inactive',
    variant: 'secondary',
  },
  pending: {
    label: 'Pending',
    variant: 'warning',
  },
  graduated: {
    label: 'Graduated',
    variant: 'default',
  },
  withdrawn: {
    label: 'Withdrawn',
    variant: 'destructive',
  },
};

export function EnrollmentStatusBadge({ status, className }: EnrollmentStatusBadgeProps) {
  // Normalize status to lowercase for lookup
  const normalizedStatus = status?.toLowerCase() ?? 'inactive';
  const config = statusConfig[normalizedStatus] ?? statusConfig.inactive;

  return (
    <Badge variant={config.variant} className={cn('capitalize', className)}>
      {config.label}
    </Badge>
  );
}
