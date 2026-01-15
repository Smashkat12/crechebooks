<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-DATA-004</task_id>
    <title>Add Pagination to findByTenant Queries</title>
    <priority>HIGH</priority>
    <category>Performance</category>
    <estimated_effort>3 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>16-remediation</phase>
    <status>DONE</status>
    <tags>pagination, performance, n+1-query, memory-optimization</tags>
  </metadata>

  <context>
    <background>
      The findByTenant method in Parent repository (and potentially other repositories)
      returns all records without pagination. This creates N+1 query potential when
      including relations and can cause memory issues for tenants with large datasets.
    </background>
    <problem_statement>
      HIGH PERFORMANCE ISSUE: findByTenant methods load entire collections into memory
      without pagination. For tenants with thousands of records, this causes:
      - Memory exhaustion on API servers
      - Slow response times
      - Database connection timeouts
      - Poor user experience with large lists
    </problem_statement>
    <business_impact>
      - API server crashes for large tenants
      - Degraded performance for all users
      - Increased infrastructure costs
      - Customer complaints about slow loading
      - Scalability limitations
    </business_impact>
  </context>

  <scope>
    <in_scope>
      <item>Parent repository findByTenant method</item>
      <item>Adding limit/offset pagination parameters</item>
      <item>Adding total count for pagination UI</item>
      <item>Updating API endpoints to accept pagination params</item>
      <item>Adding tests for pagination behavior</item>
    </in_scope>
    <out_of_scope>
      <item>Cursor-based pagination (future enhancement)</item>
      <item>GraphQL pagination connections</item>
      <item>Other repository findByTenant methods (separate tasks)</item>
      <item>Frontend pagination UI changes</item>
    </out_of_scope>
    <affected_files>
      <file>apps/api/src/repositories/parent.repository.ts</file>
      <file>apps/api/src/services/parent.service.ts</file>
      <file>apps/api/src/controllers/parent.controller.ts</file>
      <file>packages/types/src/pagination.ts (new or existing)</file>
    </affected_files>
  </scope>

  <implementation>
    <approach>
      Add offset-based pagination with configurable limit and page parameters.
      Return paginated response with items, total count, and pagination metadata.
      Use sensible defaults and maximum limits to prevent abuse.
    </approach>
    <steps>
      <step order="1">
        <description>Define pagination types and interfaces</description>
        <details>
          Create or update pagination types for consistent use across the codebase:
          - PaginationParams (limit, offset/page)
          - PaginatedResponse (items, total, pagination metadata)
        </details>
      </step>
      <step order="2">
        <description>Update Parent repository findByTenant method</description>
        <details>
          Modify method to accept pagination parameters and return paginated result.
          Use Prisma's take/skip for pagination and count for total.
        </details>
      </step>
      <step order="3">
        <description>Update Parent service layer</description>
        <details>
          Pass pagination parameters through service layer and handle
          default values.
        </details>
      </step>
      <step order="4">
        <description>Update API endpoint</description>
        <details>
          Accept query parameters for pagination (page, limit) and
          validate inputs. Apply sensible defaults and maximum limits.
        </details>
      </step>
      <step order="5">
        <description>Add pagination tests</description>
        <details>
          Test pagination behavior including edge cases like empty results,
          last page, and invalid parameters.
        </details>
      </step>
    </steps>
    <code_examples>
      <example name="Pagination Types">
        <code><![CDATA[
// packages/types/src/pagination.ts
export interface PaginationParams {
  page?: number;      // 1-based page number
  limit?: number;     // Items per page (default: 20, max: 100)
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
        ]]></code>
      </example>
      <example name="Repository Method Update">
        <before><![CDATA[
async findByTenant(tenantId: string): Promise<Parent[]> {
  return this.prisma.parent.findMany({
    where: { tenantId },
    include: { children: true },
  });
}
        ]]></before>
        <after><![CDATA[
async findByTenant(
  tenantId: string,
  pagination: PaginationParams = {},
): Promise<PaginatedResponse<Parent>> {
  const page = pagination.page ?? DEFAULT_PAGE;
  const limit = Math.min(pagination.limit ?? DEFAULT_LIMIT, MAX_LIMIT);
  const skip = (page - 1) * limit;

  // Execute count and find in parallel
  const [total, items] = await Promise.all([
    this.prisma.parent.count({
      where: { tenantId },
    }),
    this.prisma.parent.findMany({
      where: { tenantId },
      include: { children: true },
      skip,
      take: limit,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const totalPages = Math.ceil(total / limit);

  return {
    items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}
        ]]></after>
      </example>
      <example name="Controller Update">
        <before><![CDATA[
@Get()
async getParents(@Query('tenantId') tenantId: string) {
  return this.parentService.findByTenant(tenantId);
}
        ]]></before>
        <after><![CDATA[
@Get()
async getParents(
  @Query('tenantId') tenantId: string,
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
) {
  return this.parentService.findByTenant(tenantId, { page, limit });
}
        ]]></after>
      </example>
      <example name="API Response Format">
        <code><![CDATA[
// Example API response
{
  "items": [
    { "id": "...", "name": "Parent 1", "children": [...] },
    { "id": "...", "name": "Parent 2", "children": [...] }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "totalPages": 8,
    "hasNext": true,
    "hasPrev": false
  }
}
        ]]></code>
      </example>
    </code_examples>
  </implementation>

  <verification>
    <test_cases>
      <test_case id="TC-001">
        <description>Verify default pagination applied</description>
        <input>Call without pagination params</input>
        <expected_output>Returns page 1 with 20 items max</expected_output>
      </test_case>
      <test_case id="TC-002">
        <description>Verify custom pagination works</description>
        <input>page=2, limit=10</input>
        <expected_output>Returns items 11-20 with correct metadata</expected_output>
      </test_case>
      <test_case id="TC-003">
        <description>Verify max limit enforced</description>
        <input>limit=500</input>
        <expected_output>Returns max 100 items (MAX_LIMIT)</expected_output>
      </test_case>
      <test_case id="TC-004">
        <description>Verify empty results handled</description>
        <input>Tenant with no parents</input>
        <expected_output>Returns empty items array with total=0</expected_output>
      </test_case>
      <test_case id="TC-005">
        <description>Verify total count accuracy</description>
        <input>Tenant with 150 parents, page=8</input>
        <expected_output>total=150, hasNext=false, hasPrev=true</expected_output>
      </test_case>
      <test_case id="TC-006">
        <description>Verify parallel query execution</description>
        <input>Large dataset query</input>
        <expected_output>Count and find execute in parallel (timing)</expected_output>
      </test_case>
    </test_cases>
    <performance_validation>
      <item>Memory usage stable regardless of total record count</item>
      <item>Response time consistent with pagination</item>
      <item>No N+1 queries in paginated results</item>
    </performance_validation>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>findByTenant accepts pagination parameters</criterion>
      <criterion>Response includes pagination metadata</criterion>
      <criterion>Default pagination applied when params omitted</criterion>
      <criterion>Maximum limit enforced to prevent abuse</criterion>
      <criterion>Total count returned for pagination UI</criterion>
      <criterion>API endpoint accepts page/limit query params</criterion>
      <criterion>Unit tests cover pagination edge cases</criterion>
      <criterion>Performance tests confirm memory usage is bounded</criterion>
      <criterion>API documentation updated with pagination params</criterion>
    </criteria>
    <reviewers>
      <reviewer role="Tech Lead">Required</reviewer>
      <reviewer role="Performance Engineer">Recommended</reviewer>
    </reviewers>
  </definition_of_done>

  <references>
    <reference type="performance">API Pagination Best Practices</reference>
    <reference type="internal">Prisma Pagination Documentation</reference>
    <reference type="design">REST API Design Guidelines</reference>
  </references>
</task_specification>
