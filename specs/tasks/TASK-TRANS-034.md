<task_spec id="TASK-TRANS-034" version="1.0">

<metadata>
  <title>Xero Sync REST API Endpoints</title>
  <status>pending</status>
  <layer>surface</layer>
  <sequence>111</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-TRANS-008</requirement_ref>
    <critical_issue_ref>HIGH-002</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-014</task_ref>
    <task_ref status="PENDING">TASK-TRANS-016</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>2 days</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use API design and integration thinking.
This task involves:
1. REST endpoints for Xero sync operations
2. OAuth connection flow
3. Sync status reporting
4. WebSocket for real-time progress
5. Error handling and retry
</reasoning_mode>

<context>
GAP: XeroSyncService exists but has no REST API endpoints.

REQ-TRANS-008 specifies: "Bi-directional sync with Xero."

This task creates REST endpoints to expose Xero sync functionality to the frontend.
</context>

<current_state>
## Codebase State
- XeroService exists at apps/api/src/integrations/xero/xero.service.ts
- XeroSyncService exists at apps/api/src/database/services/xero-sync.service.ts
- OAuth token management exists
- No REST endpoints for sync operations

## What Exists
- syncToXero() method
- syncFromXero() method
- Token refresh logic
</current_state>

<input_context_files>
  <file purpose="xero_service">apps/api/src/integrations/xero/xero.service.ts</file>
  <file purpose="xero_sync">apps/api/src/database/services/xero-sync.service.ts</file>
  <file purpose="xero_module">apps/api/src/integrations/xero/xero.module.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - POST /api/xero/connect - initiate OAuth
    - GET /api/xero/callback - OAuth callback
    - POST /api/xero/sync - trigger manual sync
    - GET /api/xero/status - check connection/sync status
    - POST /api/xero/disconnect - disconnect Xero
    - WebSocket gateway for sync progress
  </in_scope>
  <out_of_scope>
    - Xero service implementation (exists)
    - Bank feed integration (TASK-TRANS-016)
    - UI components
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/integrations/xero/xero.controller.ts">
      @Controller('xero')
      export class XeroController {
        @Post('connect')
        async initiateConnection(
          @Headers('x-tenant-id') tenantId: string
        ): Promise<{ authUrl: string }>;

        @Get('callback')
        async handleCallback(
          @Query('code') code: string,
          @Query('state') state: string,
          @Res() res: Response
        ): Promise<void>;

        @Post('sync')
        async triggerSync(
          @Headers('x-tenant-id') tenantId: string,
          @Body() body: SyncRequestDto
        ): Promise<SyncJobResponse>;

        @Get('status')
        async getStatus(
          @Headers('x-tenant-id') tenantId: string
        ): Promise<XeroConnectionStatus>;

        @Post('disconnect')
        async disconnect(
          @Headers('x-tenant-id') tenantId: string
        ): Promise<void>;
      }
    </signature>
    <signature file="apps/api/src/integrations/xero/xero.gateway.ts">
      @WebSocketGateway({ namespace: 'xero-sync' })
      export class XeroSyncGateway {
        @SubscribeMessage('subscribe')
        handleSubscribe(client: Socket, tenantId: string): void;

        emitProgress(tenantId: string, progress: SyncProgress): void;
        emitComplete(tenantId: string, result: SyncResult): void;
        emitError(tenantId: string, error: SyncError): void;
      }
    </signature>
    <signature file="apps/api/src/integrations/xero/dto/xero.dto.ts">
      export interface SyncRequestDto {
        direction: 'push' | 'pull' | 'bidirectional';
        entities?: ('invoices' | 'payments' | 'contacts')[];
        fromDate?: string;
      }

      export interface XeroConnectionStatus {
        isConnected: boolean;
        tenantName?: string;
        connectedAt?: Date;
        lastSyncAt?: Date;
        lastSyncStatus?: 'success' | 'partial' | 'failed';
      }

      export interface SyncProgress {
        entity: string;
        total: number;
        processed: number;
        percentage: number;
      }
    </signature>
  </signatures>

  <constraints>
    - OAuth2 with PKCE flow
    - State parameter for CSRF protection
    - Redirect to frontend after callback
    - Rate limiting: 60 calls/minute to Xero
    - WebSocket authentication required
    - Sync jobs processed asynchronously
  </constraints>

  <verification>
    - OAuth flow completes successfully
    - Sync triggers and completes
    - Status endpoint returns accurate data
    - WebSocket emits progress events
    - Disconnect removes tokens
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/integrations/xero/xero.controller.ts">REST controller</file>
  <file path="apps/api/src/integrations/xero/xero.gateway.ts">WebSocket gateway</file>
  <file path="apps/api/src/integrations/xero/dto/xero.dto.ts">DTOs</file>
  <file path="apps/api/src/integrations/xero/__tests__/xero.controller.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/integrations/xero/xero.module.ts">Register controller and gateway</file>
</files_to_modify>

<validation_criteria>
  <criterion>OAuth connect flow works</criterion>
  <criterion>Sync endpoint triggers job</criterion>
  <criterion>Status endpoint accurate</criterion>
  <criterion>WebSocket emits progress</criterion>
  <criterion>Disconnect clears tokens</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="xero.controller" --verbose</command>
</test_commands>

</task_spec>
