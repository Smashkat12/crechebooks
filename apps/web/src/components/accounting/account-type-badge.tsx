'use client';

/**
 * TASK-ACCT-UI-001: Account Type Badge Component
 * Displays color-coded badges for account types.
 */

import { Badge } from '@/components/ui/badge';
import type { AccountType } from '@/hooks/use-accounts';

interface AccountTypeBadgeProps {
  type: AccountType;
  className?: string;
}

const typeColors: Record<AccountType, { bg: string; text: string; border: string }> = {
  ASSET: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' },
  LIABILITY: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-200' },
  EQUITY: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-200' },
  REVENUE: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' },
  EXPENSE: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200' },
};

const typeLabels: Record<AccountType, string> = {
  ASSET: 'Asset',
  LIABILITY: 'Liability',
  EQUITY: 'Equity',
  REVENUE: 'Revenue',
  EXPENSE: 'Expense',
};

export function AccountTypeBadge({ type, className = '' }: AccountTypeBadgeProps) {
  const colors = typeColors[type] || typeColors.EXPENSE;
  const label = typeLabels[type] || type;

  return (
    <Badge
      variant="outline"
      className={`${colors.bg} ${colors.text} ${colors.border} ${className}`}
    >
      {label}
    </Badge>
  );
}
