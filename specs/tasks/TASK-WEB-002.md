<task_spec id="TASK-WEB-002" version="1.0">

<metadata>
  <title>UI Component Library Setup (shadcn/ui)</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>2</sequence>
  <implements>
    <requirement_ref>REQ-WEB-14</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Set up shadcn/ui component library with base components needed across the application. This includes buttons, forms, dialogs, tables, and other core UI elements that will be used throughout the CrecheBooks interface.
</context>

<input_context_files>
  <file purpose="tailwind_config">apps/web/tailwind.config.ts</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-001 completed</check>
  <check>Tailwind CSS configured</check>
</prerequisites>

<scope>
  <in_scope>
    - Install and configure shadcn/ui
    - Create base UI components: Button, Input, Label, Card
    - Create form components: Form, Select, Checkbox
    - Create feedback components: Toast, Dialog, AlertDialog
    - Create data components: Table, DataTable skeleton
    - Create layout components: Separator, Tabs
  </in_scope>
  <out_of_scope>
    - Page-specific components
    - Business logic components
    - API integration
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/ui/button.tsx">
      export const Button = React.forwardRef&lt;HTMLButtonElement, ButtonProps&gt;(...)
    </signature>
    <signature file="apps/web/src/components/ui/input.tsx">
      export const Input = React.forwardRef&lt;HTMLInputElement, InputProps&gt;(...)
    </signature>
    <signature file="apps/web/src/lib/utils.ts">
      export function cn(...inputs: ClassValue[]): string
    </signature>
  </signatures>

  <constraints>
    - Must follow shadcn/ui patterns
    - All components must support dark mode
    - Must use class-variance-authority for variants
    - Must use tailwind-merge for class composition
  </constraints>

  <verification>
    - All components render without errors
    - Components work in both light and dark mode
    - No TypeScript errors
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/ui/button.tsx">Button component</file>
  <file path="apps/web/src/components/ui/input.tsx">Input component</file>
  <file path="apps/web/src/components/ui/label.tsx">Label component</file>
  <file path="apps/web/src/components/ui/card.tsx">Card component</file>
  <file path="apps/web/src/components/ui/dialog.tsx">Dialog component</file>
  <file path="apps/web/src/components/ui/alert-dialog.tsx">Alert dialog component</file>
  <file path="apps/web/src/components/ui/select.tsx">Select component</file>
  <file path="apps/web/src/components/ui/checkbox.tsx">Checkbox component</file>
  <file path="apps/web/src/components/ui/table.tsx">Table component</file>
  <file path="apps/web/src/components/ui/tabs.tsx">Tabs component</file>
  <file path="apps/web/src/components/ui/toast.tsx">Toast component</file>
  <file path="apps/web/src/components/ui/toaster.tsx">Toaster provider</file>
  <file path="apps/web/src/components/ui/separator.tsx">Separator component</file>
  <file path="apps/web/src/lib/utils.ts">Utility functions (cn)</file>
  <file path="apps/web/components.json">shadcn/ui config</file>
</files_to_create>

<validation_criteria>
  <criterion>All UI components import and render correctly</criterion>
  <criterion>Components respond to dark mode changes</criterion>
  <criterion>No TypeScript errors in component files</criterion>
</validation_criteria>

<test_commands>
  <command>cd apps/web && pnpm type-check</command>
  <command>cd apps/web && pnpm lint</command>
</test_commands>

</task_spec>
