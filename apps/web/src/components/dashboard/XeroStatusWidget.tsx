'use client';

import { RefreshCw, Link2, AlertCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { XeroStatusIndicator, type ConnectionState } from './XeroStatusIndicator';
import { useXeroStatus, type XeroConnectionStatus } from '@/hooks/useXeroStatus';
import { formatDistanceToNow } from 'date-fns';

export interface XeroStatusWidgetProps {
  compact?: boolean;
}

/**
 * Determine connection state based on status
 */
function getConnectionState(status: XeroConnectionStatus | null): ConnectionState {
  if (!status || !status.isConnected) {
    return 'disconnected';
  }

  // Check for sync errors
  if (status.syncErrors > 0 || status.lastSyncStatus === 'failed') {
    return 'error';
  }

  // Check if last sync was more than 1 hour ago
  if (status.lastSyncAt) {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    if (status.lastSyncAt.getTime() < oneHourAgo) {
      return 'expiring'; // Yellow warning
    }
  }

  return 'connected';
}

/**
 * Format last sync time
 */
function formatLastSync(lastSyncAt: Date | null): string {
  if (!lastSyncAt) {
    return 'Never synced';
  }

  try {
    return formatDistanceToNow(lastSyncAt, { addSuffix: true });
  } catch {
    return 'Unknown';
  }
}

export function XeroStatusWidget({ compact = false }: XeroStatusWidgetProps) {
  const { status, isLoading, error, syncNow, reconnect, isSyncing } = useXeroStatus();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" />
            Xero Integration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="h-6 bg-muted animate-pulse rounded" />
            <div className="h-4 bg-muted animate-pulse rounded w-2/3" />
            <div className="h-4 bg-muted animate-pulse rounded w-1/2" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" />
            Xero Integration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm">Failed to load status</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const connectionState = getConnectionState(status);
  const isConnected = status?.isConnected ?? false;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4" />
            Xero Integration
          </div>
          {isConnected && status?.organizationName && (
            <Badge variant="outline" className="font-normal">
              {status.organizationName}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connection Status */}
        <XeroStatusIndicator state={connectionState} size="md" />

        {/* Status Details */}
        {isConnected && status && (
          <div className="space-y-2">
            {/* Last Sync */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Last sync
              </span>
              <span className="font-medium">
                {formatLastSync(status.lastSyncAt)}
              </span>
            </div>

            {/* Pending Count */}
            {status.pendingSyncCount > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Pending items</span>
                <Badge variant="secondary">{status.pendingSyncCount}</Badge>
              </div>
            )}

            {/* Error Message */}
            {status.errorMessage && (
              <div className="text-sm text-destructive flex items-start gap-2 p-2 bg-destructive/5 rounded">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <span>{status.errorMessage}</span>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => syncNow()}
              disabled={isSyncing}
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${isSyncing ? 'animate-spin' : ''}`} />
              {isSyncing ? 'Syncing...' : 'Sync Now'}
            </Button>
          ) : (
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={reconnect}
            >
              <Link2 className="h-3.5 w-3.5 mr-1.5" />
              Connect to Xero
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
