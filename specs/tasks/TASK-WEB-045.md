<task_spec id="TASK-WEB-045" version="1.0">

<metadata>
  <title>Payment Reminder Template Editor</title>
  <status>pending</status>
  <layer>surface</layer>
  <sequence>124</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-PAY-010</requirement_ref>
    <critical_issue_ref>HIGH-006</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="PENDING">TASK-PAY-015</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>3 days</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use UI/UX and template editing thinking.
This task involves:
1. Template editor page
2. Variable placeholder support
3. Preview before save
4. Multiple templates per stage
5. Email and WhatsApp templates
</reasoning_mode>

<context>
GAP: No UI exists for managing payment reminder templates.

REQ-PAY-010 specifies: "Customizable reminder templates."

This task creates a template editor for payment reminder messages.
</context>

<current_state>
## Codebase State
- ReminderTemplate entity may exist
- No template management UI
- Default templates hardcoded
- No variable substitution UI

## What's Missing
- Template editor page
- Variable placeholders
- Preview functionality
- Multiple templates per stage
</current_state>

<input_context_files>
  <file purpose="reminder_types">apps/api/src/billing/types/reminder.types.ts</file>
  <file purpose="dashboard_layout">apps/web/src/app/(dashboard)/layout.tsx</file>
</input_context_files>

<scope>
  <in_scope>
    - Template editor page at /settings/templates
    - Rich text editor for email templates
    - Plain text editor for WhatsApp
    - Variable placeholder insertion
    - Live preview with sample data
    - Save and revert functionality
    - Default template reset
  </in_scope>
  <out_of_scope>
    - Template versioning
    - A/B testing templates
    - Template translation
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/app/(dashboard)/settings/templates/page.tsx">
      export default function TemplatesPage(): JSX.Element;
    </signature>
    <signature file="apps/web/src/components/templates/TemplateEditor.tsx">
      export interface TemplateEditorProps {
        template: ReminderTemplate;
        variables: TemplateVariable[];
        onSave: (content: string) => void;
        onPreview: () => void;
      }

      export function TemplateEditor(props: TemplateEditorProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/components/templates/VariablePicker.tsx">
      export interface VariablePickerProps {
        variables: TemplateVariable[];
        onInsert: (variable: string) => void;
      }

      export function VariablePicker(props: VariablePickerProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/hooks/useTemplates.ts">
      export function useTemplates(channel: 'email' | 'whatsapp');
      export function useUpdateTemplate();
      export function usePreviewTemplate();
    </signature>
  </signatures>

  <constraints>
    - Available variables: {parent_name}, {child_name}, {amount}, {due_date}, {days_overdue}, {creche_name}
    - Preview uses sample data
    - Validate required variables present
    - WhatsApp limited to 1024 characters
    - Email supports basic HTML
    - Save confirmation required
  </constraints>

  <verification>
    - Editor loads templates
    - Variables insert correctly
    - Preview shows sample
    - Save persists changes
    - Revert restores previous
    - Reset to default works
    - Both channels work
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/app/(dashboard)/settings/templates/page.tsx">Editor page</file>
  <file path="apps/web/src/components/templates/TemplateEditor.tsx">Editor component</file>
  <file path="apps/web/src/components/templates/VariablePicker.tsx">Variable picker</file>
  <file path="apps/web/src/components/templates/TemplatePreview.tsx">Preview component</file>
  <file path="apps/web/src/hooks/useTemplates.ts">Data hooks</file>
</files_to_create>

<files_to_modify>
  <file path="apps/web/src/app/(dashboard)/settings/page.tsx">Add templates link</file>
</files_to_modify>

<validation_criteria>
  <criterion>Editor page accessible</criterion>
  <criterion>Variables insert correctly</criterion>
  <criterion>Preview renders sample</criterion>
  <criterion>Save works</criterion>
  <criterion>Both channels work</criterion>
  <criterion>Character limits enforced</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build --filter=web</command>
  <command>npm run test --filter=web -- --testPathPattern="template" --verbose</command>
</test_commands>

</task_spec>
