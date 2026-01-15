<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-DATA-005</task_id>
    <title>Add AuditLog Action Index</title>
    <priority>MEDIUM</priority>
    <category>Database</category>
    <estimated_effort>1 hour</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>16-remediation</phase>
    <status>DONE</status>
    <tags>database-index, performance, audit-log, prisma</tags>
  </metadata>

  <context>
    <background>
      The AuditLog table is frequently queried by action type for compliance reporting,
      security investigations, and analytics. Currently, the action column lacks an index,
      causing full table scans on queries filtered by action.
    </background>
    <problem_statement>
      MEDIUM PERFORMANCE ISSUE: Missing index on AuditLog.action column causes slow
      queries when filtering audit logs by action type. As the audit log grows,
      these queries will become progressively slower.
    </problem_statement>
    <business_impact>
      - Slow compliance report generation
      - Delayed security incident investigations
      - Dashboard loading times degraded
      - Database resource waste on full table scans
      - Scalability issues as audit log grows
    </business_impact>
  </context>

  <scope>
    <in_scope>
      <item>Adding index on AuditLog.action column</item>
      <item>Creating and running Prisma migration</item>
      <item>Verifying index creation in database</item>
    </in_scope>
    <out_of_scope>
      <item>Other AuditLog indexes (separate analysis needed)</item>
      <item>Composite indexes with action + other columns</item>
      <item>AuditLog partitioning strategies</item>
      <item>Query optimization beyond index addition</item>
    </out_of_scope>
    <affected_files>
      <file>packages/types/prisma/schema.prisma</file>
    </affected_files>
  </scope>

  <implementation>
    <approach>
      Add @@index directive to AuditLog model in Prisma schema, then generate
      and run migration. This is a non-breaking change that improves read
      performance without affecting writes significantly.
    </approach>
    <steps>
      <step order="1">
        <description>Review current AuditLog model schema</description>
        <details>
          Examine the current AuditLog model to understand existing indexes
          and the action field definition.
        </details>
      </step>
      <step order="2">
        <description>Add @@index directive for action column</description>
        <details>
          Add @@index([action]) to the AuditLog model in schema.prisma.
          Consider naming the index for clarity.
        </details>
      </step>
      <step order="3">
        <description>Generate Prisma migration</description>
        <details>
          Run: npx prisma migrate dev --name add_audit_log_action_index
          Review generated SQL to confirm index creation.
        </details>
      </step>
      <step order="4">
        <description>Test migration on development database</description>
        <details>
          Verify migration runs successfully and index is created.
          Check index is being used with EXPLAIN ANALYZE.
        </details>
      </step>
      <step order="5">
        <description>Document migration for production deployment</description>
        <details>
          Add migration notes for production deployment including
          expected downtime (minimal) and rollback procedure.
        </details>
      </step>
    </steps>
    <code_examples>
      <example name="Schema Update">
        <before><![CDATA[
model AuditLog {
  id          String   @id @default(uuid())
  action      String
  entityType  String
  entityId    String
  tenantId    String
  userId      String
  previousData Json?
  newData     Json?
  metadata    Json?
  createdAt   DateTime @default(now())

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  user        User     @relation(fields: [userId], references: [id])

  @@index([tenantId])
  @@index([entityType, entityId])
  @@index([createdAt])
}
        ]]></before>
        <after><![CDATA[
model AuditLog {
  id          String   @id @default(uuid())
  action      String
  entityType  String
  entityId    String
  tenantId    String
  userId      String
  previousData Json?
  newData     Json?
  metadata    Json?
  createdAt   DateTime @default(now())

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  user        User     @relation(fields: [userId], references: [id])

  @@index([tenantId])
  @@index([entityType, entityId])
  @@index([createdAt])
  @@index([action])
}
        ]]></after>
      </example>
      <example name="Migration Command">
        <code><![CDATA[
# Generate migration
npx prisma migrate dev --name add_audit_log_action_index

# Expected migration SQL:
-- CreateIndex
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
        ]]></code>
      </example>
      <example name="Verify Index Usage">
        <code><![CDATA[
-- Before index (full table scan)
EXPLAIN ANALYZE SELECT * FROM "AuditLog" WHERE action = 'DELETE';
-- Seq Scan on AuditLog (cost=... rows=...)

-- After index (index scan)
EXPLAIN ANALYZE SELECT * FROM "AuditLog" WHERE action = 'DELETE';
-- Index Scan using AuditLog_action_idx on AuditLog (cost=... rows=...)
        ]]></code>
      </example>
      <example name="Common Queries Benefiting">
        <code><![CDATA[
// These queries will benefit from the index:

// Get all delete actions for compliance
const deletions = await prisma.auditLog.findMany({
  where: { action: 'DELETE' },
  orderBy: { createdAt: 'desc' },
});

// Count actions by type for dashboard
const actionCounts = await prisma.auditLog.groupBy({
  by: ['action'],
  _count: true,
});

// Get recent creates for activity feed
const recentCreates = await prisma.auditLog.findMany({
  where: { action: 'CREATE' },
  take: 50,
  orderBy: { createdAt: 'desc' },
});
        ]]></code>
      </example>
    </code_examples>
  </implementation>

  <verification>
    <test_cases>
      <test_case id="TC-001">
        <description>Verify migration runs successfully</description>
        <input>Run prisma migrate dev</input>
        <expected_output>Migration completes without errors</expected_output>
      </test_case>
      <test_case id="TC-002">
        <description>Verify index exists in database</description>
        <input>Query database schema for indexes</input>
        <expected_output>AuditLog_action_idx exists on action column</expected_output>
      </test_case>
      <test_case id="TC-003">
        <description>Verify index is used in queries</description>
        <input>EXPLAIN ANALYZE on action filter query</input>
        <expected_output>Index Scan instead of Seq Scan</expected_output>
      </test_case>
      <test_case id="TC-004">
        <description>Verify query performance improvement</description>
        <input>Benchmark action filter query before/after</input>
        <expected_output>Significant reduction in query time</expected_output>
      </test_case>
    </test_cases>
    <rollback_procedure>
      <step>Run: npx prisma migrate resolve --rolled-back add_audit_log_action_index</step>
      <step>Or manually: DROP INDEX "AuditLog_action_idx";</step>
    </rollback_procedure>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>@@index([action]) added to AuditLog model</criterion>
      <criterion>Prisma migration generated successfully</criterion>
      <criterion>Migration tested on development database</criterion>
      <criterion>Index verified to exist in database</criterion>
      <criterion>Query plans show index is being used</criterion>
      <criterion>Migration documented for production deployment</criterion>
      <criterion>Rollback procedure documented and tested</criterion>
    </criteria>
    <reviewers>
      <reviewer role="DBA">Recommended</reviewer>
      <reviewer role="Tech Lead">Required</reviewer>
    </reviewers>
  </definition_of_done>

  <references>
    <reference type="documentation">Prisma Schema Reference - @@index</reference>
    <reference type="performance">PostgreSQL Index Types and Usage</reference>
    <reference type="internal">Database Migration Procedures</reference>
  </references>
</task_specification>
