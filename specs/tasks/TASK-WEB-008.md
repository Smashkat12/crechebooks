<task_spec id="TASK-WEB-008" version="1.0">

<metadata>
  <title>Form Components with React Hook Form</title>
  <status>ready</status>
  <layer>foundation</layer>
  <sequence>8</sequence>
  <implements>
    <requirement_ref>REQ-WEB-05</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-WEB-002</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
Create reusable form components using React Hook Form and Zod for validation. These components will be used for all data entry including parent registration, invoice creation, payment allocation, and settings.
</context>

<input_context_files>
  <file purpose="ui_components">apps/web/src/components/ui/</file>
  <file purpose="shared_types">packages/types/src/</file>
</input_context_files>

<prerequisites>
  <check>TASK-WEB-002 completed</check>
  <check>react-hook-form installed</check>
  <check>@hookform/resolvers installed</check>
  <check>zod installed</check>
</prerequisites>

<scope>
  <in_scope>
    - Form wrapper component with context
    - Form field components (input, select, checkbox)
    - Date picker component
    - Currency input component
    - Form validation with Zod
    - Error message display
  </in_scope>
  <out_of_scope>
    - Specific form implementations
    - API submission logic
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/forms/form.tsx">
      export function Form&lt;TFieldValues extends FieldValues&gt;({ form, onSubmit, children }: FormProps&lt;TFieldValues&gt;): JSX.Element
    </signature>
    <signature file="apps/web/src/components/forms/form-field.tsx">
      export function FormField({ control, name, render }: FormFieldProps): JSX.Element
    </signature>
    <signature file="apps/web/src/components/forms/currency-input.tsx">
      export function CurrencyInput({ value, onChange, ... }: CurrencyInputProps): JSX.Element
    </signature>
  </signatures>

  <constraints>
    - Must integrate with shadcn/ui components
    - Currency input must format as ZAR
    - Date picker must use SAST timezone
    - All fields must support error states
  </constraints>

  <verification>
    - Form submits valid data
    - Validation errors display correctly
    - Currency formats as R X,XXX.XX
    - Date picker opens and selects
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/forms/form.tsx">Form wrapper with context</file>
  <file path="apps/web/src/components/forms/form-field.tsx">Field wrapper component</file>
  <file path="apps/web/src/components/forms/form-input.tsx">Text input field</file>
  <file path="apps/web/src/components/forms/form-select.tsx">Select field</file>
  <file path="apps/web/src/components/forms/form-checkbox.tsx">Checkbox field</file>
  <file path="apps/web/src/components/forms/date-picker.tsx">Date picker component</file>
  <file path="apps/web/src/components/forms/currency-input.tsx">Currency input (ZAR)</file>
  <file path="apps/web/src/components/forms/index.ts">Form exports</file>
  <file path="apps/web/src/lib/validations/index.ts">Common Zod schemas</file>
</files_to_create>

<validation_criteria>
  <criterion>Form components render correctly</criterion>
  <criterion>Validation errors show on blur/submit</criterion>
  <criterion>Currency input formats R values</criterion>
  <criterion>Date picker shows calendar</criterion>
</validation_criteria>

<test_commands>
  <command>cd apps/web && pnpm type-check</command>
</test_commands>

</task_spec>
