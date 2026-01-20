<task_spec id="TASK-REL-101" version="1.0">

<metadata>
  <title>Circuit Breaker Pattern for Xero Integration</title>
  <status>ready</status>
  <phase>usacf-sprint-1</phase>
  <layer>reliability</layer>
  <sequence>203</sequence>
  <priority>P0-CRITICAL</priority>
  <sprint>1</sprint>
  <estimated_effort>5 days (40 hours)</estimated_effort>
  <implements>
    <opportunity_ref>OP001</opportunity_ref>
    <gap_ref>P004</gap_ref>
    <fmea_ref>FM001</fmea_ref>
  </implements>
  <depends_on>
    <task_ref status="required">TASK-SEC-101</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <confidence>92%</confidence>
  <fmea_rpn>432 (Critical)</fmea_rpn>
  <usacf_analysis>docs/usacf-analysis/04-synthesis.md#OP001</usacf_analysis>
</metadata>

<project_context>
  <overview>
    CrecheBooks is a South African childcare center management SaaS platform.
    Multi-tenant architecture where every database query MUST include tenantId filter.
    Xero integration is critical for invoice sync - outages currently cause complete failure.
  </overview>

  <tech_stack>
    <backend>NestJS 10.x with TypeScript strict mode</backend>
    <orm>Prisma 5.x with PostgreSQL 15</orm>
    <queue>BullMQ with Redis for background jobs and circuit breaker state</queue>
    <testing>Jest for unit/integration, no mock data - use real test database</testing>
  </tech_stack>

  <monorepo_structure>
    apps/api/        - NestJS API (this task's primary target)
    apps/web/        - React frontend
    packages/shared/ - Shared types and utilities
  </monorepo_structure>

  <critical_rules>
    <rule id="1">NO BACKWARDS COMPATIBILITY - fail fast, remove dead code immediately</rule>
    <rule id="2">NO MOCK DATA in tests - use real database, simulate Xero with test fixtures</rule>
    <rule id="3">ROBUST ERROR LOGGING - all circuit state changes logged with full context</rule>
    <rule id="4">TENANT ISOLATION - pending sync queue must track tenantId</rule>
    <rule id="5">ZERO DATA LOSS - all pending items must persist across restarts</rule>
  </critical_rules>

  <coding_patterns>
    <pattern name="service">Business logic in apps/api/src/database/services/</pattern>
    <pattern name="jobs">Background jobs in apps/api/src/jobs/ with @Cron decorator</pattern>
    <pattern name="integration">External APIs in apps/api/src/integrations/</pattern>
  </coding_patterns>

  <existing_xero_structure>
    - Xero sync service at apps/api/src/database/services/xero-sync.service.ts
    - Xero MCP client at apps/api/src/mcp/xero/xero.mcp.ts
    - Invoice generation at apps/api/src/database/services/invoice-generation.service.ts
    - Currently NO circuit breaker, NO fallback (this task adds both)
  </existing_xero_structure>
</project_context>

<executive_summary>
Implement circuit breaker pattern for all Xero API calls to prevent cascade failures during
Xero outages. Currently, Xero calls are synchronous with no timeout or fallback, causing
complete invoice generation failure during outages. Expected improvement: Zero invoice
generation failures during Xero outages with automatic sync on recovery.
</executive_summary>

<business_case>
  <problem>Xero outages cause complete invoice generation failure (FMEA RPN: 432)</problem>
  <solution>Circuit breaker with fallback to pending-sync queue</solution>
  <benefit>Invoices generated even during outages, auto-sync on recovery</benefit>
  <roi>12x return in year 1 (R4,000 cost, R48,000 incident avoidance)</roi>
  <incident_frequency>~2 per month, 15-60 min each</incident_frequency>
</business_case>

<context>
FMEA FM001: Xero API Complete Failure
- Severity: 9 (All invoice sync blocked, financial data inconsistent)
- Occurrence: 6 (Xero has ~2 outages/month)
- Detection: 8 (No health check, no circuit breaker)
- RPN: 432 (CRITICAL)

Current State (xero-sync.service.ts):
```typescript
// VULNERABLE: No timeout, no circuit breaker
async syncInvoice(invoice: Invoice): Promise<XeroInvoice> {
  // Blocking call - hangs indefinitely during outage
  return this.xeroClient.invoices.create(invoice);
}
```

Effects Chain:
- Local: Invoice generation hangs indefinitely
- Downstream: Parent notifications delayed
- End Effect: Revenue collection delayed, customer frustration
</context>

<input_context_files>
  <file purpose="xero_sync_service">apps/api/src/database/services/xero-sync.service.ts</file>
  <file purpose="xero_mcp">apps/api/src/mcp/xero/xero.mcp.ts</file>
  <file purpose="invoice_generation">apps/api/src/database/services/invoice-generation.service.ts</file>
  <file purpose="usacf_risk_analysis">docs/usacf-analysis/03-risk-analysis.md</file>
</input_context_files>

<scope>
  <in_scope>
    - Install and configure opossum circuit breaker library
    - Wrap all Xero API calls with circuit breaker
    - Implement fallback to pending-sync queue
    - Add Xero health check endpoint monitoring
    - Create sync recovery job for pending items
    - Circuit breaker state monitoring/metrics
    - Graceful degradation UI indicators
  </in_scope>
  <out_of_scope>
    - Xero webhook handling improvements (separate task)
    - Real-time Xero status dashboard
    - Multi-region Xero failover
    - Offline-first architecture
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/integrations/circuit-breaker/xero-circuit-breaker.ts">
      export interface CircuitBreakerConfig {
        timeout: number;          // 5000ms
        errorThresholdPercentage: number;  // 50
        resetTimeout: number;     // 30000ms
        volumeThreshold: number;  // 5
      }

      @Injectable()
      export class XeroCircuitBreaker {
        private breaker: CircuitBreaker;

        constructor(config: CircuitBreakerConfig);

        async execute&lt;T&gt;(
          action: () => Promise&lt;T&gt;,
          fallback?: () => Promise&lt;T&gt;
        ): Promise&lt;T&gt;;

        getState(): 'CLOSED' | 'OPEN' | 'HALF_OPEN';
        getMetrics(): CircuitBreakerMetrics;
        onStateChange(callback: (state: string) => void): void;
      }
    </signature>
    <signature file="apps/api/src/database/services/xero-sync.service.ts">
      @Injectable()
      export class XeroSyncService {
        constructor(
          private xeroCircuitBreaker: XeroCircuitBreaker,
          private pendingSyncQueue: PendingSyncQueue,
        );

        async syncInvoice(invoice: Invoice): Promise&lt;SyncResult&gt; {
          return this.xeroCircuitBreaker.execute(
            () => this.doSyncInvoice(invoice),
            () => this.queueForLaterSync(invoice)
          );
        }
      }
    </signature>
    <signature file="apps/api/src/database/services/pending-sync-queue.service.ts">
      @Injectable()
      export class PendingSyncQueueService {
        async queueForSync(entity: SyncableEntity): Promise&lt;void&gt;;
        async processPendingQueue(): Promise&lt;SyncBatchResult&gt;;
        async getPendingCount(): Promise&lt;number&gt;;
        async retryFailed(): Promise&lt;void&gt;;
      }
    </signature>
    <signature file="apps/api/src/jobs/xero-sync-recovery.job.ts">
      @Injectable()
      export class XeroSyncRecoveryJob {
        @Cron('*/5 * * * *') // Every 5 minutes
        async processRecovery(): Promise&lt;void&gt;;
      }
    </signature>
  </signatures>

  <constraints>
    - Circuit breaker timeout: 5 seconds
    - Open circuit after 50% failures (minimum 5 requests)
    - Half-open after 30 seconds
    - All pending items must be synced within 5 minutes of Xero recovery
    - Pending queue must persist across restarts (database-backed)
    - Circuit state must be shared across API instances (Redis)
    - UI must show "sync pending" status for affected invoices
  </constraints>

  <verification>
    - Invoice generation succeeds during simulated Xero outage
    - Pending items automatically sync when circuit closes
    - Circuit opens after threshold failures
    - Circuit half-opens after reset timeout
    - Metrics accurately reflect circuit state
    - All existing Xero tests pass
  </verification>
</definition_of_done>

<circuit_breaker_states>
  <state name="CLOSED">
    Normal operation, all requests pass through
  </state>
  <state name="OPEN">
    Circuit tripped, all requests immediately fail with fallback
    Triggered: 50% failure rate over 5+ requests
  </state>
  <state name="HALF_OPEN">
    Testing recovery, limited requests pass through
    Triggered: 30 seconds after opening
  </state>
</circuit_breaker_states>

<implementation_approach>
  <step order="1">
    Install opossum circuit breaker:
    ```bash
    pnpm add opossum @types/opossum
    ```
  </step>
  <step order="2">
    Create XeroCircuitBreaker service with configuration
  </step>
  <step order="3">
    Create PendingSyncQueue service with database persistence
  </step>
  <step order="4">
    Update XeroSyncService to use circuit breaker
  </step>
  <step order="5">
    Create XeroSyncRecoveryJob for automatic recovery
  </step>
  <step order="6">
    Add circuit breaker metrics endpoint
  </step>
  <step order="7">
    Add Xero health check monitoring
  </step>
  <step order="8">
    Update UI to show pending sync status
  </step>
</implementation_approach>

<files_to_create>
  <file path="apps/api/src/integrations/circuit-breaker/xero-circuit-breaker.ts">
    Circuit breaker wrapper for Xero API
  </file>
  <file path="apps/api/src/integrations/circuit-breaker/circuit-breaker.module.ts">
    Circuit breaker module
  </file>
  <file path="apps/api/src/database/entities/pending-sync.entity.ts">
    PendingSync entity for queue persistence
  </file>
  <file path="apps/api/src/database/services/pending-sync-queue.service.ts">
    Queue management service
  </file>
  <file path="apps/api/src/jobs/xero-sync-recovery.job.ts">
    Cron job for processing recovery queue
  </file>
  <file path="apps/api/src/integrations/circuit-breaker/__tests__/xero-circuit-breaker.spec.ts">
    Circuit breaker unit tests
  </file>
  <file path="apps/api/tests/integration/xero-outage-simulation.spec.ts">
    Integration test simulating Xero outage
  </file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/services/xero-sync.service.ts">
    Integrate circuit breaker
  </file>
  <file path="apps/api/src/database/services/invoice-generation.service.ts">
    Handle pending sync status
  </file>
  <file path="apps/api/prisma/schema.prisma">
    Add PendingSync model
  </file>
  <file path="apps/api/src/app.module.ts">
    Import CircuitBreakerModule
  </file>
  <file path="package.json">
    Add opossum dependency
  </file>
</files_to_modify>

<validation_criteria>
  <criterion>Invoice generation succeeds during Xero outage</criterion>
  <criterion>Circuit opens after 50% failure rate</criterion>
  <criterion>Pending invoices sync within 5 min of recovery</criterion>
  <criterion>Circuit state visible in monitoring</criterion>
  <criterion>No data loss during outage</criterion>
  <criterion>All existing tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name add_pending_sync</command>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test -- --testPathPattern="circuit-breaker" --verbose</command>
  <command>npm run test -- --testPathPattern="xero-outage" --verbose</command>
  <command>npm run test -- --testPathPattern="xero" --verbose</command>
</test_commands>

<success_metrics>
  <metric name="outage_invoice_success">100%</metric>
  <metric name="recovery_time">&lt;5 minutes</metric>
  <metric name="data_loss">0%</metric>
  <metric name="new_rpn">162 (from 432)</metric>
</success_metrics>

<monitoring>
  <metric name="circuit_state">CLOSED/OPEN/HALF_OPEN</metric>
  <metric name="pending_sync_count">Number of items awaiting sync</metric>
  <metric name="failure_rate">Percentage of Xero calls failing</metric>
  <metric name="recovery_time">Time from circuit open to all synced</metric>
</monitoring>

<rollback_plan>
  - Feature flag: CIRCUIT_BREAKER_ENABLED (default: true)
  - Disable returns to direct Xero calls (risky during outage)
  - Database migration is additive, no rollback needed
  - Pending items will sync when circuit breaker re-enabled
</rollback_plan>

</task_spec>
