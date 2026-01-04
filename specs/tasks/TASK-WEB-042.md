<task_spec id="TASK-WEB-042" version="1.0">

<metadata>
  <title>Invoice Send Button API Integration</title>
  <status>complete</status>
  <layer>surface</layer>
  <sequence>121</sequence>
  <priority>P0-BLOCKER</priority>
  <implements>
    <requirement_ref>REQ-WEB-06</requirement_ref>
    <critical_issue_ref>CRIT-006</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-BILL-013</task_ref>
    <task_ref status="PENDING">TASK-BILL-015</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use frontend integration thinking.
This task involves:
1. Replace TODO stub with real implementation
2. Create useSendInvoice hook
3. Delivery channel selection
4. Toast notifications
5. Status update after send
</reasoning_mode>

<context>
CRITICAL BUG: Invoice send button is a TODO stub that does nothing.

File: `apps/web/src/app/(dashboard)/invoices/page.tsx:23`

REQ-WEB-06 specifies: "Send invoices via email/WhatsApp."

This task connects the send button to the actual API endpoint.
</context>

<current_state>
## Codebase State
- handleSend is TODO stub
- POST /api/invoices/:id/send endpoint exists
- InvoiceDeliveryService exists
- No frontend integration

## What Exists
- Invoice list page
- Send button UI
- API endpoint ready
</current_state>

<input_context_files>
  <file purpose="page_to_fix">apps/web/src/app/(dashboard)/invoices/page.tsx</file>
  <file purpose="api_endpoint">apps/api/src/billing/invoice.controller.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Create useSendInvoice hook
    - Channel selection dialog (email/WhatsApp)
    - Loading state on button
    - Success toast with recipient
    - Error toast with reason
    - Update invoice status in UI
  </in_scope>
  <out_of_scope>
    - API endpoint changes
    - Email/WhatsApp service changes
    - Batch send functionality
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/hooks/useSendInvoice.ts">
      export function useSendInvoice() {
        return useMutation<SendResult, Error, SendInvoiceParams>({
          mutationFn: sendInvoice,
          onSuccess: (data) => {
            toast.success(`Invoice sent to ${data.recipient}`);
          },
          onError: (error) => {
            toast.error(`Failed to send: ${error.message}`);
          },
        });
      }

      interface SendInvoiceParams {
        invoiceId: string;
        channel: 'email' | 'whatsapp';
        recipients?: string[];
      }
    </signature>
    <signature file="apps/web/src/components/invoices/SendInvoiceDialog.tsx">
      export function SendInvoiceDialog({
        invoice,
        isOpen,
        onClose,
        onSend,
      }: SendInvoiceDialogProps): JSX.Element;
    </signature>
  </signatures>

  <constraints>
    - Use @tanstack/react-query mutation
    - Show channel selection before sending
    - Disable button during send
    - Optimistic UI update for status
    - Rollback on failure
    - Toast notifications required
  </constraints>

  <verification>
    - Send button triggers API call
    - Channel selection works
    - Loading state shows
    - Success toast appears
    - Error toast on failure
    - Invoice status updates
    - E2E test passes
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/hooks/useSendInvoice.ts">Send mutation hook</file>
  <file path="apps/web/src/components/invoices/SendInvoiceDialog.tsx">Channel selection</file>
</files_to_create>

<files_to_modify>
  <file path="apps/web/src/app/(dashboard)/invoices/page.tsx">Use hook, remove TODO</file>
</files_to_modify>

<validation_criteria>
  <criterion>Send button works</criterion>
  <criterion>Channel selection shows</criterion>
  <criterion>Loading state works</criterion>
  <criterion>Success toast shows</criterion>
  <criterion>Error toast shows</criterion>
  <criterion>Status updates</criterion>
  <criterion>E2E test passes</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build --filter=web</command>
  <command>npm run test --filter=web -- --testPathPattern="invoice" --verbose</command>
  <command>npm run e2e --filter=web -- --grep="send invoice"</command>
</test_commands>

</task_spec>
