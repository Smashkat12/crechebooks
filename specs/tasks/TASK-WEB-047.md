<task_spec id="TASK-WEB-047" version="2.0">

<metadata>
  <title>Staff Detail Page SimplePay Integration Enhancement</title>
  <status>ready</status>
  <layer>frontend</layer>
  <sequence>247</sequence>
  <implements>
    <requirement_ref>REQ-STAFF-SPAY-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-SPAY-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-01-17</last_updated>
</metadata>

<project_state>
  ## Current State

  **Files to Create:**
  - apps/web/src/components/staff/SimplepayStatusCard.tsx (NEW)

  **Current Problem:**
  The staff detail page shows basic info but does NOT display:
  - SimplePay sync status (synced/unsynced/error)
  - Last sync timestamp
  - SimplePay employee ID link
  - Quick sync action button

  **Existing Hooks Available:**
  - useEmployeeSyncStatus(staffId) - Returns sync status
  - useSyncEmployee() - Mutation to trigger sync

  The hooks exist in apps/web/src/hooks/use-simplepay.ts but are NOT used in the staff detail page.
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use pnpm NOT npm.

  ### 2. SimplepayStatusCard Component
  ```typescript
  'use client';

  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Badge } from '@/components/ui/badge';
  import { Button } from '@/components/ui/button';
  import { RefreshCw } from 'lucide-react';
  import { useEmployeeSyncStatus, useSyncEmployee } from '@/hooks/use-simplepay';
  import { formatDistanceToNow } from 'date-fns';

  interface SimplepayStatusCardProps {
    staffId: string;
  }

  export function SimplepayStatusCard({ staffId }: SimplepayStatusCardProps) {
    const { data: syncStatus, isLoading } = useEmployeeSyncStatus(staffId);
    const syncMutation = useSyncEmployee();

    const handleSync = () => {
      syncMutation.mutate(staffId);
    };

    if (isLoading) {
      return <Card><CardContent className="p-6">Loading...</CardContent></Card>;
    }

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">SimplePay Integration</CardTitle>
          <Badge variant={syncStatus?.isSynced ? 'default' : 'destructive'}>
            {syncStatus?.isSynced ? 'Synced' : 'Not Synced'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-4">
          {syncStatus?.lastSyncedAt && (
            <p className="text-sm text-muted-foreground">
              Last synced {formatDistanceToNow(new Date(syncStatus.lastSyncedAt))} ago
            </p>
          )}
          {syncStatus?.simplePayEmployeeId && (
            <p className="text-sm">
              SimplePay ID: <code>{syncStatus.simplePayEmployeeId}</code>
            </p>
          )}
          <Button
            onClick={handleSync}
            disabled={syncMutation.isPending}
            size="sm"
            variant="outline"
          >
            <RefreshCw className={syncMutation.isPending ? 'animate-spin mr-2' : 'mr-2'} size={16} />
            {syncMutation.isPending ? 'Syncing...' : 'Sync Now'}
          </Button>
        </CardContent>
      </Card>
    );
  }
  ```
</critical_patterns>

<scope>
  <in_scope>
    - Create SimplepayStatusCard component
    - Display sync status with visual indicators
    - Show last sync timestamp
    - Show SimplePay employee ID
    - Add sync now button with loading state
  </in_scope>
  <out_of_scope>
    - Modifying existing staff detail page (separate task)
    - SimplePay connection management
    - Bulk sync operations
  </out_of_scope>
</scope>

<definition_of_done>
  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors
    - SimplepayStatusCard component created
    - Uses existing hooks from use-simplepay.ts
    - Handles loading/error states
    - Sync button shows loading state
  </verification>
</definition_of_done>

</task_spec>
