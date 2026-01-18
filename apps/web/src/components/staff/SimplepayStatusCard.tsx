'use client';

/**
 * SimplePay Status Card
 * TASK-WEB-047: SimplePay sync status display card
 *
 * Shows SimplePay sync status for a staff member including:
 * - Sync status badge (Synced/Not Synced)
 * - Last sync timestamp
 * - SimplePay employee ID if available
 * - Sync button with loading state
 */

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Link as LinkIcon,
} from 'lucide-react';
import { useEmployeeSyncStatus, useSyncEmployee } from '@/hooks/use-simplepay';
import { formatDistanceToNow } from 'date-fns';

interface SimplepayStatusCardProps {
  staffId: string;
}

type SyncStatusType = 'SYNCED' | 'OUT_OF_SYNC' | 'SYNC_FAILED' | 'NOT_SYNCED';

interface StatusConfig {
  label: string;
  icon: typeof CheckCircle;
  variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning';
  className?: string;
}

const STATUS_CONFIGS: Record<SyncStatusType, StatusConfig> = {
  SYNCED: {
    label: 'Synced',
    icon: CheckCircle,
    variant: 'success',
    className: 'bg-green-100 text-green-800 hover:bg-green-100',
  },
  OUT_OF_SYNC: {
    label: 'Out of Sync',
    icon: AlertTriangle,
    variant: 'warning',
    className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  },
  SYNC_FAILED: {
    label: 'Sync Failed',
    icon: XCircle,
    variant: 'destructive',
    className: '',
  },
  NOT_SYNCED: {
    label: 'Not Synced',
    icon: Clock,
    variant: 'outline',
    className: 'bg-gray-100 text-gray-800 hover:bg-gray-100',
  },
};

export function SimplepayStatusCard({ staffId }: SimplepayStatusCardProps) {
  const { data: status, isLoading, error, mutate } = useEmployeeSyncStatus(staffId);
  const syncMutation = useSyncEmployee();

  const handleSync = async () => {
    try {
      await syncMutation.mutateAsync(staffId);
      mutate();
    } catch {
      // Error handled by mutation
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-6 w-24" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="text-lg">SimplePay Integration</span>
            <Badge variant="destructive">Error</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Unable to load SimplePay status. Please try again later.
          </p>
        </CardContent>
      </Card>
    );
  }

  const syncStatus = (status?.syncStatus || 'NOT_SYNCED') as SyncStatusType;
  const config = STATUS_CONFIGS[syncStatus];
  const StatusIcon = config.icon;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between">
          <span className="text-lg">SimplePay Integration</span>
          <Badge variant={config.variant} className={config.className}>
            <StatusIcon className="mr-1 h-3 w-3" />
            {config.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Sync Details */}
        <div className="space-y-3 text-sm">
          {/* Last Sync Time */}
          {status?.lastSyncAt && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Last Synced
              </span>
              <span className="font-medium">
                {formatDistanceToNow(new Date(status.lastSyncAt), { addSuffix: true })}
              </span>
            </div>
          )}

          {/* SimplePay Employee ID */}
          {status?.simplePayEmployeeId && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                SimplePay ID
              </span>
              <span className="font-mono text-xs bg-muted px-2 py-1 rounded">
                {status.simplePayEmployeeId}
              </span>
            </div>
          )}

          {/* No SimplePay ID */}
          {!status?.simplePayEmployeeId && syncStatus === 'NOT_SYNCED' && (
            <p className="text-muted-foreground">
              This employee has not been synced to SimplePay yet.
            </p>
          )}

          {/* Sync Error */}
          {status?.lastSyncError && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-xs">
              <p className="font-medium">Sync Error:</p>
              <p>{status.lastSyncError}</p>
            </div>
          )}
        </div>

        {/* Sync Button */}
        <Button
          onClick={handleSync}
          disabled={syncMutation.isPending}
          variant={syncStatus === 'NOT_SYNCED' ? 'default' : 'outline'}
          className="w-full"
          aria-label={syncStatus === 'NOT_SYNCED' ? 'Sync employee to SimplePay' : 'Sync employee with SimplePay now'}
        >
          {syncMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Syncing...
            </>
          ) : (
            <>
              <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
              {syncStatus === 'NOT_SYNCED' ? 'Sync to SimplePay' : 'Sync Now'}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
