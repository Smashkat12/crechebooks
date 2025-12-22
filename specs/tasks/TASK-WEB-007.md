<task_spec id="TASK-WEB-007" version="1.0">

<metadata>
  <title>Data Table Component with Sorting and Filtering</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>7</sequence>
  <implements>
    <requirement_ref>REQ-WEB-03</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-002</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
Create a reusable DataTable component using TanStack Table that supports sorting, filtering, pagination, and row selection. This component will be used for transactions, invoices, payments, and other list views.
</context>

<input_context_files>
  <file purpose="ui_components">apps/web/src/components/ui/table.tsx</file>
  <file purpose="shared_types">packages/types/src/common.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-002 completed</check>
  <check>@tanstack/react-table installed</check>
</prerequisites>

<scope>
  <in_scope>
    - Generic DataTable component
    - Column definitions helper
    - Sorting UI and logic
    - Filtering UI and logic
    - Pagination component
    - Row selection
    - Loading and empty states
  </in_scope>
  <out_of_scope>
    - Specific table implementations (transactions, invoices)
    - Export functionality
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/tables/data-table.tsx">
      export function DataTable&lt;TData, TValue&gt;({ columns, data, ... }: DataTableProps&lt;TData, TValue&gt;): JSX.Element
    </signature>
    <signature file="apps/web/src/components/tables/data-table-pagination.tsx">
      export function DataTablePagination&lt;TData&gt;({ table }: { table: Table&lt;TData&gt; }): JSX.Element
    </signature>
    <signature file="apps/web/src/components/tables/data-table-toolbar.tsx">
      export function DataTableToolbar&lt;TData&gt;({ table, filterColumn, ... }: ...): JSX.Element
    </signature>
  </signatures>

  <constraints>
    - Must be fully typed with generics
    - Must support server-side pagination
    - Must be accessible (keyboard navigation)
    - Must show loading skeleton
  </constraints>

  <verification>
    - Table renders data correctly
    - Sorting toggles columns
    - Filtering updates results
    - Pagination navigates pages
    - Row selection works
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/tables/data-table.tsx">Main DataTable component</file>
  <file path="apps/web/src/components/tables/data-table-pagination.tsx">Pagination controls</file>
  <file path="apps/web/src/components/tables/data-table-toolbar.tsx">Filter and search toolbar</file>
  <file path="apps/web/src/components/tables/data-table-column-header.tsx">Sortable column header</file>
  <file path="apps/web/src/components/tables/data-table-view-options.tsx">Column visibility toggle</file>
  <file path="apps/web/src/components/tables/data-table-skeleton.tsx">Loading skeleton</file>
  <file path="apps/web/src/components/tables/index.ts">Table exports</file>
</files_to_create>

<validation_criteria>
  <criterion>DataTable renders with sample data</criterion>
  <criterion>Sorting changes row order</criterion>
  <criterion>Filtering reduces visible rows</criterion>
  <criterion>Pagination shows correct page</criterion>
  <criterion>Empty state displays when no data</criterion>
</validation_criteria>

<test_commands>
  <command>cd apps/web && pnpm type-check</command>
</test_commands>

</task_spec>
