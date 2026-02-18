'use client';

import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import type { EnrollmentStatus as EnrollmentStatusType } from '@crechebooks/types';

interface EnrollmentStatusProps {
  status: EnrollmentStatusType;
  showIcon?: boolean;
}

const statusConfig: Record<EnrollmentStatusType, {
  label: string;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  icon: React.ElementType;
  className: string;
}> = {
  ACTIVE: {
    label: 'Active',
    variant: 'default',
    icon: CheckCircle,
    className: 'bg-green-100 text-green-800 hover:bg-green-100',
  },
  PENDING: {
    label: 'Pending',
    variant: 'secondary',
    icon: Clock,
    className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  },
  WITHDRAWN: {
    label: 'Withdrawn',
    variant: 'outline',
    icon: AlertCircle,
    className: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
  },
  GRADUATED: {
    label: 'Graduated',
    variant: 'secondary',
    icon: XCircle,
    className: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
  },
};

export function EnrollmentStatus({ status, showIcon = true }: EnrollmentStatusProps) {
  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={config.className}>
      {showIcon && <Icon className="mr-1 h-3 w-3" />}
      {config.label}
    </Badge>
  );
}
