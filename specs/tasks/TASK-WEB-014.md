<task_spec id="TASK-WEB-014" version="1.0">

<metadata>
  <title>Arrears Dashboard Components</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>14</sequence>
  <implements>
    <requirement_ref>REQ-WEB-08</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-003</task_ref>
    <task_ref>TASK-WEB-007</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create arrears management components showing outstanding balances, aging analysis, and reminder sending functionality. Helps creche owners follow up on late payments.
</context>

<input_context_files>
  <file purpose="payment_hooks">apps/web/src/hooks/use-payments.ts</file>
  <file purpose="payment_types">packages/types/src/payments.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-003 completed</check>
  <check>TASK-WEB-007 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Arrears list with aging bands (30/60/90+ days)
    - Parent detail with outstanding invoices
    - Send reminder dialog
    - Payment history view
    - Arrears summary stats
  </in_scope>
  <out_of_scope>
    - Arrears page layout (TASK-WEB-034)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/arrears/arrears-table.tsx">
      export function ArrearsTable({ data, onSendReminder }: ArrearsTableProps): JSX.Element
    </signature>
    <signature file="apps/web/src/components/arrears/send-reminder-dialog.tsx">
      export function SendReminderDialog({ parent, onSend }: SendReminderDialogProps): JSX.Element
    </signature>
  </signatures>

  <constraints>
    - Must show aging bands with color coding
    - Must show last reminder date
    - Must support bulk reminders
  </constraints>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/arrears/arrears-table.tsx">Arrears DataTable</file>
  <file path="apps/web/src/components/arrears/arrears-columns.tsx">Column definitions</file>
  <file path="apps/web/src/components/arrears/aging-badge.tsx">Aging band badge</file>
  <file path="apps/web/src/components/arrears/parent-detail-sheet.tsx">Parent detail sheet</file>
  <file path="apps/web/src/components/arrears/send-reminder-dialog.tsx">Reminder dialog</file>
  <file path="apps/web/src/components/arrears/arrears-summary.tsx">Summary stats</file>
  <file path="apps/web/src/components/arrears/index.ts">Arrears component exports</file>
</files_to_create>

<validation_criteria>
  <criterion>Arrears table shows aging bands</criterion>
  <criterion>Parent detail shows invoices</criterion>
  <criterion>Reminder dialog confirms before sending</criterion>
</validation_criteria>

</task_spec>
