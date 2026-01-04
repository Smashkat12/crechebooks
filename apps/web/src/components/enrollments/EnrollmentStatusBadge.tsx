/**
 * Enrollment Status Badge
 *
 * Colored badge for enrollment status:
 * - active: green
 * - inactive: gray
 * - pending: yellow
 */

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface EnrollmentStatusBadgeProps {
  status: 'active' | 'inactive' | 'pending';
  className?: string;
}

const statusConfig = {
  active: {
    label: 'Active',
    variant: 'success' as const,
  },
  inactive: {
    label: 'Inactive',
    variant: 'secondary' as const,
  },
  pending: {
    label: 'Pending',
    variant: 'warning' as const,
  },
};

export function EnrollmentStatusBadge({ status, className }: EnrollmentStatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <Badge variant={config.variant} className={cn('capitalize', className)}>
      {config.label}
    </Badge>
  );
}
