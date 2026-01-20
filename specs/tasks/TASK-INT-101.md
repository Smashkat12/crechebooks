<task_spec id="TASK-INT-101" version="1.0">

<metadata>
  <title>Bank API Integration (Open Banking)</title>
  <status>ready</status>
  <phase>usacf-q2</phase>
  <layer>integration</layer>
  <sequence>212</sequence>
  <priority>P1-HIGH</priority>
  <sprint>Q2</sprint>
  <estimated_effort>15 days (120 hours)</estimated_effort>
  <budget>R40,000</budget>
  <implements>
    <opportunity_ref>OP005</opportunity_ref>
    <gap_ref>C002</gap_ref>
  </implements>
  <depends_on>
    <task_ref status="required">TASK-FEAT-101</task_ref>
  </depends_on>
  <estimated_complexity>very-high</estimated_complexity>
  <confidence>78%</confidence>
  <usacf_analysis>docs/usacf-analysis/04-synthesis.md#OP005</usacf_analysis>
</metadata>

<project_context>
  <overview>
    CrecheBooks is a South African childcare center management SaaS platform.
    Multi-tenant architecture - bank accounts linked per tenant.
    Bank integration eliminates manual CSV uploads - high-value automation.
  </overview>

  <tech_stack>
    <backend>NestJS 10.x with TypeScript strict mode</backend>
    <orm>Prisma 5.x with PostgreSQL 15</orm>
    <queue>BullMQ with Redis for sync jobs</queue>
    <encryption>AES-256-GCM for token storage</encryption>
    <banking_api>Stitch API (South African Open Banking aggregator)</banking_api>
    <testing>Jest for unit/integration, use Stitch sandbox environment</testing>
  </tech_stack>

  <monorepo_structure>
    apps/api/        - NestJS API (this task's primary target)
    apps/web/        - React frontend (linking flow UI)
    packages/shared/ - Shared types and utilities
  </monorepo_structure>

  <critical_rules>
    <rule id="1">NO BACKWARDS COMPATIBILITY - new bank API is additive to manual import</rule>
    <rule id="2">NO MOCK DATA in tests - use Stitch sandbox with test bank accounts</rule>
    <rule id="3">ROBUST ERROR LOGGING - log sync failures with bank, account, error code</rule>
    <rule id="4">TENANT ISOLATION - bank accounts and transactions tagged with tenantId</rule>
    <rule id="5">ENCRYPTION AT REST - access/refresh tokens encrypted with AES-256</rule>
    <rule id="6">POPIA COMPLIANCE - explicit consent, audit logging, 7-year retention</rule>
  </critical_rules>

  <coding_patterns>
    <pattern name="integration">External APIs in apps/api/src/integrations/</pattern>
    <pattern name="entity">Database entities in apps/api/src/database/entities/</pattern>
    <pattern name="service">Business logic in apps/api/src/database/services/</pattern>
    <pattern name="jobs">Background jobs in apps/api/src/jobs/ with @Cron decorator</pattern>
    <pattern name="controller">OAuth flow in apps/api/src/api/banking/</pattern>
  </coding_patterns>

  <existing_reconciliation_structure>
    - Bank import service at apps/api/src/database/services/bank-import.service.ts
    - Reconciliation service at apps/api/src/database/services/reconciliation.service.ts
    - Currently MANUAL CSV upload only (this task adds API integration)
  </existing_reconciliation_structure>

  <supported_banks_via_stitch>
    - FNB (First National Bank)
    - Standard Bank
    - Nedbank
    - ABSA
    - Capitec
  </supported_banks_via_stitch>

  <compliance_requirements>
    - POPIA: Explicit consent required, purpose limitation to reconciliation
    - SARS: 7-year transaction retention requirement
    - Bank: 90-day consent renewal cycle
  </compliance_requirements>
</project_context>

<executive_summary>
Implement automated bank statement retrieval via South African Open Banking APIs to eliminate
manual CSV/PDF uploads. Integration with major SA banks (FNB, Standard Bank, Nedbank, ABSA)
through aggregator services (Stitch, Yodlee). Real-time transaction fetching with automatic
reconciliation triggering.
</executive_summary>

<business_case>
  <problem>Manual bank statement imports are time-consuming and error-prone</problem>
  <solution>Automated bank feeds via Open Banking API integration</solution>
  <benefit>Eliminate manual uploads, real-time transaction visibility</benefit>
  <roi>80% reduction in reconciliation time</roi>
  <payback_period>6 months</payback_period>
</business_case>

<context>
GAP C002: No automated bank statement import.

Current State:
- Manual CSV/PDF upload required
- Data typically 1-2 days old
- Format inconsistencies between banks
- Error-prone manual process

South African Open Banking Landscape:
- Stitch API (recommended): FNB, Standard Bank, Nedbank, ABSA, Capitec
- Yodlee: International option with SA coverage
- Bank-specific APIs limited

Regulatory: POPIA compliance required for financial data handling.
</context>

<input_context_files>
  <file purpose="bank_import_service">apps/api/src/database/services/bank-import.service.ts</file>
  <file purpose="reconciliation_service">apps/api/src/database/services/reconciliation.service.ts</file>
  <file purpose="usacf_gap_analysis">docs/usacf-analysis/02-gap-analysis.md</file>
</input_context_files>

<scope>
  <in_scope>
    - Stitch API integration
    - Bank account linking flow
    - OAuth consent management
    - Transaction retrieval (polling)
    - Automatic reconciliation trigger
    - Balance verification
    - Multi-account support
    - Error handling and retry
    - Audit logging for POPIA
  </in_scope>
  <out_of_scope>
    - Payment initiation (future phase)
    - Real-time webhooks from banks
    - Account switching
    - Investment account data
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/integrations/banking/stitch.service.ts">
      @Injectable()
      export class StitchBankingService {
        async initiateAccountLink(
          tenantId: string,
          redirectUri: string
        ): Promise&lt;LinkInitResponse&gt;;

        async completeAccountLink(
          tenantId: string,
          authCode: string
        ): Promise&lt;LinkedAccount&gt;;

        async getTransactions(
          accountId: string,
          from: Date,
          to: Date
        ): Promise&lt;BankTransaction[]&gt;;

        async getBalance(accountId: string): Promise&lt;AccountBalance&gt;;

        async refreshAccountLink(accountId: string): Promise&lt;void&gt;;

        async unlinkAccount(accountId: string): Promise&lt;void&gt;;
      }
    </signature>
    <signature file="apps/api/src/database/entities/linked-bank-account.entity.ts">
      @Entity('linked_bank_accounts')
      export class LinkedBankAccount {
        id: string;
        tenantId: string;
        bankName: string;
        accountNumber: string;  // Last 4 digits only
        accountType: string;
        stitchAccountId: string;
        accessToken: string;     // Encrypted
        refreshToken: string;    // Encrypted
        consentExpiresAt: Date;
        lastSyncedAt: Date;
        status: 'active' | 'expired' | 'revoked' | 'error';
      }
    </signature>
    <signature file="apps/api/src/jobs/bank-sync.job.ts">
      @Injectable()
      export class BankSyncJob {
        @Cron('0 */4 * * *') // Every 4 hours
        async syncAllAccounts(): Promise&lt;SyncJobResult&gt;;

        async syncAccount(accountId: string): Promise&lt;AccountSyncResult&gt;;
      }
    </signature>
    <signature file="apps/api/src/api/banking/bank-link.controller.ts">
      @Controller('banking')
      export class BankLinkController {
        @Post('/link/initiate')
        async initiateLink(
          @CurrentUser() user: IUser
        ): Promise&lt;LinkInitResponse&gt;;

        @Get('/link/callback')
        async handleCallback(
          @Query('code') code: string,
          @Query('state') state: string
        ): Promise&lt;void&gt;;

        @Get('/accounts')
        async listAccounts(
          @CurrentUser() user: IUser
        ): Promise&lt;LinkedAccount[]&gt;;

        @Delete('/accounts/:id')
        async unlinkAccount(
          @CurrentUser() user: IUser,
          @Param('id') accountId: string
        ): Promise&lt;void&gt;;

        @Post('/accounts/:id/sync')
        async triggerSync(
          @Param('id') accountId: string
        ): Promise&lt;SyncResult&gt;;
      }
    </signature>
  </signatures>

  <constraints>
    - Access tokens must be encrypted at rest (AES-256)
    - Refresh tokens rotated on every use
    - Consent must be re-confirmed every 90 days (regulatory)
    - Transaction data retained for 7 years (SARS requirement)
    - Audit log all data access
    - Rate limiting: max 100 requests/hour per account
    - POPIA: user consent recorded
  </constraints>

  <verification>
    - Account linking flow works for FNB test account
    - Transactions retrieved and stored correctly
    - Automatic reconciliation triggered
    - Consent expiry handled gracefully
    - Token encryption verified
    - Audit logging complete
    - All existing tests pass
  </verification>
</definition_of_done>

<stitch_api_integration>
  <endpoint name="initiate_link">
    POST https://api.stitch.money/link/initialize
    Response: { linkUrl, state }
  </endpoint>
  <endpoint name="exchange_token">
    POST https://api.stitch.money/oauth/token
    Body: { code, redirect_uri }
    Response: { access_token, refresh_token, expires_in }
  </endpoint>
  <endpoint name="get_transactions">
    GET https://api.stitch.money/accounts/{id}/transactions
    Query: ?from=2026-01-01&to=2026-01-31
    Response: { transactions: [...] }
  </endpoint>
  <endpoint name="refresh_token">
    POST https://api.stitch.money/oauth/token
    Body: { grant_type: refresh_token, refresh_token }
    Response: { access_token, refresh_token }
  </endpoint>
</stitch_api_integration>

<implementation_approach>
  <phase order="1" duration="3 days">
    Account Linking:
    - Stitch API client setup
    - OAuth flow implementation
    - Token storage with encryption
    - Account entity creation
  </phase>
  <phase order="2" duration="4 days">
    Transaction Retrieval:
    - Transaction sync job
    - Incremental fetch (since last sync)
    - Duplicate detection
    - Error handling with retry
  </phase>
  <phase order="3" duration="3 days">
    Reconciliation Integration:
    - Trigger auto-reconciliation on sync
    - Transaction normalization
    - Category suggestions
  </phase>
  <phase order="4" duration="3 days">
    UI Integration:
    - Account linking flow
    - Account management page
    - Sync status display
    - Error notifications
  </phase>
  <phase order="5" duration="2 days">
    Testing and Hardening:
    - End-to-end testing
    - Security review
    - Performance optimization
    - Documentation
  </phase>
</implementation_approach>

<supported_banks>
  <bank name="FNB" api="stitch" status="supported"/>
  <bank name="Standard Bank" api="stitch" status="supported"/>
  <bank name="Nedbank" api="stitch" status="supported"/>
  <bank name="ABSA" api="stitch" status="supported"/>
  <bank name="Capitec" api="stitch" status="supported"/>
</supported_banks>

<files_to_create>
  <file path="apps/api/src/integrations/banking/stitch.service.ts">
    Stitch API integration service
  </file>
  <file path="apps/api/src/integrations/banking/stitch.types.ts">
    Type definitions for Stitch API
  </file>
  <file path="apps/api/src/integrations/banking/banking.module.ts">
    Banking integration module
  </file>
  <file path="apps/api/src/database/entities/linked-bank-account.entity.ts">
    Linked bank account entity
  </file>
  <file path="apps/api/src/jobs/bank-sync.job.ts">
    Periodic bank sync job
  </file>
  <file path="apps/api/src/api/banking/bank-link.controller.ts">
    Bank linking API endpoints
  </file>
  <file path="apps/api/src/api/banking/dto/bank-link.dto.ts">
    Bank linking DTOs
  </file>
  <file path="apps/api/src/common/utils/encryption.util.ts">
    Token encryption utilities
  </file>
  <file path="apps/api/src/integrations/banking/__tests__/stitch.service.spec.ts">
    Stitch service tests
  </file>
  <file path="apps/api/tests/integration/bank-link.e2e.spec.ts">
    E2E tests for bank linking
  </file>
  <file path="apps/web/src/pages/BankAccounts.tsx">
    Bank accounts management page
  </file>
  <file path="apps/web/src/components/BankLinkFlow.tsx">
    Bank linking flow component
  </file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/prisma/schema.prisma">
    Add LinkedBankAccount model
  </file>
  <file path="apps/api/src/app.module.ts">
    Import BankingModule
  </file>
  <file path="apps/api/src/database/services/reconciliation.service.ts">
    Integrate with bank sync
  </file>
  <file path="apps/api/src/config/configuration.ts">
    Add Stitch API configuration
  </file>
  <file path="apps/web/src/App.tsx">
    Add bank accounts route
  </file>
</files_to_modify>

<security_requirements>
  <requirement>Tokens encrypted with AES-256-GCM</requirement>
  <requirement>Encryption key in secure vault (not env var)</requirement>
  <requirement>All API calls over HTTPS</requirement>
  <requirement>Audit log all data access</requirement>
  <requirement>POPIA consent tracking</requirement>
  <requirement>Sensitive data not logged</requirement>
</security_requirements>

<validation_criteria>
  <criterion>Account linking flow completes successfully</criterion>
  <criterion>Transactions retrieved from test account</criterion>
  <criterion>Auto-reconciliation triggered after sync</criterion>
  <criterion>Token encryption verified</criterion>
  <criterion>Consent expiry handled</criterion>
  <criterion>All existing tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name add_linked_bank_accounts</command>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test -- --testPathPattern="stitch" --verbose</command>
  <command>npm run test:e2e -- bank-link</command>
</test_commands>

<success_metrics>
  <metric name="manual_import_reduction">80%</metric>
  <metric name="sync_success_rate">99%</metric>
  <metric name="reconciliation_time_reduction">75%</metric>
</success_metrics>

<compliance>
  <regulation name="POPIA">
    - Explicit consent for data access
    - Purpose limitation (reconciliation only)
    - Data minimization
    - Right to deletion
  </regulation>
  <regulation name="SARS">
    - Transaction retention: 7 years
    - Audit trail for financial data
  </regulation>
</compliance>

<rollback_plan>
  - Feature flag: BANK_API_ENABLED (default: false initially)
  - Manual import remains available
  - Linked accounts can be soft-deleted
  - No impact on existing functionality
</rollback_plan>

</task_spec>
