<task_spec id="TASK-WEB-016" version="1.0">

<metadata>
  <title>Reconciliation Components</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>16</sequence>
  <implements>
    <requirement_ref>REQ-WEB-07</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-003</task_ref>
    <task_ref>TASK-WEB-007</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create bank reconciliation components showing matched/unmatched transactions, discrepancies, and reconciliation status.
</context>

<input_context_files>
  <file purpose="recon_hooks">apps/web/src/hooks/use-reconciliation.ts</file>
  <file purpose="recon_types">packages/types/src/reconciliation.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-003 completed</check>
  <check>TASK-WEB-007 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Reconciliation summary card
    - Matched/unmatched transaction lists
    - Discrepancy details
    - Balance comparison view
    - Reconciliation history
  </in_scope>
  <out_of_scope>
    - Reconciliation page layout (TASK-WEB-036)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/reconciliation/reconciliation-summary.tsx">
      export function ReconciliationSummary({ data }: { data: IReconciliation }): JSX.Element
    </signature>
    <signature file="apps/web/src/components/reconciliation/discrepancy-list.tsx">
      export function DiscrepancyList({ items }: { items: IReconciliationItem[] }): JSX.Element
    </signature>
  </signatures>

  <constraints>
    - Must show balance comparison clearly
    - Must highlight discrepancies
    - Must show reconciliation status
  </constraints>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/reconciliation/reconciliation-summary.tsx">Summary card</file>
  <file path="apps/web/src/components/reconciliation/transaction-match-table.tsx">Matched transactions</file>
  <file path="apps/web/src/components/reconciliation/discrepancy-list.tsx">Discrepancy list</file>
  <file path="apps/web/src/components/reconciliation/balance-comparison.tsx">Balance comparison</file>
  <file path="apps/web/src/components/reconciliation/reconciliation-history.tsx">History</file>
  <file path="apps/web/src/components/reconciliation/index.ts">Reconciliation exports</file>
</files_to_create>

<validation_criteria>
  <criterion>Summary shows balances</criterion>
  <criterion>Discrepancies are highlighted</criterion>
  <criterion>History shows past reconciliations</criterion>
</validation_criteria>

</task_spec>
