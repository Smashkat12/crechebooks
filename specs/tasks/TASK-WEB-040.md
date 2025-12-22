<task_spec id="TASK-WEB-040" version="1.0">

<metadata>
  <title>Settings Page</title>
  <status>ready</status>
  <layer>surface</layer>
  <sequence>40</sequence>
  <implements>
    <requirement_ref>REQ-WEB-15</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-006</task_ref>
    <task_ref>TASK-WEB-008</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the settings page for user preferences, tenant configuration, and integrations.
</context>

<input_context_files>
  <file purpose="layout">apps/web/src/components/layout/dashboard-layout.tsx</file>
  <file purpose="form_components">apps/web/src/components/forms/</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-006 completed</check>
  <check>TASK-WEB-008 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Settings page with tabs
    - Profile settings
    - Tenant/organization settings
    - Xero connection status
    - Fee structure management
    - User preferences (theme, notifications)
  </in_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(dashboard)/settings/page.tsx">
      export default function SettingsPage()
    </signature>
  </signatures>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(dashboard)/settings/page.tsx">Settings page</file>
  <file path="apps/web/src/app/(dashboard)/settings/profile/page.tsx">Profile settings</file>
  <file path="apps/web/src/app/(dashboard)/settings/organization/page.tsx">Organization settings</file>
  <file path="apps/web/src/app/(dashboard)/settings/integrations/page.tsx">Integrations</file>
  <file path="apps/web/src/app/(dashboard)/settings/fees/page.tsx">Fee structures</file>
  <file path="apps/web/src/app/(dashboard)/settings/loading.tsx">Loading skeleton</file>
</files_to_create>

<validation_criteria>
  <criterion>Settings tabs navigate correctly</criterion>
  <criterion>Profile form saves</criterion>
  <criterion>Theme toggle works</criterion>
</validation_criteria>

</task_spec>
