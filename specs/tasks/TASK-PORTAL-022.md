<task_spec id="TASK-PORTAL-022" version="1.0">

<metadata>
  <title>Staff Portal Dashboard</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>311</sequence>
  <implements>
    <requirement_ref>REQ-PORTAL-STAFF-02</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PORTAL-021</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the staff portal dashboard providing an at-a-glance view of employment information, recent payslips, leave balance, and important announcements. This serves as the landing page after staff login.
</context>

<input_context_files>
  <file purpose="portal_layout">apps/web/src/app/(staff-portal)/layout.tsx</file>
  <file purpose="staff_api">apps/api/src/api/staff/staff.controller.ts</file>
  <file purpose="simplepay_service">apps/api/src/database/services/simplepay/simplepay.service.ts</file>
  <file purpose="leave_service">apps/api/src/database/services/simplepay/leave.service.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-PORTAL-021 completed (staff auth and layout)</check>
</prerequisites>

<scope>
  <in_scope>
    - Dashboard page with employment overview
    - Current employment status card
    - Recent payslips preview (last 3)
    - Leave balance summary
    - Next pay date display
    - Important announcements area
    - Quick action buttons
    - Year-to-date earnings summary
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(staff-portal)/dashboard/page.tsx">
      export default function StaffDashboardPage()
    </signature>
    <signature file="apps/api/src/api/staff/staff-portal.controller.ts">
      export class StaffPortalController
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(staff-portal)/dashboard/page.tsx">Staff dashboard page</file>
  <file path="apps/web/src/components/staff-portal/employment-card.tsx">Employment status display</file>
  <file path="apps/web/src/components/staff-portal/recent-payslips.tsx">Recent payslips preview</file>
  <file path="apps/web/src/components/staff-portal/leave-balance-card.tsx">Leave balance summary</file>
  <file path="apps/web/src/components/staff-portal/next-pay-card.tsx">Next pay date display</file>
  <file path="apps/web/src/components/staff-portal/announcements.tsx">Announcements area</file>
  <file path="apps/web/src/components/staff-portal/ytd-earnings.tsx">Year-to-date earnings</file>
  <file path="apps/api/src/api/staff/staff-portal.controller.ts">Staff portal API controller</file>
  <file path="apps/api/src/api/staff/dto/staff-dashboard.dto.ts">Dashboard response DTO</file>
</files_to_create>

<api_endpoints>
  <endpoint method="GET" path="/api/staff-portal/dashboard">
    <description>Get aggregated dashboard data for authenticated staff</description>
    <response>
      <field>employmentStatus: { position, department, startDate, status }</field>
      <field>recentPayslips: Payslip[] (from SimplePay)</field>
      <field>leaveBalance: { annual, sick, family }</field>
      <field>nextPayDate: Date</field>
      <field>ytdEarnings: { gross, net, tax }</field>
    </response>
  </endpoint>
</api_endpoints>

<validation_criteria>
  <criterion>Dashboard loads within 2 seconds</criterion>
  <criterion>SimplePay data fetches correctly</criterion>
  <criterion>Leave balance displays accurately</criterion>
  <criterion>Recent payslips show with dates</criterion>
  <criterion>YTD earnings calculate correctly</criterion>
  <criterion>Mobile responsive layout</criterion>
</validation_criteria>

</task_spec>
