<task_spec id="TASK-WEB-010" version="1.0">

<metadata>
  <title>Utility Functions and Formatters</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>10</sequence>
  <implements>
    <requirement_ref>REQ-WEB-12</requirement_ref>
    <requirement_ref>REQ-WEB-13</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-001</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
Create utility functions for formatting currency, dates, percentages, and other common operations used throughout the application. These ensure consistent display of South African-specific formats.
</context>

<input_context_files>
  <file purpose="sa_context">specs/constitution.md#south_african_context</file>
  <file purpose="shared_types">packages/types/src/common.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-001 completed</check>
  <check>date-fns installed</check>
  <check>decimal.js installed</check>
</prerequisites>

<scope>
  <in_scope>
    - Currency formatting (ZAR)
    - Date formatting (SAST)
    - Percentage formatting
    - Number formatting
    - Status badge helpers
    - Text truncation
    - Pluralization helpers
  </in_scope>
  <out_of_scope>
    - API utilities (TASK-WEB-003)
    - Auth utilities (TASK-WEB-004)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/lib/utils/format.ts">
      export function formatCurrency(amount: number): string // Returns "R X,XXX.XX"
      export function formatDate(date: Date | string, format?: string): string
      export function formatPercent(value: number, decimals?: number): string
    </signature>
    <signature file="apps/web/src/lib/utils/helpers.ts">
      export function getStatusBadgeVariant(status: string): BadgeVariant
      export function truncate(text: string, length: number): string
      export function pluralize(count: number, singular: string, plural?: string): string
    </signature>
  </signatures>

  <constraints>
    - Currency must use ZAR symbol (R)
    - Dates must display in SAST timezone
    - Must use Intl APIs for localization
    - Must handle null/undefined gracefully
  </constraints>

  <verification>
    - formatCurrency(12345.67) returns "R 12,345.67"
    - formatDate handles ISO strings and Date objects
    - All functions handle edge cases
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/lib/utils/format.ts">Currency, date, number formatters</file>
  <file path="apps/web/src/lib/utils/helpers.ts">General helper functions</file>
  <file path="apps/web/src/lib/utils/constants.ts">Shared constants</file>
  <file path="apps/web/src/lib/utils/index.ts">Utils exports</file>
</files_to_create>

<validation_criteria>
  <criterion>Currency formats as "R X,XXX.XX"</criterion>
  <criterion>Dates display in SAST</criterion>
  <criterion>Functions handle null/undefined</criterion>
  <criterion>No TypeScript errors</criterion>
</validation_criteria>

<test_commands>
  <command>cd apps/web && pnpm type-check</command>
  <command>cd apps/web && pnpm test</command>
</test_commands>

</task_spec>
