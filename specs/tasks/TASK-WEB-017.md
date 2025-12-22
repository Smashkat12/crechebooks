<task_spec id="TASK-WEB-017" version="1.0">

<metadata>
  <title>Dashboard Widgets and Metrics Components</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>17</sequence>
  <implements>
    <requirement_ref>REQ-WEB-01</requirement_ref>
    <requirement_ref>REQ-WEB-02</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-003</task_ref>
    <task_ref>TASK-WEB-009</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create dashboard widget components including metric cards, trend charts, and quick action widgets for the main dashboard view.
</context>

<input_context_files>
  <file purpose="chart_components">apps/web/src/components/charts/</file>
  <file purpose="api_hooks">apps/web/src/hooks/</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-003 completed</check>
  <check>TASK-WEB-009 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Metric cards (income, expenses, outstanding, balance)
    - Income vs expense trend chart
    - Top arrears widget
    - Recent transactions widget
    - Quick actions widget
    - Period selector (month/quarter/year)
  </in_scope>
  <out_of_scope>
    - Dashboard page layout (TASK-WEB-031)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/dashboard/metric-card.tsx">
      export function MetricCard({ title, value, change, icon }: MetricCardProps): JSX.Element
    </signature>
    <signature file="apps/web/src/components/dashboard/income-expense-chart.tsx">
      export function IncomeExpenseChart({ data }: { data: MonthlyData[] }): JSX.Element
    </signature>
  </signatures>

  <constraints>
    - Metric cards must show period-over-period change
    - Charts must be responsive
    - Quick actions must link to relevant pages
  </constraints>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/dashboard/metric-card.tsx">Metric card</file>
  <file path="apps/web/src/components/dashboard/income-expense-chart.tsx">Trend chart</file>
  <file path="apps/web/src/components/dashboard/top-arrears-widget.tsx">Arrears widget</file>
  <file path="apps/web/src/components/dashboard/recent-transactions.tsx">Recent transactions</file>
  <file path="apps/web/src/components/dashboard/quick-actions.tsx">Quick actions</file>
  <file path="apps/web/src/components/dashboard/period-selector.tsx">Period selector</file>
  <file path="apps/web/src/components/dashboard/index.ts">Dashboard exports</file>
</files_to_create>

<validation_criteria>
  <criterion>Metric cards show values</criterion>
  <criterion>Chart displays trend data</criterion>
  <criterion>Widgets link to detail pages</criterion>
</validation_criteria>

</task_spec>
