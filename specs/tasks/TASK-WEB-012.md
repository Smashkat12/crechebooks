<task_spec id="TASK-WEB-012" version="1.0">

<metadata>
  <title>Invoice List and Generation Components</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>12</sequence>
  <implements>
    <requirement_ref>REQ-WEB-05</requirement_ref>
    <requirement_ref>REQ-WEB-06</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-003</task_ref>
    <task_ref>TASK-WEB-007</task_ref>
    <task_ref>TASK-WEB-008</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
Create invoice management components including the invoice list, generation wizard, preview, and delivery actions. Supports monthly batch generation and individual invoice creation.
</context>

<input_context_files>
  <file purpose="data_table">apps/web/src/components/tables/data-table.tsx</file>
  <file purpose="invoice_hooks">apps/web/src/hooks/use-invoices.ts</file>
  <file purpose="invoice_types">packages/types/src/billing.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-003 completed</check>
  <check>TASK-WEB-007 completed</check>
  <check>TASK-WEB-008 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Invoice list table with status badges
    - Generate invoices wizard (month selection, preview)
    - Invoice preview component
    - Invoice line items display
    - Send invoice actions (email/WhatsApp)
    - Invoice status filters
  </in_scope>
  <out_of_scope>
    - Invoice page layout (TASK-WEB-032)
    - PDF generation
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/invoices/invoice-table.tsx">
      export function InvoiceTable({ data, isLoading, onSend }: InvoiceTableProps): JSX.Element
    </signature>
    <signature file="apps/web/src/components/invoices/generate-invoices-wizard.tsx">
      export function GenerateInvoicesWizard({ onComplete }: GenerateInvoicesWizardProps): JSX.Element
    </signature>
    <signature file="apps/web/src/components/invoices/invoice-preview.tsx">
      export function InvoicePreview({ invoice }: { invoice: IInvoice }): JSX.Element
    </signature>
  </signatures>

  <constraints>
    - Must show invoice totals with VAT breakdown
    - Must support batch sending
    - Must confirm before sending
  </constraints>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/invoices/invoice-table.tsx">Invoice DataTable</file>
  <file path="apps/web/src/components/invoices/invoice-columns.tsx">Column definitions</file>
  <file path="apps/web/src/components/invoices/invoice-filters.tsx">Filter toolbar</file>
  <file path="apps/web/src/components/invoices/generate-invoices-wizard.tsx">Generation wizard</file>
  <file path="apps/web/src/components/invoices/invoice-preview.tsx">Invoice preview</file>
  <file path="apps/web/src/components/invoices/invoice-line-items.tsx">Line items table</file>
  <file path="apps/web/src/components/invoices/send-invoice-dialog.tsx">Send confirmation</file>
  <file path="apps/web/src/components/invoices/invoice-status-badge.tsx">Status badge</file>
  <file path="apps/web/src/components/invoices/index.ts">Invoice component exports</file>
</files_to_create>

<validation_criteria>
  <criterion>Invoice table renders with status badges</criterion>
  <criterion>Generate wizard shows preview</criterion>
  <criterion>Invoice preview shows line items and totals</criterion>
  <criterion>Send action triggers confirmation</criterion>
</validation_criteria>

</task_spec>
