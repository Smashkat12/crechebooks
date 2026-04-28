'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { formatDistanceToNow, isPast, parseISO } from 'date-fns';
import { useXeroSyncStatus, useTriggerXeroSync } from '@/hooks/admin/use-xero-sync-status';
import { useToast } from '@/hooks/use-toast';
import type { XeroSyncStatusResponse } from '@/lib/api/xero';

// ─── helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso: string | null): string {
  if (!iso) return '—';
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return '—';
  }
}

function isExpired(iso: string | null): boolean {
  if (!iso) return false;
  try {
    return isPast(parseISO(iso));
  } catch {
    return false;
  }
}

function isRunning(data: XeroSyncStatusResponse): boolean {
  return (
    data.currentJob?.status === 'RUNNING' ||
    data.currentJob?.status === 'PENDING' ||
    data.lastSyncStatus === 'RUNNING'
  );
}

/**
 * Returns a human-friendly retry countdown string, e.g.:
 *   "Auto-retry in 3h 24m (failure #2)"
 *   "Auto-retry in 47m (failure #1)"
 *   "Retrying soon... (failure #3)"
 */
function retryCountdown(errorRetryState: XeroSyncStatusResponse['errorRetryState']): string | null {
  if (!errorRetryState) return null;
  const { nextRetryAt, consecutiveFailures } = errorRetryState;
  const failureSuffix = `(failure #${consecutiveFailures})`;

  if (!nextRetryAt) return `Retrying soon… ${failureSuffix}`;

  try {
    const msUntil = parseISO(nextRetryAt).getTime() - Date.now();
    if (msUntil <= 0) return `Retrying soon… ${failureSuffix}`;

    const totalMinutes = Math.ceil(msUntil / 60_000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    const duration =
      hours > 0
        ? minutes > 0
          ? `${hours}h ${minutes}m`
          : `${hours}h`
        : `${minutes}m`;

    return `Auto-retry in ${duration} ${failureSuffix}`;
  } catch {
    return null;
  }
}

// ─── sub-components ──────────────────────────────────────────────────────────

function SyncStatusBadge({ status }: { status: XeroSyncStatusResponse['lastSyncStatus'] }) {
  if (!status) return null;

  const config = {
    COMPLETED: { label: 'Completed', className: 'bg-green-600 text-white' },
    FAILED: { label: 'Failed', className: 'bg-destructive text-destructive-foreground' },
    RUNNING: { label: 'Running', className: 'bg-amber-500 text-white' },
  } as const;

  const { label, className } = config[status];

  return (
    <Badge className={className}>
      {status === 'RUNNING' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
      {label}
    </Badge>
  );
}

function LastErrorSection({ error }: { error: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded border border-destructive/30 bg-destructive/5 text-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2 text-destructive font-medium"
      >
        <span className="flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" />
          Last sync error
        </span>
        {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>
      {open && (
        <p className="px-3 pb-2 text-muted-foreground break-words">{error}</p>
      )}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export function XeroSyncStatusCard() {
  const { data, isLoading, error } = useXeroSyncStatus();
  const triggerSync = useTriggerXeroSync();
  const { toast } = useToast();

  const handleSyncNow = async () => {
    try {
      await triggerSync.mutateAsync();
      toast({ title: 'Sync triggered', description: 'Xero sync job has been queued.' });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Sync failed',
        description: err instanceof Error ? err.message : 'Could not trigger Xero sync.',
      });
    }
  };

  // ── loading skeleton ──
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sync Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-5 bg-muted animate-pulse rounded w-1/2" />
          <div className="h-4 bg-muted animate-pulse rounded w-2/3" />
          <div className="h-4 bg-muted animate-pulse rounded w-1/3" />
        </CardContent>
      </Card>
    );
  }

  // ── error state ──
  if (error || !data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Sync Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span>Failed to load sync status</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const syncing = isRunning(data);
  const tokenExpired = isExpired(data.tokenExpiresAt) && !data.refreshTokenValid;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              Sync Status
              {syncing && (
                <span className="flex items-center gap-1 text-amber-600 text-sm font-normal">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Syncing now…
                </span>
              )}
            </CardTitle>
            <CardDescription>Hourly auto-sync · next {relativeTime(data.nextScheduledSyncAt)}</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncNow}
            disabled={syncing || triggerSync.isPending}
          >
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${triggerSync.isPending ? 'animate-spin' : ''}`} />
            {syncing || triggerSync.isPending ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Token-expired prominent warning */}
        {tokenExpired && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Xero authentication has expired.{' '}
              <button
                type="button"
                className="underline font-medium"
                onClick={() => {
                  // Re-use the existing OAuth flow: the integrations page
                  // calls xeroApi.connect() which returns an authUrl.
                  // TODO: expose a reconnect button at the top of this page
                  // that calls handleConnect() directly. For now route user
                  // back to integrations page which auto-triggers reconnect
                  // when ?reconnect=xero is set.
                  window.location.href = '/settings/integrations?reconnect=xero';
                }}
              >
                Click here to reconnect
              </button>
            </AlertDescription>
          </Alert>
        )}

        {/* Status rows */}
        <div className="space-y-2 text-sm">
          {/* Last sync */}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              Last sync
            </span>
            <span className="font-medium">
              {data.lastSyncAt
                ? syncing && data.lastSyncStatus === 'RUNNING'
                  ? 'Syncing now…'
                  : relativeTime(data.lastSyncAt)
                : 'No sync yet'}
            </span>
          </div>

          {/* Last sync status */}
          {data.lastSyncStatus && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Last status</span>
              <SyncStatusBadge status={data.lastSyncStatus} />
            </div>
          )}

          {/* Auto-retry countdown (only when in ERROR backoff) */}
          {retryCountdown(data.errorRetryState) && (
            <div className="flex items-center gap-1.5 text-muted-foreground pl-0.5">
              <Clock className="h-3 w-3 shrink-0" />
              <span className="text-xs">{retryCountdown(data.errorRetryState)}</span>
            </div>
          )}

          {/* Token expiry (only when not already expired without refresh) */}
          {data.tokenExpiresAt && !tokenExpired && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground flex items-center gap-1.5">
                Token expires
              </span>
              <span
                className={
                  isExpired(data.tokenExpiresAt)
                    ? 'font-medium text-amber-600'
                    : 'font-medium'
                }
              >
                {relativeTime(data.tokenExpiresAt)}
              </span>
            </div>
          )}

          {/* Current job progress */}
          {data.currentJob?.progress && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">
                {data.currentJob.progress.current} / {data.currentJob.progress.total}
              </span>
            </div>
          )}

          {/* Connection badge */}
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Connection</span>
            {data.connected ? (
              <span className="flex items-center gap-1 text-green-600 font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Connected
              </span>
            ) : (
              <span className="text-muted-foreground">Disconnected</span>
            )}
          </div>
        </div>

        {/* Collapsible last error */}
        {data.lastSyncStatus === 'FAILED' && data.lastSyncError && (
          <LastErrorSection error={data.lastSyncError} />
        )}
      </CardContent>
    </Card>
  );
}
