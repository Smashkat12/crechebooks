<task_spec id="TASK-WEB-031" version="1.0">

<metadata>
  <title>Dashboard Page</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>31</sequence>
  <implements>
    <requirement_ref>REQ-WEB-01</requirement_ref>
    <requirement_ref>REQ-WEB-02</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-006</task_ref>
    <task_ref>TASK-WEB-017</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the main dashboard page that displays financial overview with metric cards, charts, and quick action widgets. This is the landing page after login.
</context>

<input_context_files>
  <file purpose="layout">apps/web/src/components/layout/dashboard-layout.tsx</file>
  <file purpose="dashboard_widgets">apps/web/src/components/dashboard/</file>
  <file purpose="api_hooks">apps/web/src/hooks/</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-006 completed</check>
  <check>TASK-WEB-017 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Dashboard page route
    - Grid layout for widgets
    - Data fetching and loading states
    - Period selector integration
    - Error handling
  </in_scope>
  <out_of_scope>
    - Widget component implementation (TASK-WEB-017)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(dashboard)/dashboard/page.tsx">
      export default function DashboardPage()
    </signature>
  </signatures>

  <constraints>
    - Must use dashboard layout
    - Must handle loading states
    - Must be responsive grid
  </constraints>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(dashboard)/dashboard/page.tsx">Dashboard page</file>
  <file path="apps/web/src/app/(dashboard)/dashboard/loading.tsx">Loading skeleton</file>
  <file path="apps/web/src/app/(dashboard)/layout.tsx">Dashboard group layout</file>
</files_to_create>

<validation_criteria>
  <criterion>Dashboard loads with metrics</criterion>
  <criterion>Charts display data</criterion>
  <criterion>Loading states show correctly</criterion>
</validation_criteria>

</task_spec>
