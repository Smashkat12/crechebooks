<task_spec id="TASK-PERF-102" version="1.0">

<metadata>
  <title>Parallel Dashboard Query Execution</title>
  <status>ready</status>
  <phase>usacf-sprint-2</phase>
  <layer>performance</layer>
  <sequence>204</sequence>
  <priority>P1-HIGH</priority>
  <sprint>2</sprint>
  <estimated_effort>4 days (32 hours)</estimated_effort>
  <implements>
    <opportunity_ref>OP008</opportunity_ref>
    <gap_ref>P001</gap_ref>
  </implements>
  <depends_on>
    <task_ref status="required">TASK-PERF-101</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <confidence>90%</confidence>
  <usacf_analysis>docs/usacf-analysis/04-synthesis.md#OP008</usacf_analysis>
</metadata>

<project_context>
  <overview>
    CrecheBooks is a South African childcare center management SaaS platform.
    Multi-tenant architecture where every database query MUST include tenantId filter.
    Dashboard is the main landing page - load time directly impacts user experience.
  </overview>

  <tech_stack>
    <backend>NestJS 10.x with TypeScript strict mode</backend>
    <orm>Prisma 5.x with PostgreSQL 15</orm>
    <cache>Redis 7.x available for query caching (optional)</cache>
    <testing>Jest for unit/integration, no mock data - use real test database</testing>
  </tech_stack>

  <monorepo_structure>
    apps/api/        - NestJS API (this task's primary target)
    apps/web/        - React frontend
    packages/shared/ - Shared types and utilities
  </monorepo_structure>

  <critical_rules>
    <rule id="1">NO BACKWARDS COMPATIBILITY - fail fast, remove dead code immediately</rule>
    <rule id="2">NO MOCK DATA in tests - use real database with seed data</rule>
    <rule id="3">ROBUST ERROR LOGGING - partial query failures must log which query failed</rule>
    <rule id="4">TENANT ISOLATION - every dashboard query filters by tenantId</rule>
    <rule id="5">GRACEFUL DEGRADATION - single query failure must not break entire dashboard</rule>
  </critical_rules>

  <coding_patterns>
    <pattern name="service">Business logic in apps/api/src/database/services/</pattern>
    <pattern name="parallel">Use Promise.all for independent async operations</pattern>
    <pattern name="timeout">Add timeouts to prevent hanging queries</pattern>
  </coding_patterns>

  <existing_dashboard_structure>
    - Dashboard service at apps/api/src/database/services/dashboard.service.ts
    - Dashboard controller at apps/api/src/api/dashboard/dashboard.controller.ts
    - Currently SEQUENTIAL queries (this task parallelizes them)
  </existing_dashboard_structure>
</project_context>

<executive_summary>
Refactor dashboard data loading to execute independent queries in parallel using Promise.all().
Currently, dashboard loads 6 metrics sequentially taking 1.5s total. Parallel execution will
reduce this to ~500ms (3x improvement). Includes query optimization and optional caching layer.
</executive_summary>

<business_case>
  <problem>Dashboard loads in 1.5s due to sequential queries</problem>
  <solution>Execute independent queries in parallel with Promise.all()</solution>
  <benefit>3x faster dashboard load (~500ms)</benefit>
  <roi>5x return (improved user experience, reduced churn)</roi>
</business_case>

<context>
GAP P001: Sequential dashboard queries causing unnecessary latency.

Current State (dashboard.service.ts):
```typescript
// SEQUENTIAL - 1.5s total
async getDashboardData(tenantId: string): Promise<DashboardData> {
  const totalRevenue = await this.getRevenue(tenantId);        // 250ms
  const outstanding = await this.getOutstanding(tenantId);     // 200ms
  const childCount = await this.getChildCount(tenantId);       // 150ms
  const invoiceStats = await this.getInvoiceStats(tenantId);   // 300ms
  const recentPayments = await this.getRecentPayments(tenantId); // 350ms
  const arrearsData = await this.getArrearsData(tenantId);     // 250ms
  return { totalRevenue, outstanding, childCount, ... };
}
```

None of these queries depend on each other - they can all run in parallel.
</context>

<input_context_files>
  <file purpose="dashboard_service">apps/api/src/database/services/dashboard.service.ts</file>
  <file purpose="dashboard_controller">apps/api/src/api/dashboard/dashboard.controller.ts</file>
  <file purpose="usacf_gap_analysis">docs/usacf-analysis/02-gap-analysis.md</file>
</input_context_files>

<scope>
  <in_scope>
    - Refactor getDashboardData to use Promise.all()
    - Add error handling for partial failures
    - Implement query timeout protection
    - Add optional Redis caching for expensive queries
    - Create dashboard performance metrics
    - Progressive loading support (return fast data first)
  </in_scope>
  <out_of_scope>
    - Real-time WebSocket updates (TASK-FEAT-101)
    - Complex aggregation optimizations
    - Database view creation
    - CDN caching
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/dashboard.service.ts">
      @Injectable()
      export class DashboardService {
        async getDashboardData(tenantId: string): Promise&lt;DashboardData&gt; {
          const [
            totalRevenue,
            outstanding,
            childCount,
            invoiceStats,
            recentPayments,
            arrearsData,
          ] = await Promise.all([
            this.getRevenue(tenantId),
            this.getOutstanding(tenantId),
            this.getChildCount(tenantId),
            this.getInvoiceStats(tenantId),
            this.getRecentPayments(tenantId),
            this.getArrearsData(tenantId),
          ]);
          return { totalRevenue, outstanding, childCount, ... };
        }

        async getDashboardDataWithTimeout(
          tenantId: string,
          timeoutMs: number = 3000
        ): Promise&lt;DashboardData&gt;;
      }
    </signature>
    <signature file="apps/api/src/common/utils/promise-utils.ts">
      export async function promiseAllSettledWithTimeout&lt;T&gt;(
        promises: Promise&lt;T&gt;[],
        timeoutMs: number
      ): Promise&lt;PromiseSettledResult&lt;T&gt;[]&gt;;

      export async function promiseAllWithPartialFailure&lt;T&gt;(
        promises: Promise&lt;T&gt;[],
        defaults: T[]
      ): Promise&lt;T[]&gt;;
    </signature>
  </signatures>

  <constraints>
    - Maximum dashboard load time: 500ms (P95)
    - Individual query timeout: 2 seconds
    - Partial failure must not break entire dashboard
    - Failed queries return default/cached values
    - Connection pool must handle concurrent queries
  </constraints>

  <verification>
    - Dashboard loads in &lt;500ms (from 1.5s baseline)
    - Partial query failure handled gracefully
    - Query timeouts don't hang dashboard
    - All metrics still accurate
    - Connection pool stable under load
  </verification>
</definition_of_done>

<implementation_approach>
  <step order="1">
    Create promise utility functions with timeout support
  </step>
  <step order="2">
    Refactor getDashboardData to use Promise.all():
    ```typescript
    async getDashboardData(tenantId: string): Promise<DashboardData> {
      const queries = [
        this.getRevenue(tenantId),
        this.getOutstanding(tenantId),
        this.getChildCount(tenantId),
        this.getInvoiceStats(tenantId),
        this.getRecentPayments(tenantId),
        this.getArrearsData(tenantId),
      ];

      const [
        totalRevenue,
        outstanding,
        childCount,
        invoiceStats,
        recentPayments,
        arrearsData,
      ] = await Promise.all(queries);

      return { totalRevenue, outstanding, childCount, invoiceStats, recentPayments, arrearsData };
    }
    ```
  </step>
  <step order="3">
    Add error handling with partial failure support
  </step>
  <step order="4">
    Implement query timeout protection
  </step>
  <step order="5">
    Add optional Redis caching for expensive queries
  </step>
  <step order="6">
    Create performance benchmark tests
  </step>
</implementation_approach>

<files_to_create>
  <file path="apps/api/src/common/utils/promise-utils.ts">
    Promise utilities with timeout and partial failure support
  </file>
  <file path="apps/api/src/database/services/__tests__/dashboard.service.spec.ts">
    Updated dashboard service tests
  </file>
  <file path="apps/api/tests/performance/dashboard.perf.ts">
    Dashboard performance benchmarks
  </file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/services/dashboard.service.ts">
    Refactor to parallel execution
  </file>
  <file path="apps/api/src/api/dashboard/dashboard.controller.ts">
    Add timeout parameter support
  </file>
</files_to_modify>

<validation_criteria>
  <criterion>Dashboard loads in &lt;500ms P95</criterion>
  <criterion>Partial query failures handled gracefully</criterion>
  <criterion>No regression in data accuracy</criterion>
  <criterion>Connection pool stable under load</criterion>
  <criterion>All existing tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test -- --testPathPattern="dashboard" --verbose</command>
  <command>npm run test:perf -- dashboard</command>
</test_commands>

<success_metrics>
  <metric name="latency_reduction">67% (1500ms → 500ms)</metric>
  <metric name="p95_response_time">&lt;500ms</metric>
  <metric name="partial_failure_handling">100%</metric>
</success_metrics>

<rollback_plan>
  - Feature flag: PARALLEL_DASHBOARD_QUERIES (default: true)
  - Fallback to sequential execution if issues detected
  - No database changes required
</rollback_plan>

</task_spec>
