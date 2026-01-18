<task_spec id="TASK-WEB-001" version="2.0">

<metadata>
  <title>Staff Detail Page SimplePay Integration Enhancement</title>
  <status>ready</status>
  <layer>frontend</layer>
  <sequence>200</sequence>
  <implements>
    <requirement_ref>REQ-STAFF-SIMPLEPAY-UI-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-SPAY-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-01-17</last_updated>
</metadata>

<project_state>
  ## Current State

  **Files to Modify:**
  - `apps/web/src/app/(dashboard)/staff/[id]/page.tsx`

  **Files to Create:**
  - `apps/web/src/components/staff/SimplepayStatusCard.tsx` (NEW)

  **Current Problem:**
  The staff detail page does not show SimplePay integration status. The API has endpoints for:
  1. Employee sync status (GET /integrations/simplepay/employees/:staffId/status)
  2. Sync employee (POST /integrations/simplepay/employees/:staffId/sync)
  3. Compare employee data (GET /integrations/simplepay/employees/:staffId/compare)

  The frontend hooks exist in use-simplepay.ts but are NOT used in the staff detail page.

  **Existing Hooks Available:**
  - useEmployeeSyncStatus(staffId) - Returns sync status
  - useSyncEmployee() - Mutation to sync employee
  - useCompareEmployee(staffId) - Compare local vs SimplePay data
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use pnpm NOT npm. All commands: pnpm run build, pnpm test, etc.

  ### 2. SimplepayStatusCard Component
  Create apps/web/src/components/staff/SimplepayStatusCard.tsx using:
  - useEmployeeSyncStatus hook for data
  - useSyncEmployee mutation for sync button
  - Badge component for status display
  - Card component from shadcn/ui

  ### 3. Integration
  Import and add SimplepayStatusCard to staff/[id]/page.tsx
</critical_patterns>

<scope>
  <in_scope>
    - Create SimplepayStatusCard component
    - Integrate into staff detail page
    - Show sync status with badges
    - Add manual sync button
    - Handle loading/error states
  </in_scope>
  <out_of_scope>
    - SimplePay connection setup
    - Bulk sync operations
    - Detailed comparison view
  </out_of_scope>
</scope>

<definition_of_done>
  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors
    - SimplepayStatusCard renders correctly
    - Sync button triggers mutation
    - Status badge shows correct state
  </verification>
</definition_of_done>

</task_spec>
