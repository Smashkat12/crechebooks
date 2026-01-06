<task_spec id="TASK-E2E-001" version="1.0">

<metadata>
  <title>E2E Bug Fixes - Critical Prisma Schema Mismatch</title>
  <status>pending</status>
  <layer>foundation</layer>
  <sequence>154</sequence>
  <priority>P0-BLOCKER</priority>
  <implements>
    <requirement_ref>EC-DATA-001</requirement_ref>
  </implements>
  <depends_on>
    <!-- No dependencies - critical fix -->
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
## Critical Bug Identified During E2E Testing
Date: 2026-01-06

During comprehensive Playwright E2E testing, the Parents and Invoices pages return 500 errors.

## Error Details
```
PrismaClientKnownRequestError: The column '(not available)' does not exist in the current database.
Location: apps/api/src/database/repositories/parent.repository.ts:84
Also affects: parent.repository.ts:129
```

## Root Cause
The Prisma schema includes columns that don't exist in the actual database. This is a schema synchronization issue.

## Impact
- **Parents page**: 500 error - completely broken
- **Invoices page**: 500 error - completely broken
- **Any feature using parent data**: Broken

## Pages Affected
- /parents (list view)
- /parents/[id] (detail view)
- /parents/new (create form)
- /invoices (list view)
- Any page querying parent data

</context>

<input_context_files>
  <file purpose="error_source">apps/api/src/database/repositories/parent.repository.ts</file>
  <file purpose="schema">apps/api/prisma/schema.prisma</file>
</input_context_files>

<prerequisites>
  <check>Database server running</check>
  <check>Access to run prisma commands</check>
</prerequisites>

<scope>
  <in_scope>
    - Identify missing columns in database vs Prisma schema
    - Run prisma db push or prisma migrate to sync schema
    - Verify Parents and Invoices pages work after fix
  </in_scope>
  <out_of_scope>
    - Refactoring repository code
    - Adding new features
  </out_of_scope>
</scope>

<definition_of_done>
  <constraints>
    - Database schema matches Prisma schema
    - No 500 errors on Parents page
    - No 500 errors on Invoices page
    - Parent CRUD operations work
  </constraints>

  <verification>
    - Navigate to /parents - should load without error
    - Navigate to /invoices - should load without error
    - Create a new parent - should succeed
    - API tests pass
  </verification>
</definition_of_done>

<fix_steps>
1. Run `npx prisma db push` to sync schema with database
2. If that fails, run `npx prisma migrate dev --name fix_parent_schema`
3. Restart the API server
4. Verify Parents and Invoices pages load
</fix_steps>

<test_commands>
  <command>cd apps/api && npx prisma db push</command>
  <command>npm run dev:api</command>
  <command>curl http://localhost:3001/api/v1/parents</command>
</test_commands>

</task_spec>
