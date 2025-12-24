<task_spec id="TASK-WEB-044" version="1.0">

<metadata>
  <title>Pro-Rata Fee Display Component</title>
  <status>pending</status>
  <layer>surface</layer>
  <sequence>123</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-WEB-10</requirement_ref>
    <critical_issue_ref>HIGH-009</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-BILL-003</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
  <estimated_effort>1 day</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use UI component design thinking.
This task involves:
1. Create ProRataDisplay component
2. Show calculation breakdown
3. Visual timeline representation
4. Display all relevant dates
5. Integration with invoice preview
</reasoning_mode>

<context>
GAP: Pro-rata calculations exist in backend but are not displayed in UI.

REQ-WEB-10 specifies: "Display pro-rata calculations."

This task creates a component to visualize pro-rata fee calculations.
</context>

<current_state>
## Codebase State
- ProRataCalculationService exists
- Calculations done in backend
- No UI display component
- Invoice shows total without breakdown

## What Exists
- Pro-rata calculation logic
- Fee structure types
- Invoice line items
</current_state>

<input_context_files>
  <file purpose="calculation_service">apps/api/src/database/services/pro-rata-calculation.service.ts</file>
  <file purpose="invoice_types">apps/api/src/billing/types/invoice.types.ts</file>
  <file purpose="invoice_page">apps/web/src/app/(dashboard)/invoices/[id]/page.tsx</file>
</input_context_files>

<scope>
  <in_scope>
    - ProRataDisplay component
    - Calculation breakdown display
    - Visual timeline with dates
    - Start date, end date, total days
    - Charged days and percentage
    - Integration with invoice detail
  </in_scope>
  <out_of_scope>
    - Calculation logic changes
    - Pro-rata editing
    - Bulk pro-rata operations
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/billing/ProRataDisplay.tsx">
      export interface ProRataDisplayProps {
        calculation: ProRataCalculation;
        showTimeline?: boolean;
        compact?: boolean;
      }

      export function ProRataDisplay({
        calculation,
        showTimeline = true,
        compact = false,
      }: ProRataDisplayProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/components/billing/ProRataTimeline.tsx">
      export interface ProRataTimelineProps {
        startDate: Date;
        endDate: Date;
        chargedFrom: Date;
        chargedTo: Date;
      }

      export function ProRataTimeline({
        startDate,
        endDate,
        chargedFrom,
        chargedTo,
      }: ProRataTimelineProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/types/billing.types.ts">
      export interface ProRataCalculation {
        periodStart: string;
        periodEnd: string;
        enrollmentStart: string;
        enrollmentEnd?: string;
        totalDays: number;
        chargedDays: number;
        percentage: number;
        monthlyFee: number;
        proratedFee: number;
      }
    </signature>
  </signatures>

  <constraints>
    - Timeline shows full month period
    - Highlight charged portion visually
    - Show percentage prominently
    - Display currency in ZAR format
    - Responsive for mobile
    - Accessible with ARIA labels
  </constraints>

  <verification>
    - Component renders correctly
    - Timeline shows dates accurately
    - Calculation breakdown visible
    - Percentage displayed
    - Currency formatted correctly
    - Mobile responsive
    - Accessibility passes
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/billing/ProRataDisplay.tsx">Main component</file>
  <file path="apps/web/src/components/billing/ProRataTimeline.tsx">Timeline visual</file>
  <file path="apps/web/src/types/billing.types.ts">TypeScript types</file>
</files_to_create>

<files_to_modify>
  <file path="apps/web/src/app/(dashboard)/invoices/[id]/page.tsx">Add component</file>
</files_to_modify>

<validation_criteria>
  <criterion>Component displays breakdown</criterion>
  <criterion>Timeline shows dates</criterion>
  <criterion>Percentage visible</criterion>
  <criterion>Currency formatted</criterion>
  <criterion>Mobile responsive</criterion>
  <criterion>Accessible</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build --filter=web</command>
  <command>npm run test --filter=web -- --testPathPattern="ProRata" --verbose</command>
</test_commands>

</task_spec>
