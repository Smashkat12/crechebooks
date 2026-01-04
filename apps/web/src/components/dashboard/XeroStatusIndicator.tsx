'use client';

import { AlertCircle, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ConnectionState = 'connected' | 'disconnected' | 'error' | 'expiring';

export interface XeroStatusIndicatorProps {
  state: ConnectionState;
  size?: 'sm' | 'md' | 'lg';
}

const sizeClasses = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

const stateConfig = {
  connected: {
    icon: CheckCircle,
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    label: 'Connected',
  },
  expiring: {
    icon: AlertTriangle,
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    label: 'Expiring Soon',
  },
  error: {
    icon: AlertCircle,
    color: 'text-destructive',
    bgColor: 'bg-destructive/10',
    label: 'Error',
  },
  disconnected: {
    icon: XCircle,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted',
    label: 'Disconnected',
  },
} as const;

export function XeroStatusIndicator({
  state,
  size = 'md',
}: XeroStatusIndicatorProps) {
  const config = stateConfig[state];
  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2">
      <div className={cn('p-1.5 rounded-full', config.bgColor)}>
        <Icon className={cn(sizeClasses[size], config.color)} />
      </div>
      <span className={cn('text-sm font-medium', config.color)}>
        {config.label}
      </span>
    </div>
  );
}
