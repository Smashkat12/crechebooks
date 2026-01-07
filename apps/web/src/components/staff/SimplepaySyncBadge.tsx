'use client';

/**
 * SimplePay Sync Badge
 * TASK-STAFF-004: Individual employee sync status badge
 *
 * Displays sync status for a single employee with optional sync button.
 */

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { CheckCircle, XCircle, AlertTriangle, Clock, RefreshCw, Loader2 } from 'lucide-react';
import { useEmployeeSyncStatus, useSyncEmployee } from '@/hooks/use-simplepay';
import { formatDistanceToNow } from 'date-fns';

interface SimplepaySyncBadgeProps {
  staffId: string;
  showSyncButton?: boolean;
  compact?: boolean;
}

type SyncStatusType = 'SYNCED' | 'OUT_OF_SYNC' | 'SYNC_FAILED' | 'NOT_SYNCED';

interface StatusConfig {
  label: string;
  icon: typeof CheckCircle;
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  color: string;
}

const STATUS_CONFIGS: Record<SyncStatusType, StatusConfig> = {
  SYNCED: {
    label: 'Synced',
    icon: CheckCircle,
    variant: 'default',
    color: 'text-green-500',
  },
  OUT_OF_SYNC: {
    label: 'Out of Sync',
    icon: AlertTriangle,
    variant: 'secondary',
    color: 'text-yellow-500',
  },
  SYNC_FAILED: {
    label: 'Sync Failed',
    icon: XCircle,
    variant: 'destructive',
    color: 'text-red-500',
  },
  NOT_SYNCED: {
    label: 'Not Synced',
    icon: Clock,
    variant: 'outline',
    color: 'text-gray-500',
  },
};

export function SimplepaySyncBadge({
  staffId,
  showSyncButton = true,
  compact = false,
}: SimplepaySyncBadgeProps) {
  const { data: status, isLoading, mutate } = useEmployeeSyncStatus(staffId);
  const syncMutation = useSyncEmployee();

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await syncMutation.mutateAsync(staffId);
      mutate();
    } catch {
      // Error handled by mutation
    }
  };

  if (isLoading) {
    return (
      <Badge variant="outline" className="flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        {!compact && <span>Loading...</span>}
      </Badge>
    );
  }

  const syncStatus = (status?.syncStatus || 'NOT_SYNCED') as SyncStatusType;
  const config = STATUS_CONFIGS[syncStatus];
  const Icon = config.icon;

  const badge = (
    <Badge variant={config.variant} className="flex items-center gap-1">
      <Icon className={`w-3 h-3 ${config.color}`} />
      {!compact && <span>{config.label}</span>}
    </Badge>
  );

  const tooltipContent = (
    <div className="text-xs space-y-1">
      <p className="font-medium">SimplePay Sync: {config.label}</p>
      {status?.lastSyncAt && (
        <p className="text-muted-foreground">
          Last synced: {formatDistanceToNow(new Date(status.lastSyncAt), { addSuffix: true })}
        </p>
      )}
      {status?.lastSyncError && (
        <p className="text-red-400">Error: {status.lastSyncError}</p>
      )}
      {status?.simplePayEmployeeId && (
        <p className="text-muted-foreground font-mono">
          SimplePay ID: {status.simplePayEmployeeId}
        </p>
      )}
    </div>
  );

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1">
            {badge}
            {showSyncButton && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleSync}
                disabled={syncMutation.isPending}
              >
                {syncMutation.isPending ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
              </Button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" align="start">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
