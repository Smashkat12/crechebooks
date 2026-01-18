<task_spec id="TASK-WEB-002" version="2.0">

<metadata>
  <title>Leave Balance and Application UI</title>
  <status>ready</status>
  <layer>frontend</layer>
  <sequence>201</sequence>
  <implements>
    <requirement_ref>REQ-LEAVE-UI-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-WEB-005</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-01-17</last_updated>
</metadata>

<project_state>
  ## Current State

  **Files to Create:**
  - apps/web/src/components/staff/LeaveBalanceCard.tsx (NEW)
  - apps/web/src/components/staff/LeaveRequestDialog.tsx (NEW)

  **Files to Modify:**
  - apps/web/src/app/(dashboard)/staff/[id]/page.tsx

  **Current Problem:**
  Backend has comprehensive leave management in simplepay-leave.service.ts but NO API controller exposes these endpoints, and NO UI displays or requests leave.

  **Dependency:**
  This task depends on TASK-WEB-005 which creates the leave API endpoints and frontend hooks.
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Package Manager
  Use pnpm NOT npm.

  ### 2. LeaveBalanceCard Component
  - Display leave types with progress bars
  - Show used/entitled/remaining days
  - Request Leave button opens dialog
  - Use hooks from use-leave.ts (TASK-WEB-005)

  ### 3. LeaveRequestDialog Component
  - Form with leave type selector
  - Date pickers for start/end dates
  - Optional reason field
  - Zod validation
  - Submit creates leave request
</critical_patterns>

<scope>
  <in_scope>
    - Create LeaveBalanceCard component
    - Create LeaveRequestDialog component
    - Form validation with zod
    - Date picker integration
    - Loading/success/error states
  </in_scope>
  <out_of_scope>
    - Leave approval workflow UI
    - Leave calendar view
    - Team leave overview
  </out_of_scope>
</scope>

<definition_of_done>
  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors
    - LeaveBalanceCard displays balances
    - Progress bars calculate correctly
    - LeaveRequestDialog validates inputs
    - Leave request creation works
  </verification>
</definition_of_done>

</task_spec>
