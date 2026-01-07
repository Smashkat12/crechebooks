'use client';

/**
 * SimplePay Sync Status
 * TASK-STAFF-004: Employee sync status and actions
 *
 * Displays employee sync progress and provides bulk sync functionality.
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  RefreshCw,
  Users,
  CheckCircle,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useSimplePayStatus, useSyncAllEmployees, type SyncResult } from '@/hooks/use-simplepay';

export function SimplepaySyncStatus() {
  const { status, mutate } = useSimplePayStatus();
  const syncAllMutation = useSyncAllEmployees();
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [showAllErrors, setShowAllErrors] = useState(false);

  if (!status?.isConnected) return null;

  const totalEmployees = status.employeesSynced + status.employeesOutOfSync;
  const syncPercentage = totalEmployees > 0 ? (status.employeesSynced / totalEmployees) * 100 : 0;

  const handleSyncAll = async () => {
    setSyncResult(null);
    try {
      const result = await syncAllMutation.mutateAsync();
      setSyncResult(result);
      mutate();
    } catch (e) {
      setSyncResult({
        synced: 0,
        failed: 0,
        errors: [{ staffId: 'unknown', error: e instanceof Error ? e.message : 'Sync failed' }],
      });
    }
  };

  const visibleErrors = showAllErrors
    ? syncResult?.errors || []
    : (syncResult?.errors || []).slice(0, 3);
  const hiddenErrorCount = (syncResult?.errors?.length || 0) - 3;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Employee Sync Status
          </span>
          <Button
            onClick={handleSyncAll}
            disabled={syncAllMutation.isPending}
            size="sm"
          >
            {syncAllMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            Sync All
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Progress bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Sync Progress</span>
            <span className="font-medium">{Math.round(syncPercentage)}%</span>
          </div>
          <Progress value={syncPercentage} className="h-2" />
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-4 text-center">
          <div className="p-3 bg-muted rounded-lg">
            <div className="text-2xl font-bold text-green-600">{status.employeesSynced}</div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <CheckCircle className="w-3 h-3" />
              Synced
            </div>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <div className={`text-2xl font-bold ${status.employeesOutOfSync > 0 ? 'text-yellow-600' : 'text-green-600'}`}>
              {status.employeesOutOfSync}
            </div>
            <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <AlertCircle className="w-3 h-3" />
              Out of Sync
            </div>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <div className="text-2xl font-bold">{totalEmployees}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
        </div>

        {/* Sync result */}
        {syncResult && (
          <Alert variant={syncResult.failed > 0 ? 'destructive' : 'default'}>
            <AlertDescription>
              <div className="space-y-2">
                <p className="font-medium">
                  Sync complete: {syncResult.synced} synced, {syncResult.failed} failed
                </p>
                {syncResult.errors.length > 0 && (
                  <>
                    <ul className="text-xs space-y-1">
                      {visibleErrors.map((err, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-destructive">*</span>
                          <span>{err.error}</span>
                        </li>
                      ))}
                    </ul>
                    {syncResult.errors.length > 3 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowAllErrors(!showAllErrors)}
                        className="text-xs h-6 px-2"
                      >
                        {showAllErrors ? (
                          <>
                            <ChevronUp className="w-3 h-3 mr-1" />
                            Show less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3 mr-1" />
                            Show {hiddenErrorCount} more errors
                          </>
                        )}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Sync in progress indicator */}
        {syncAllMutation.isPending && (
          <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Syncing employees to SimplePay...
          </div>
        )}
      </CardContent>
    </Card>
  );
}
