<task_spec id="TASK-WEB-006" version="1.0">

<metadata>
  <title>Layout Components (Sidebar, Header, Navigation)</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>6</sequence>
  <implements>
    <requirement_ref>REQ-WEB-14</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-002</task_ref>
    <task_ref>TASK-WEB-004</task_ref>
    <task_ref>TASK-WEB-005</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create the main application layout components including the sidebar navigation, header with user menu, and responsive mobile navigation. These form the shell that wraps all authenticated pages.
</context>

<input_context_files>
  <file purpose="ui_components">apps/web/src/components/ui/</file>
  <file purpose="auth_hook">apps/web/src/hooks/use-auth.ts</file>
  <file purpose="ui_store">apps/web/src/stores/ui-store.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-002 completed</check>
  <check>TASK-WEB-004 completed</check>
  <check>TASK-WEB-005 completed</check>
</prerequisites>

<scope>
  <in_scope>
    - Sidebar with navigation links
    - Header with user dropdown
    - Mobile hamburger menu
    - Breadcrumb component
    - Dashboard layout wrapper
  </in_scope>
  <out_of_scope>
    - Page content
    - Specific feature components
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/layout/sidebar.tsx">
      export function Sidebar(): JSX.Element
    </signature>
    <signature file="apps/web/src/components/layout/header.tsx">
      export function Header(): JSX.Element
    </signature>
    <signature file="apps/web/src/components/layout/dashboard-layout.tsx">
      export function DashboardLayout({ children }: { children: React.ReactNode }): JSX.Element
    </signature>
  </signatures>

  <constraints>
    - Must be responsive (collapse sidebar on mobile)
    - Must show user name and avatar in header
    - Navigation must highlight active route
    - Must support dark mode
  </constraints>

  <verification>
    - Sidebar navigation works
    - Header shows user info
    - Mobile menu toggles correctly
    - Active route is highlighted
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/layout/sidebar.tsx">Sidebar with nav links</file>
  <file path="apps/web/src/components/layout/header.tsx">Header with user menu</file>
  <file path="apps/web/src/components/layout/mobile-nav.tsx">Mobile navigation</file>
  <file path="apps/web/src/components/layout/breadcrumbs.tsx">Breadcrumb navigation</file>
  <file path="apps/web/src/components/layout/dashboard-layout.tsx">Dashboard layout wrapper</file>
  <file path="apps/web/src/components/layout/user-nav.tsx">User dropdown menu</file>
  <file path="apps/web/src/components/layout/nav-links.ts">Navigation link definitions</file>
  <file path="apps/web/src/components/layout/index.ts">Layout exports</file>
</files_to_create>

<files_to_modify>
  <file path="apps/web/src/app/(dashboard)/layout.tsx">Use DashboardLayout</file>
</files_to_modify>

<validation_criteria>
  <criterion>Sidebar renders with navigation links</criterion>
  <criterion>Header shows logged-in user info</criterion>
  <criterion>Navigation links route correctly</criterion>
  <criterion>Mobile menu opens/closes</criterion>
  <criterion>Dark mode applies to layout</criterion>
</validation_criteria>

<test_commands>
  <command>cd apps/web && pnpm type-check</command>
  <command>cd apps/web && pnpm dev</command>
</test_commands>

</task_spec>
