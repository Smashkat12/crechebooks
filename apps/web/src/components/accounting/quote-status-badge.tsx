'use client';

/**
 * TASK-ACCT-UI-005: Quote Status Badge Component
 * Displays quote status with appropriate colors.
 */

import { Badge } from '@/components/ui/badge';
import type { QuoteStatus } from '@/hooks/use-quotes';

interface QuoteStatusBadgeProps {
  status: QuoteStatus;
}

const STATUS_CONFIG: Record<
  QuoteStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  SENT: { label: 'Sent', variant: 'outline', className: 'border-blue-500 text-blue-600' },
  VIEWED: { label: 'Viewed', variant: 'outline', className: 'border-purple-500 text-purple-600' },
  ACCEPTED: { label: 'Accepted', variant: 'default', className: 'bg-emerald-600 hover:bg-emerald-700' },
  DECLINED: { label: 'Declined', variant: 'destructive' },
  EXPIRED: { label: 'Expired', variant: 'secondary', className: 'text-muted-foreground' },
  CONVERTED: { label: 'Converted', variant: 'default', className: 'bg-blue-600 hover:bg-blue-700' },
};

export function QuoteStatusBadge({ status }: QuoteStatusBadgeProps) {
  const config = STATUS_CONFIG[status];

  return (
    <Badge variant={config.variant} className={config.className}>
      {config.label}
    </Badge>
  );
}
