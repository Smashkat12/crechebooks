<task_spec id="TASK-PORTAL-015" version="1.0">

<metadata>
  <title>Parent Portal Payments Page</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>304</sequence>
  <implements>
    <requirement_ref>REQ-PORTAL-PARENT-05</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PORTAL-011</task_ref>
    <task_ref>TASK-PAY-031</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the parent portal payments page showing payment history and bank details for making payments. Parents can view all payments made, their allocation to invoices, and get the creche's bank details for EFT payments.
</context>

<input_context_files>
  <file purpose="portal_layout">apps/web/src/app/(parent-portal)/layout.tsx</file>
  <file purpose="payment_controller">apps/api/src/api/billing/payment.controller.ts</file>
  <file purpose="payment_service">apps/api/src/database/services/payment-allocation.service.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-PORTAL-011 completed (parent auth and layout)</check>
  <check>TASK-PAY-031 completed (payment API)</check>
</prerequisites>

<scope>
  <in_scope>
    - Payment history list
    - Payment detail view (invoice allocations)
    - Bank details display for EFT
    - Payment reference generator
    - Date filter for payments
    - Receipt download (if available)
    - Outstanding amount display
    - Payment instructions
    - Copy to clipboard for bank details
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(parent-portal)/payments/page.tsx">
      export default function ParentPaymentsPage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(parent-portal)/payments/page.tsx">Payments page</file>
  <file path="apps/web/src/components/parent-portal/payment-list.tsx">Payment history list</file>
  <file path="apps/web/src/components/parent-portal/payment-detail.tsx">Payment detail modal</file>
  <file path="apps/web/src/components/parent-portal/bank-details-card.tsx">Bank details display</file>
  <file path="apps/web/src/components/parent-portal/payment-reference.tsx">Reference generator</file>
  <file path="apps/web/src/hooks/parent-portal/use-parent-payments.ts">React Query hook</file>
</files_to_create>

<api_endpoints>
  <endpoint method="GET" path="/api/parent-portal/payments">
    <description>Get payments for authenticated parent</description>
    <query_params>startDate, endDate, page, limit</query_params>
    <response>Paginated list of payments</response>
  </endpoint>
  <endpoint method="GET" path="/api/parent-portal/payments/:id">
    <description>Get payment detail with allocations</description>
    <response>Payment with invoice allocations</response>
  </endpoint>
  <endpoint method="GET" path="/api/parent-portal/bank-details">
    <description>Get creche bank details for payment</description>
    <response>Bank name, account number, branch code, reference format</response>
  </endpoint>
</api_endpoints>

<bank_details_display>
  <field>Bank Name</field>
  <field>Account Holder</field>
  <field>Account Number</field>
  <field>Branch Code</field>
  <field>Account Type</field>
  <field>Reference (auto-generated)</field>
</bank_details_display>

<validation_criteria>
  <criterion>Payment list shows all transactions</criterion>
  <criterion>Payment detail shows allocations</criterion>
  <criterion>Bank details display correctly</criterion>
  <criterion>Reference format matches creche config</criterion>
  <criterion>Copy to clipboard works</criterion>
  <criterion>Outstanding amount accurate</criterion>
</validation_criteria>

</task_spec>
