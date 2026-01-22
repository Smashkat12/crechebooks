<task_spec id="TASK-PORTAL-023" version="1.0">

<metadata>
  <title>Staff Portal Payslips Page</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>312</sequence>
  <implements>
    <requirement_ref>REQ-PORTAL-STAFF-03</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PORTAL-021</task_ref>
    <task_ref>TASK-STAFF-004</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the staff portal payslips page where staff can view and download their payslips from SimplePay. This provides access to payslip history with filtering and PDF download capabilities.
</context>

<input_context_files>
  <file purpose="portal_layout">apps/web/src/app/(staff-portal)/layout.tsx</file>
  <file purpose="simplepay_service">apps/api/src/database/services/simplepay/simplepay.service.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-PORTAL-021 completed (staff auth and layout)</check>
  <check>TASK-STAFF-004 completed (SimplePay integration)</check>
</prerequisites>

<scope>
  <in_scope>
    - Payslips list page
    - Year/month filter
    - Payslip detail view with breakdown
    - PDF download from SimplePay
    - Earnings breakdown (basic, allowances, deductions)
    - Tax summary per payslip
    - Employer contributions display
    - Net pay highlighting
    - Mobile-responsive table/cards
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(staff-portal)/payslips/page.tsx">
      export default function StaffPayslipsPage()
    </signature>
    <signature file="apps/web/src/app/(staff-portal)/payslips/[id]/page.tsx">
      export default function PayslipDetailPage({ params }: { params: { id: string } })
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(staff-portal)/payslips/page.tsx">Payslips list page</file>
  <file path="apps/web/src/app/(staff-portal)/payslips/[id]/page.tsx">Payslip detail page</file>
  <file path="apps/web/src/components/staff-portal/payslip-list.tsx">Payslip list component</file>
  <file path="apps/web/src/components/staff-portal/payslip-card.tsx">Payslip card for mobile</file>
  <file path="apps/web/src/components/staff-portal/payslip-detail.tsx">Payslip detail breakdown</file>
  <file path="apps/web/src/components/staff-portal/earnings-table.tsx">Earnings breakdown table</file>
  <file path="apps/web/src/components/staff-portal/deductions-table.tsx">Deductions breakdown</file>
  <file path="apps/web/src/hooks/staff-portal/use-staff-payslips.ts">React Query hook</file>
</files_to_create>

<api_endpoints>
  <endpoint method="GET" path="/api/staff-portal/payslips">
    <description>Get payslips for authenticated staff</description>
    <query_params>year (optional), page, limit</query_params>
    <response>Paginated list of payslips from SimplePay</response>
  </endpoint>
  <endpoint method="GET" path="/api/staff-portal/payslips/:id">
    <description>Get payslip detail with full breakdown</description>
    <response>Payslip with earnings, deductions, contributions</response>
  </endpoint>
  <endpoint method="GET" path="/api/staff-portal/payslips/:id/pdf">
    <description>Download payslip PDF from SimplePay</description>
    <response>PDF file stream</response>
  </endpoint>
</api_endpoints>

<payslip_breakdown>
  <section name="earnings">
    <item>Basic Salary</item>
    <item>Overtime</item>
    <item>Allowances</item>
    <item>Bonuses</item>
  </section>
  <section name="deductions">
    <item>PAYE Tax</item>
    <item>UIF (Employee)</item>
    <item>Pension/Provident</item>
    <item>Medical Aid</item>
  </section>
  <section name="employer_contributions">
    <item>UIF (Employer)</item>
    <item>SDL</item>
    <item>Pension (Employer)</item>
  </section>
</payslip_breakdown>

<validation_criteria>
  <criterion>Payslips list loads from SimplePay</criterion>
  <criterion>Year filter works correctly</criterion>
  <criterion>Payslip detail shows all components</criterion>
  <criterion>PDF download works</criterion>
  <criterion>Net pay calculates correctly</criterion>
  <criterion>Mobile view uses cards</criterion>
</validation_criteria>

</task_spec>
