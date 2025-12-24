<task_spec id="TASK-RECON-016" version="1.0">

<metadata>
  <title>3-Day Business Day Timing Window for Reconciliation</title>
  <status>pending</status>
  <layer>logic</layer>
  <sequence>106</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-RECON-003</requirement_ref>
    <critical_issue_ref>CRIT-016</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-RECON-003</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use date calculation and business logic thinking.
This task involves:
1. Replacing exact date match with window
2. Business day calculation
3. SA public holiday handling
4. Timing difference flagging
5. Configurable window per tenant
</reasoning_mode>

<context>
CRITICAL GAP: Exact date matching misses legitimate timing differences between bank and book entries.

Current: `discrepancy.service.ts:328-340` uses exact date match.

REQ-RECON-003 specifies: "Handle timing differences in reconciliation."

This task changes matching from exact date to +/- 3 business days to handle bank processing delays.
</context>

<current_state>
## Codebase State
- DiscrepancyService exists with date matching
- Exact date comparison at lines 328-340
- No business day service
- No SA public holiday calendar

## What's Missing
- BusinessDayService
- SA public holiday calendar
- Configurable timing window
- Timing difference flag on matches
</current_state>

<input_context_files>
  <file purpose="discrepancy_service">apps/api/src/modules/reconciliation/discrepancy.service.ts</file>
  <file purpose="reconciliation_types">apps/api/src/modules/reconciliation/types/reconciliation.types.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - BusinessDayService for date window calculations
    - SA public holiday calendar (2024-2026)
    - Change exact date to 3-day business window
    - Flag matches with timing differences
    - Configurable window per tenant (default 3 days)
  </in_scope>
  <out_of_scope>
    - Historical recalculation of matches
    - Automatic holiday calendar updates
    - Non-SA public holidays
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/common/services/business-day.service.ts">
      @Injectable()
      export class BusinessDayService {
        isBusinessDay(date: Date): boolean;
        isWithinBusinessDays(date1: Date, date2: Date, days: number): boolean;
        getBusinessDaysBetween(date1: Date, date2: Date): number;
        addBusinessDays(date: Date, days: number): Date;
        isPublicHoliday(date: Date): boolean;
      }
    </signature>
    <signature file="apps/api/src/common/constants/sa-holidays.constants.ts">
      export interface PublicHoliday {
        date: string; // YYYY-MM-DD
        name: string;
        observed: string; // YYYY-MM-DD if different
      }

      export const SA_PUBLIC_HOLIDAYS_2024: PublicHoliday[];
      export const SA_PUBLIC_HOLIDAYS_2025: PublicHoliday[];
      export const SA_PUBLIC_HOLIDAYS_2026: PublicHoliday[];
    </signature>
  </signatures>

  <constraints>
    - Default window: 3 business days
    - Weekends excluded (Saturday, Sunday)
    - SA public holidays excluded
    - Observed holiday handling (if weekend, observe Monday)
    - Flag: transaction.hasTimingDifference = true for non-exact matches
    - Window configurable per tenant (1-5 business days)
  </constraints>

  <verification>
    - Matches found within 3 business days
    - Weekends excluded from calculation
    - SA public holidays respected
    - Observed holidays handled correctly
    - Timing differences flagged
    - Window configurable per tenant
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/common/services/business-day.service.ts">Business day service</file>
  <file path="apps/api/src/common/constants/sa-holidays.constants.ts">SA holidays</file>
  <file path="apps/api/src/common/services/__tests__/business-day.service.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/modules/reconciliation/discrepancy.service.ts">Use BusinessDayService</file>
  <file path="apps/api/src/common/common.module.ts">Export BusinessDayService</file>
</files_to_modify>

<validation_criteria>
  <criterion>Business day calculation correct</criterion>
  <criterion>Weekends excluded</criterion>
  <criterion>SA holidays respected</criterion>
  <criterion>Observed holidays handled</criterion>
  <criterion>3-day window matches work</criterion>
  <criterion>Timing differences flagged</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="business-day" --verbose</command>
</test_commands>

</task_spec>
