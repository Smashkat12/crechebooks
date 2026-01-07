'use client';

/**
 * Onboarding Status Badge
 * TASK-STAFF-001: Visual status indicator for staff onboarding
 *
 * Displays the current onboarding status with appropriate styling and icons.
 */

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Clock, CheckCircle, AlertCircle, Loader2, XCircle, Play } from 'lucide-react';

interface OnboardingStatusBadgeProps {
  status: string;
  currentStep?: string;
  showTooltip?: boolean;
  size?: 'sm' | 'default';
}

// Step labels for display
const STEP_LABELS: Record<string, string> = {
  PERSONAL_INFO: 'Personal Info',
  EMPLOYMENT: 'Employment',
  TAX_INFO: 'Tax Info',
  BANKING: 'Banking',
  DOCUMENTS: 'Documents',
  CHECKLIST: 'Checklist',
  COMPLETE: 'Complete',
};

export function OnboardingStatusBadge({
  status,
  currentStep,
  showTooltip = true,
  size = 'default',
}: OnboardingStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'COMPLETED':
        return {
          label: 'Completed',
          variant: 'success' as const,
          icon: CheckCircle,
          color: 'text-green-500',
          tooltip: 'Onboarding completed successfully',
        };
      case 'IN_PROGRESS':
        return {
          label: currentStep ? STEP_LABELS[currentStep] || currentStep : 'In Progress',
          variant: 'secondary' as const,
          icon: Loader2,
          color: 'text-blue-500',
          tooltip: currentStep
            ? `Currently on: ${STEP_LABELS[currentStep] || currentStep}`
            : 'Onboarding in progress',
          animate: true,
        };
      case 'NOT_STARTED':
        return {
          label: 'Not Started',
          variant: 'outline' as const,
          icon: Play,
          color: 'text-muted-foreground',
          tooltip: 'Onboarding has not been started',
        };
      case 'CANCELLED':
        return {
          label: 'Cancelled',
          variant: 'destructive' as const,
          icon: XCircle,
          color: 'text-red-500',
          tooltip: 'Onboarding was cancelled',
        };
      case 'PENDING':
        return {
          label: 'Pending',
          variant: 'warning' as const,
          icon: Clock,
          color: 'text-yellow-500',
          tooltip: 'Waiting to start onboarding',
        };
      default:
        return {
          label: status,
          variant: 'outline' as const,
          icon: AlertCircle,
          color: 'text-muted-foreground',
          tooltip: `Status: ${status}`,
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  const sizeClasses = size === 'sm' ? 'text-xs px-2 py-0.5' : '';
  const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';

  const badge = (
    <Badge variant={config.variant} className={`flex items-center gap-1.5 ${sizeClasses}`}>
      <Icon
        className={`${iconSize} ${config.color} ${
          'animate' in config && config.animate ? 'animate-spin' : ''
        }`}
      />
      <span>{config.label}</span>
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent>
          <p>{config.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact version for use in tables
 */
export function OnboardingStatusDot({ status }: { status: string }) {
  const getStatusColor = () => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-500';
      case 'IN_PROGRESS':
        return 'bg-blue-500';
      case 'NOT_STARTED':
        return 'bg-gray-400';
      case 'CANCELLED':
        return 'bg-red-500';
      default:
        return 'bg-gray-400';
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger>
          <span className={`inline-block w-2.5 h-2.5 rounded-full ${getStatusColor()}`} />
        </TooltipTrigger>
        <TooltipContent>
          <p>
            {status === 'COMPLETED'
              ? 'Onboarding Complete'
              : status === 'IN_PROGRESS'
              ? 'Onboarding In Progress'
              : status === 'NOT_STARTED'
              ? 'Not Started'
              : status === 'CANCELLED'
              ? 'Cancelled'
              : status}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
