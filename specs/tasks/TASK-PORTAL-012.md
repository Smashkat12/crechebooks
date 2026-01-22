<task_spec id="TASK-PORTAL-012" version="1.0">

<metadata>
  <title>Parent Portal Dashboard</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>301</sequence>
  <implements>
    <requirement_ref>REQ-PORTAL-PARENT-02</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PORTAL-011</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the parent portal dashboard that provides an at-a-glance view of the parent's account status. This includes current balance, recent invoices, enrolled children, and quick actions for common tasks.
</context>

<input_context_files>
  <file purpose="portal_layout">apps/web/src/app/(parent-portal)/layout.tsx</file>
  <file purpose="parent_api">apps/api/src/api/parents/parent.controller.ts</file>
  <file purpose="invoice_api">apps/api/src/api/billing/invoice.controller.ts</file>
  <file purpose="dashboard_pattern">apps/web/src/app/(dashboard)/page.tsx</file>
</input_context_files>

<prerequisites>
  <check>TASK-PORTAL-011 completed (parent auth and layout)</check>
</prerequisites>

<scope>
  <in_scope>
    - Dashboard page showing account overview
    - Current account balance card (outstanding amount)
    - Recent invoices list (last 5)
    - Enrolled children summary
    - Quick action buttons (view invoices, make payment, view statements)
    - Notification area for arrears alerts
    - Next payment due date display
    - Parent API endpoint for dashboard data aggregation
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(parent-portal)/dashboard/page.tsx">
      export default function ParentDashboardPage()
    </signature>
    <signature file="apps/api/src/api/parents/parent-portal.controller.ts">
      export class ParentPortalController
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(parent-portal)/dashboard/page.tsx">Parent dashboard page</file>
  <file path="apps/web/src/components/parent-portal/balance-card.tsx">Account balance display</file>
  <file path="apps/web/src/components/parent-portal/recent-invoices.tsx">Recent invoices list</file>
  <file path="apps/web/src/components/parent-portal/children-summary.tsx">Children enrollment summary</file>
  <file path="apps/web/src/components/parent-portal/quick-actions.tsx">Quick action buttons</file>
  <file path="apps/web/src/components/parent-portal/arrears-alert.tsx">Arrears notification banner</file>
  <file path="apps/api/src/api/parents/parent-portal.controller.ts">Parent portal API controller</file>
  <file path="apps/api/src/api/parents/dto/parent-dashboard.dto.ts">Dashboard response DTO</file>
</files_to_create>

<api_endpoints>
  <endpoint method="GET" path="/api/parent-portal/dashboard">
    <description>Get aggregated dashboard data for authenticated parent</description>
    <response>
      <field>currentBalance: number</field>
      <field>recentInvoices: Invoice[]</field>
      <field>children: Child[]</field>
      <field>nextPaymentDue: { date: Date, amount: number }</field>
      <field>hasArrears: boolean</field>
      <field>daysOverdue: number | null</field>
    </response>
  </endpoint>
</api_endpoints>

<validation_criteria>
  <criterion>Dashboard loads within 1 second</criterion>
  <criterion>Balance shows correct outstanding amount</criterion>
  <criterion>Recent invoices display with status</criterion>
  <criterion>Children list shows enrollment status</criterion>
  <criterion>Arrears banner shows when applicable</criterion>
  <criterion>Quick actions navigate correctly</criterion>
</validation_criteria>

</task_spec>
