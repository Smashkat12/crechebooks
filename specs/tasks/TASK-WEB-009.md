<task_spec id="TASK-WEB-009" version="1.0">

<metadata>
  <title>Chart Components (Recharts)</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>9</sequence>
  <implements>
    <requirement_ref>REQ-WEB-02</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create reusable chart components using Recharts for the dashboard and reports. This includes line charts for trends, bar charts for comparisons, and pie charts for breakdowns.
</context>

<input_context_files>
  <file purpose="ui_styles">apps/web/src/styles/globals.css</file>
  <file purpose="tailwind_config">apps/web/tailwind.config.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-002 completed</check>
  <check>recharts installed</check>
</prerequisites>

<scope>
  <in_scope>
    - Line chart for income/expense trends
    - Bar chart for monthly comparisons
    - Pie chart for category breakdowns
    - Area chart for cash flow
    - Chart container with responsive sizing
    - Dark mode support for charts
  </in_scope>
  <out_of_scope>
    - Dashboard page implementation
    - Data fetching for charts
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/charts/line-chart.tsx">
      export function LineChart({ data, xKey, yKey, ... }: LineChartProps): JSX.Element
    </signature>
    <signature file="apps/web/src/components/charts/bar-chart.tsx">
      export function BarChart({ data, xKey, bars, ... }: BarChartProps): JSX.Element
    </signature>
    <signature file="apps/web/src/components/charts/pie-chart.tsx">
      export function PieChart({ data, ... }: PieChartProps): JSX.Element
    </signature>
  </signatures>

  <constraints>
    - Must be responsive
    - Must support dark mode
    - Must format currency values as ZAR
    - Must show tooltips with data
  </constraints>

  <verification>
    - Charts render with sample data
    - Charts resize with container
    - Dark mode colors apply
    - Tooltips show on hover
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/charts/line-chart.tsx">Line chart component</file>
  <file path="apps/web/src/components/charts/bar-chart.tsx">Bar chart component</file>
  <file path="apps/web/src/components/charts/pie-chart.tsx">Pie chart component</file>
  <file path="apps/web/src/components/charts/area-chart.tsx">Area chart component</file>
  <file path="apps/web/src/components/charts/chart-container.tsx">Responsive container</file>
  <file path="apps/web/src/components/charts/chart-tooltip.tsx">Custom tooltip</file>
  <file path="apps/web/src/components/charts/index.ts">Chart exports</file>
</files_to_create>

<validation_criteria>
  <criterion>Charts render without errors</criterion>
  <criterion>Charts are responsive</criterion>
  <criterion>Colors work in dark mode</criterion>
  <criterion>Currency formats as R in tooltips</criterion>
</validation_criteria>

<test_commands>
  <command>cd apps/web && pnpm type-check</command>
</test_commands>

</task_spec>
