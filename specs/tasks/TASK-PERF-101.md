<task_spec id="TASK-PERF-101" version="1.0">

<metadata>
  <title>N+1 Query Batch Loading Fix</title>
  <status>ready</status>
  <phase>usacf-sprint-1</phase>
  <layer>performance</layer>
  <sequence>201</sequence>
  <priority>P0-CRITICAL</priority>
  <sprint>1</sprint>
  <estimated_effort>4 days (32 hours)</estimated_effort>
  <implements>
    <opportunity_ref>OP002</opportunity_ref>
    <gap_ref>Q001</gap_ref>
    <gap_ref>P001</gap_ref>
  </implements>
  <depends_on>
    <!-- No dependencies - foundation task -->
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <confidence>95%</confidence>
  <usacf_analysis>docs/usacf-analysis/04-synthesis.md#OP002</usacf_analysis>
</metadata>

<project_context>
  <overview>
    CrecheBooks is a South African childcare center management SaaS platform.
    Multi-tenant architecture where every database query MUST include tenantId filter.
  </overview>

  <tech_stack>
    <backend>NestJS 10.x with TypeScript strict mode</backend>
    <orm>Prisma 5.x with PostgreSQL 15</orm>
    <frontend>React 18 with Vite, TanStack Query</frontend>
    <queue>BullMQ with Redis for background jobs</queue>
    <testing>Jest for unit/integration, no mock data - use real test database</testing>
  </tech_stack>

  <monorepo_structure>
    apps/api/        - NestJS API (this task's primary target)
    apps/web/        - React frontend
    packages/shared/ - Shared types and utilities
  </monorepo_structure>

  <critical_rules>
    <rule id="1">NO BACKWARDS COMPATIBILITY - fail fast, remove dead code immediately</rule>
    <rule id="2">NO MOCK DATA in tests - use real database with test fixtures</rule>
    <rule id="3">ROBUST ERROR LOGGING - all errors must have correlation IDs and context</rule>
    <rule id="4">TENANT ISOLATION - every query must filter by tenantId, no exceptions</rule>
    <rule id="5">TYPE SAFETY - strict TypeScript, no 'any' types, explicit return types</rule>
  </critical_rules>

  <coding_patterns>
    <pattern name="repository">Use repository pattern in apps/api/src/database/repositories/</pattern>
    <pattern name="service">Business logic in apps/api/src/database/services/</pattern>
    <pattern name="controller">HTTP layer in apps/api/src/api/{domain}/</pattern>
    <pattern name="dto">Validation via class-validator DTOs</pattern>
  </coding_patterns>

  <related_integrations>
    Xero (accounting sync), SimplePay (payroll), Banking APIs (reconciliation)
  </related_integrations>
</project_context>

<executive_summary>
Replace sequential parent/child queries in invoice listing with batch loading using findByIds
and Map-based lookups. This eliminates N+1 query patterns that currently cause 41+ queries
per request, resulting in 250ms+ latency overhead. Expected improvement: 76% latency reduction.
</executive_summary>

<business_case>
  <problem>Invoice listing takes 250ms+ due to 41+ queries per 20 invoices</problem>
  <solution>Batch load related entities in 3 queries using findByIds</solution>
  <benefit>76% latency reduction, better DB connection utilization</benefit>
  <roi>12x return in year 1 (R1,500 cost, R18,000 annual savings)</roi>
  <payback_period>3 weeks</payback_period>
</business_case>

<context>
GAP Q001: Invoice listing controller fetches parent and child data in loops,
causing N+1 query patterns that scale poorly with data size.

Current State (invoice.controller.ts:148-167):
```typescript
// ANTI-PATTERN: N+1 queries
for (const parentId of parentIds) {
  const parent = await this.parentRepo.findById(parentId, tenantId);
}
// 20 invoices = 1 (list) + 20 (parents) + 20 (children) = 41 queries
```

Performance Profile:
- Query count: 2N+1 where N = number of invoices
- Per-query latency: ~5ms
- Total overhead: 205ms for 20 invoices
- Connection pool pressure: High during batch operations
</context>

<input_context_files>
  <file purpose="invoice_controller">apps/api/src/api/billing/invoice.controller.ts</file>
  <file purpose="invoice_service">apps/api/src/database/services/invoice.service.ts</file>
  <file purpose="parent_repository">apps/api/src/database/repositories/parent.repository.ts</file>
  <file purpose="child_repository">apps/api/src/database/repositories/child.repository.ts</file>
  <file purpose="usacf_gap_analysis">docs/usacf-analysis/02-gap-analysis.md</file>
</input_context_files>

<scope>
  <in_scope>
    - Create findByIds methods in ParentRepository and ChildRepository
    - Refactor invoice.controller.ts:148-167 to use batch loading
    - Use Map for O(1) lookups after batch fetch
    - Add unit tests for new methods
    - Add performance benchmarks
    - Apply same pattern to other N+1 occurrences
  </in_scope>
  <out_of_scope>
    - Database schema changes
    - Caching layer (separate task)
    - GraphQL DataLoader (overkill for this use case)
    - Redis caching (Sprint 2)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/repositories/parent.repository.ts">
      async findByIds(ids: string[], tenantId: string): Promise&lt;Parent[]&gt;
    </signature>
    <signature file="apps/api/src/database/repositories/child.repository.ts">
      async findByIds(ids: string[], tenantId: string): Promise&lt;Child[]&gt;
      async findByParentIds(parentIds: string[], tenantId: string): Promise&lt;Child[]&gt;
    </signature>
    <signature file="apps/api/src/api/billing/invoice.controller.ts">
      // Refactored to use batch loading
      private async loadRelatedEntities(
        invoices: Invoice[],
        tenantId: string
      ): Promise&lt;InvoiceWithRelations[]&gt;
    </signature>
  </signatures>

  <constraints>
    - Maximum 5 queries per invoice listing request (regardless of count)
    - Use Prisma's IN clause for batch queries
    - Maintain tenant isolation (all queries must filter by tenantId)
    - No change to API response format
    - Backward compatible (same DTO output)
  </constraints>

  <verification>
    - Invoice listing completes in &lt;100ms (from 250ms baseline)
    - Query count reduced to 3-5 regardless of invoice count
    - All existing tests pass
    - New performance tests validate improvement
    - No memory leaks from large batch operations
  </verification>
</definition_of_done>

<implementation_approach>
  <step order="1">
    Create findByIds in ParentRepository:
    ```typescript
    async findByIds(ids: string[], tenantId: string): Promise<Parent[]> {
      if (ids.length === 0) return [];
      return this.prisma.parent.findMany({
        where: {
          id: { in: ids },
          tenantId,
        },
      });
    }
    ```
  </step>
  <step order="2">
    Create findByIds and findByParentIds in ChildRepository
  </step>
  <step order="3">
    Refactor invoice listing to batch load:
    ```typescript
    private async loadRelatedEntities(
      invoices: Invoice[],
      tenantId: string
    ): Promise<InvoiceWithRelations[]> {
      // Extract unique IDs
      const parentIds = [...new Set(invoices.map(i => i.parentId))];
      const childIds = [...new Set(invoices.map(i => i.childId))];

      // Batch fetch
      const [parents, children] = await Promise.all([
        this.parentRepo.findByIds(parentIds, tenantId),
        this.childRepo.findByIds(childIds, tenantId),
      ]);

      // Build lookup maps
      const parentMap = new Map(parents.map(p => [p.id, p]));
      const childMap = new Map(children.map(c => [c.id, c]));

      // Attach relations
      return invoices.map(invoice => ({
        ...invoice,
        parent: parentMap.get(invoice.parentId),
        child: childMap.get(invoice.childId),
      }));
    }
    ```
  </step>
  <step order="4">
    Apply same pattern to other N+1 locations identified in codebase
  </step>
  <step order="5">
    Add performance benchmark tests
  </step>
</implementation_approach>

<files_to_create>
  <file path="apps/api/src/database/repositories/__tests__/parent.repository.spec.ts">
    Tests for findByIds method
  </file>
  <file path="apps/api/src/database/repositories/__tests__/child.repository.spec.ts">
    Tests for findByIds and findByParentIds methods
  </file>
  <file path="apps/api/tests/performance/invoice-listing.perf.ts">
    Performance benchmark for invoice listing
  </file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/repositories/parent.repository.ts">
    Add findByIds method
  </file>
  <file path="apps/api/src/database/repositories/child.repository.ts">
    Add findByIds and findByParentIds methods
  </file>
  <file path="apps/api/src/api/billing/invoice.controller.ts">
    Refactor to use batch loading (lines 148-167)
  </file>
  <file path="apps/api/src/database/services/invoice.service.ts">
    Update service layer if needed
  </file>
</files_to_modify>

<validation_criteria>
  <criterion>Invoice listing with 20 invoices completes in &lt;100ms</criterion>
  <criterion>Query count is constant regardless of invoice count</criterion>
  <criterion>Memory usage stable during batch operations</criterion>
  <criterion>All existing invoice tests pass</criterion>
  <criterion>No regression in API response format</criterion>
  <criterion>ESLint passes with no warnings</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test -- --testPathPattern="parent.repository" --verbose</command>
  <command>npm run test -- --testPathPattern="child.repository" --verbose</command>
  <command>npm run test -- --testPathPattern="invoice" --verbose</command>
  <command>npm run test:perf -- invoice-listing</command>
</test_commands>

<success_metrics>
  <metric name="latency_reduction">76% (250ms → 60ms)</metric>
  <metric name="query_reduction">95% (41 queries → 3 queries)</metric>
  <metric name="test_coverage">90%+ on changed code</metric>
</success_metrics>

<rollback_plan>
  - Feature flag: BATCH_LOADING_ENABLED (default: true)
  - Fallback to sequential loading if flag disabled
  - No database changes required for rollback
</rollback_plan>

</task_spec>
