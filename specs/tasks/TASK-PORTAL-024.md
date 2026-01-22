<task_spec id="TASK-PORTAL-024" version="1.0">

<metadata>
  <title>Staff Portal Leave Management Page</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>313</sequence>
  <implements>
    <requirement_ref>REQ-PORTAL-STAFF-04</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PORTAL-021</task_ref>
    <task_ref>TASK-SPAY-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
Create the staff portal leave management page where staff can view leave balances, submit leave requests, and view leave history. This integrates with SimplePay's leave management API (TASK-SPAY-001) and follows BCEA leave entitlements.
</context>

<input_context_files>
  <file purpose="portal_layout">apps/web/src/app/(staff-portal)/layout.tsx</file>
  <file purpose="leave_service">apps/api/src/database/services/simplepay/leave.service.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-PORTAL-021 completed (staff auth and layout)</check>
  <check>TASK-SPAY-001 completed (SimplePay leave management)</check>
</prerequisites>

<scope>
  <in_scope>
    - Leave balances display (annual, sick, family)
    - Leave request submission form
    - Leave type selection
    - Date picker for leave period
    - Leave history/requests list
    - Request status tracking (pending, approved, rejected)
    - Leave policy display (BCEA entitlements)
    - Calendar view of scheduled leave
    - Request cancellation (if pending)
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(staff-portal)/leave/page.tsx">
      export default function StaffLeavePage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(staff-portal)/leave/page.tsx">Leave management page</file>
  <file path="apps/web/src/components/staff-portal/leave-balance-display.tsx">Leave balances</file>
  <file path="apps/web/src/components/staff-portal/leave-request-form.tsx">Leave request form</file>
  <file path="apps/web/src/components/staff-portal/leave-history.tsx">Leave history list</file>
  <file path="apps/web/src/components/staff-portal/leave-calendar.tsx">Calendar view</file>
  <file path="apps/web/src/components/staff-portal/leave-policy.tsx">Policy display</file>
  <file path="apps/web/src/hooks/staff-portal/use-staff-leave.ts">React Query hooks</file>
</files_to_create>

<api_endpoints>
  <endpoint method="GET" path="/api/staff-portal/leave/balances">
    <description>Get leave balances for authenticated staff</description>
    <response>Annual, sick, family leave balances from SimplePay</response>
  </endpoint>
  <endpoint method="GET" path="/api/staff-portal/leave/requests">
    <description>Get leave request history</description>
    <query_params>year, status, page, limit</query_params>
    <response>Paginated leave requests</response>
  </endpoint>
  <endpoint method="POST" path="/api/staff-portal/leave/requests">
    <description>Submit new leave request</description>
    <body>leaveType, startDate, endDate, reason</body>
    <response>Created leave request</response>
  </endpoint>
  <endpoint method="DELETE" path="/api/staff-portal/leave/requests/:id">
    <description>Cancel pending leave request</description>
    <response>Success confirmation</response>
  </endpoint>
</api_endpoints>

<bcea_entitlements>
  <leave_type name="annual">
    <entitlement>15 working days per year</entitlement>
    <accrual>1 day per 17 days worked</accrual>
  </leave_type>
  <leave_type name="sick">
    <entitlement>30 days over 3 year cycle</entitlement>
    <notes>First 6 months: 1 day per 26 days worked</notes>
  </leave_type>
  <leave_type name="family">
    <entitlement>3 days per year</entitlement>
    <notes>For birth, illness, or death of family member</notes>
  </leave_type>
</bcea_entitlements>

<validation_criteria>
  <criterion>Leave balances display from SimplePay</criterion>
  <criterion>Leave request form validates dates</criterion>
  <criterion>Cannot request more than available balance</criterion>
  <criterion>Request status updates correctly</criterion>
  <criterion>Calendar shows approved leave</criterion>
  <criterion>Pending requests can be cancelled</criterion>
</validation_criteria>

</task_spec>
