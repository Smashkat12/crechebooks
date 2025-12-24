<task_spec id="TASK-TRANS-016" version="1.0">

<metadata>
  <title>Bank Feed Integration Service via Xero API</title>
  <status>pending</status>
  <layer>logic</layer>
  <sequence>97</sequence>
  <priority>P0-BLOCKER</priority>
  <implements>
    <requirement_ref>REQ-TRANS-001</requirement_ref>
    <critical_issue_ref>CRIT-003</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-001</task_ref>
    <task_ref status="COMPLETE">TASK-MCP-001</task_ref>
    <task_ref status="COMPLETE">TASK-TRANS-014</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>1 week</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use integration-focused thinking with security awareness.
This task involves:
1. OAuth2 authentication with Xero
2. Bank feed API integration
3. Webhook handling for real-time events
4. Transaction mapping between systems
5. Secure credential storage
</reasoning_mode>

<context>
CRITICAL GAP: Bank feed auto-import is missing entirely. Currently only CSV/PDF manual upload works.

REQ-TRANS-001 specifies: "Import transactions via bank feed, PDF, or CSV upload."

This task implements the bank feed portion by integrating with Xero's Bank Feeds API, enabling automatic transaction syncing from connected bank accounts.
</context>

<current_state>
## Codebase State
- XeroService exists: `apps/api/src/integrations/xero/xero.service.ts`
- XeroToken entity exists for OAuth storage
- TransactionImportService handles CSV/PDF
- No bank feed specific code exists

## What Exists
- Xero MCP Server integration (TASK-MCP-001)
- XeroSyncService for bi-directional sync (TASK-TRANS-014)
- OAuth token refresh logic

## What's Missing
- Bank feed connection flow
- Bank feed sync scheduler
- Real-time webhook handler
- Transaction mapping from Xero bank format
</current_state>

<input_context_files>
  <file purpose="xero_service">apps/api/src/integrations/xero/xero.service.ts</file>
  <file purpose="xero_sync">apps/api/src/database/services/xero-sync.service.ts</file>
  <file purpose="import_service">apps/api/src/database/services/transaction-import.service.ts</file>
  <file purpose="transaction_entity">apps/api/src/database/entities/transaction.entity.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - BankFeedService for Xero bank feed integration
    - Bank account connection flow
    - Automatic sync every 4 hours (via SchedulerService)
    - Webhook endpoint for real-time transaction events
    - Transaction mapping from Xero to local format
    - Integration tests with Xero sandbox
  </in_scope>
  <out_of_scope>
    - Other bank APIs (direct FNB, Standard Bank, etc.)
    - PDF/CSV import changes
    - UI for bank connection (surface layer)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/integrations/xero/bank-feed.service.ts">
      @Injectable()
      export class BankFeedService {
        async connectBankAccount(tenantId: string, xeroAccountId: string): Promise<BankConnection>;
        async disconnectBankAccount(tenantId: string, connectionId: string): Promise<void>;
        async syncTransactions(tenantId: string, fromDate?: Date): Promise<BankSyncResult>;
        async handleWebhook(payload: XeroWebhookPayload): Promise<void>;
        async getConnectedAccounts(tenantId: string): Promise<BankConnection[]>;
      }
    </signature>
    <signature file="apps/api/src/integrations/xero/types/bank-feed.types.ts">
      export interface BankConnection {
        id: string;
        tenantId: string;
        xeroAccountId: string;
        accountName: string;
        accountNumber: string;
        bankName: string;
        connectedAt: Date;
        lastSyncAt: Date | null;
        status: 'active' | 'disconnected' | 'error';
      }

      export interface BankSyncResult {
        connectionId: string;
        transactionsFound: number;
        transactionsCreated: number;
        duplicatesSkipped: number;
        syncedAt: Date;
      }

      export interface XeroWebhookPayload {
        eventType: string;
        tenantId: string;
        resourceId: string;
        eventDateUtc: string;
      }
    </signature>
  </signatures>

  <constraints>
    - Must use existing XeroService for API calls
    - OAuth tokens managed via XeroToken entity
    - Transaction mapping must preserve all Xero fields
    - Webhook signature must be verified
    - Sync conflicts resolved with Xero as source of truth
    - Rate limiting respected (60 calls/minute)
  </constraints>

  <verification>
    - Bank connection flow works with Xero sandbox
    - Transactions sync correctly
    - Webhook processes events
    - Duplicates detected and skipped
    - All tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/integrations/xero/bank-feed.service.ts">Bank feed service</file>
  <file path="apps/api/src/integrations/xero/types/bank-feed.types.ts">Types and interfaces</file>
  <file path="apps/api/src/integrations/xero/__tests__/bank-feed.service.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/integrations/xero/xero.module.ts">Export BankFeedService</file>
  <file path="apps/api/src/integrations/xero/index.ts">Add exports</file>
</files_to_modify>

<validation_criteria>
  <criterion>BankFeedService connects to Xero bank feeds</criterion>
  <criterion>Transactions sync from Xero to local database</criterion>
  <criterion>Webhook endpoint processes events</criterion>
  <criterion>Duplicate detection works</criterion>
  <criterion>Rate limiting respected</criterion>
  <criterion>Tests pass with Xero sandbox</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="bank-feed" --verbose</command>
</test_commands>

</task_spec>
