<task_spec id="TASK-PORTAL-013" version="1.0">

<metadata>
  <title>Parent Portal Invoices Page</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>302</sequence>
  <implements>
    <requirement_ref>REQ-PORTAL-PARENT-03</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-PORTAL-011</task_ref>
    <task_ref>TASK-BILL-031</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the parent portal invoices page where parents can view all their invoices, filter by status, and download PDF copies. This leverages existing invoice API endpoints with parent-specific access controls.
</context>

<input_context_files>
  <file purpose="portal_layout">apps/web/src/app/(parent-portal)/layout.tsx</file>
  <file purpose="invoice_controller">apps/api/src/api/billing/invoice.controller.ts</file>
  <file purpose="admin_invoices">apps/web/src/app/(dashboard)/invoices/page.tsx</file>
</input_context_files>

<prerequisites>
  <check>TASK-PORTAL-011 completed (parent auth and layout)</check>
  <check>TASK-BILL-031 completed (invoice API)</check>
</prerequisites>

<scope>
  <in_scope>
    - Invoices list page with filtering
    - Status filter (all, paid, pending, overdue)
    - Date range filter
    - Invoice detail modal/page
    - PDF download functionality
    - Invoice line items display
    - Payment history per invoice
    - Outstanding amount highlighting
    - Mobile-responsive table/cards
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(parent-portal)/invoices/page.tsx">
      export default function ParentInvoicesPage()
    </signature>
    <signature file="apps/web/src/app/(parent-portal)/invoices/[id]/page.tsx">
      export default function InvoiceDetailPage({ params }: { params: { id: string } })
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(parent-portal)/invoices/page.tsx">Invoices list page</file>
  <file path="apps/web/src/app/(parent-portal)/invoices/[id]/page.tsx">Invoice detail page</file>
  <file path="apps/web/src/components/parent-portal/invoice-list.tsx">Invoice list component</file>
  <file path="apps/web/src/components/parent-portal/invoice-card.tsx">Invoice card for mobile</file>
  <file path="apps/web/src/components/parent-portal/invoice-filters.tsx">Filter controls</file>
  <file path="apps/web/src/components/parent-portal/invoice-line-items.tsx">Line items display</file>
  <file path="apps/web/src/hooks/parent-portal/use-parent-invoices.ts">React Query hook</file>
</files_to_create>

<api_endpoints>
  <endpoint method="GET" path="/api/parent-portal/invoices">
    <description>Get invoices for authenticated parent</description>
    <query_params>status, startDate, endDate, page, limit</query_params>
    <response>Paginated list of invoices</response>
  </endpoint>
  <endpoint method="GET" path="/api/parent-portal/invoices/:id">
    <description>Get invoice detail with line items</description>
    <response>Invoice with lines and payments</response>
  </endpoint>
  <endpoint method="GET" path="/api/parent-portal/invoices/:id/pdf">
    <description>Download invoice PDF</description>
    <response>PDF file stream</response>
  </endpoint>
</api_endpoints>

<validation_criteria>
  <criterion>Invoice list loads with pagination</criterion>
  <criterion>Filters update list correctly</criterion>
  <criterion>Invoice detail shows all line items</criterion>
  <criterion>PDF download works</criterion>
  <criterion>Overdue invoices highlighted</criterion>
  <criterion>Mobile view uses cards instead of table</criterion>
</validation_criteria>

</task_spec>
