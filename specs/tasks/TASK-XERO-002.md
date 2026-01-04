<task_spec id="TASK-XERO-002" version="1.0">

<metadata>
  <title>Xero Connection Status Dashboard Widget</title>
  <status>complete</status>
  <phase>8</phase>
  <layer>surface</layer>
  <sequence>135</sequence>
  <priority>P3-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-XERO-008</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-WEB-017</task_ref>
    <task_ref status="COMPLETE">TASK-MCP-001</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
  <estimated_effort>3 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use status indicator and dashboard widget design patterns.
This task involves:
1. Visual Xero connection status indicator
2. Last sync timestamp display
3. Sync health metrics
4. Quick reconnect action
5. Pending sync items count
</reasoning_mode>

<context>
GAP: No visual indicator shows the Xero connection status. Users don't know if:
- Xero is connected
- When last sync occurred
- If there are sync errors
- If token needs refresh

This widget provides visibility into Xero integration health.
</context>

<current_state>
## Codebase State
- XeroToken entity stores connection info (TASK-MCP-001)
- Dashboard exists at apps/web/src/app/(dashboard)/page.tsx
- No Xero status widget
- Xero connection managed in settings

## XeroToken Entity (from TASK-MCP-001)
```typescript
interface XeroToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  tenantId: string;
  xeroTenantId: string;
  lastSyncAt?: Date;
}
```
</current_state>

<input_context_files>
  <file purpose="xero_token">apps/api/src/database/entities/xero-token.entity.ts</file>
  <file purpose="dashboard">apps/web/src/app/(dashboard)/page.tsx</file>
  <file purpose="xero_mcp">apps/api/src/mcp/xero/xero.mcp.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - XeroStatusWidget component
    - Connection status indicator (connected, disconnected, error)
    - Last sync timestamp
    - Pending sync count
    - Token expiry warning
    - Quick reconnect button
    - Sync now button
  </in_scope>
  <out_of_scope>
    - Full Xero settings page
    - Sync history log
    - Conflict resolution UI
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/dashboard/XeroStatusWidget.tsx">
      export interface XeroStatusWidgetProps {
        status: XeroConnectionStatus;
        compact?: boolean;
      }

      export interface XeroConnectionStatus {
        isConnected: boolean;
        lastSyncAt: Date | null;
        tokenExpiresAt: Date | null;
        pendingSyncCount: number;
        syncErrors: number;
        organizationName?: string;
      }

      export function XeroStatusWidget({
        status,
        compact = false,
      }: XeroStatusWidgetProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/components/dashboard/XeroStatusIndicator.tsx">
      export type ConnectionState = 'connected' | 'disconnected' | 'error' | 'expiring';

      export interface XeroStatusIndicatorProps {
        state: ConnectionState;
        size?: 'sm' | 'md' | 'lg';
      }

      export function XeroStatusIndicator({
        state,
        size = 'md',
      }: XeroStatusIndicatorProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/hooks/useXeroStatus.ts">
      export function useXeroStatus(): {
        status: XeroConnectionStatus | null;
        isLoading: boolean;
        error: Error | null;
        syncNow: () => Promise<void>;
        reconnect: () => void;
        isSyncing: boolean;
      };
    </signature>
  </signatures>

  <constraints>
    - Green indicator: connected, synced within 1 hour
    - Yellow indicator: connected, last sync >1 hour or token expiring soon
    - Red indicator: disconnected or errors
    - Token expiry warning: 24 hours before expiry
    - Sync now triggers manual sync
    - Reconnect redirects to Xero OAuth
    - Auto-refresh status every 60 seconds
  </constraints>

  <verification>
    - Widget displays on dashboard
    - Status indicator correct color
    - Last sync time shown
    - Pending count displayed
    - Token expiry warning works
    - Sync now triggers sync
    - Reconnect works
    - Auto-refresh works
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/dashboard/XeroStatusWidget.tsx">Main widget</file>
  <file path="apps/web/src/components/dashboard/XeroStatusIndicator.tsx">Status dot/icon</file>
  <file path="apps/web/src/hooks/useXeroStatus.ts">Status hook</file>
  <file path="apps/web/src/lib/api/xero.ts">API client</file>
  <file path="apps/api/src/xero/xero.controller.ts">Status endpoint</file>
</files_to_create>

<files_to_modify>
  <file path="apps/web/src/app/(dashboard)/page.tsx">Add widget to dashboard</file>
</files_to_modify>

<validation_criteria>
  <criterion>Widget displays on dashboard</criterion>
  <criterion>Connection status shows correctly</criterion>
  <criterion>Last sync time accurate</criterion>
  <criterion>Pending count accurate</criterion>
  <criterion>Token expiry warning works</criterion>
  <criterion>Sync now button works</criterion>
  <criterion>Reconnect button works</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build --filter=web</command>
  <command>npm run test --filter=web -- --testPathPattern="Xero" --verbose</command>
</test_commands>

</task_spec>
