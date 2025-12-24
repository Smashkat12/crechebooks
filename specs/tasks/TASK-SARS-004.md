<task_spec id="TASK-SARS-004" version="1.0">

<metadata>
  <title>Fix PAYE Tax Bracket 1 Maximum Value</title>
  <status>INVALID</status>
  <layer>foundation</layer>
  <sequence>94</sequence>
  <priority>P0-BLOCKER</priority>
  <implements>
    <requirement_ref>REQ-SARS-007</requirement_ref>
    <critical_issue_ref>CRIT-004</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-SARS-001</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
  <estimated_effort>1 hour</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use analytical reasoning with attention to detail.
This is a data correction task requiring:
1. Verification against official SARS 2024/25 tax tables
2. Update of constant value
3. Creation of automated comparison test
4. Recalculation impact assessment
</reasoning_mode>

<context>
**INVALIDATED 2025-12-24**: This task was based on INCORRECT analysis.

ACTUAL SARS 2024/25 Tax Bracket 1 Maximum: R237,100 (verified from official SARS website)
Current Code Value: R237,100 (23710000 cents)

The code is CORRECT. No fix needed.

Verification source: https://www.sars.gov.za/tax-rates/income-tax/rates-of-tax-for-individuals/

The original analysis incorrectly claimed the value should be R237,400. All 7 tax brackets
in paye.constants.ts have been validated against official SARS 2024/25 tables and are correct.

A validation test was created to prevent future regressions.
</context>

<current_state>
## Codebase State
- File exists: `apps/api/src/database/constants/paye.constants.ts`
- SARS reference file exists: `apps/api/src/database/constants/sars_tables_2025.json`
- TASK-SARS-001 (Staff/Payroll entities): COMPLETE
- TASK-SARS-012 (PAYE Calculation Service): COMPLETE

## The Bug
Location: `apps/api/src/database/constants/paye.constants.ts` lines 34-40
Current: Bracket 1 max = 237100 (R237,100)
Correct: Bracket 1 max = 237400 (R237,400)
Discrepancy: R300 (30000 cents)

## Impact
- Employees earning R237,100 - R237,400 are incorrectly taxed at 26% instead of 18%
- Approximately R780 per year overcollection for affected employees
</current_state>

<input_context_files>
  <file purpose="constants_to_fix">apps/api/src/database/constants/paye.constants.ts</file>
  <file purpose="reference_data">apps/api/src/database/constants/sars_tables_2025.json</file>
  <file purpose="service_using_constants">apps/api/src/database/services/paye-calculation.service.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Fix PAYE_TAX_BRACKETS[0].max from 237100 to 237400
    - Verify all other brackets match SARS 2024/25 tables
    - Create automated test comparing constants to JSON reference
    - Add audit log entry for the correction
  </in_scope>
  <out_of_scope>
    - Recalculating historical payroll (separate migration task)
    - Modifying PAYE calculation service logic
    - UI changes
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/constants/paye.constants.ts">
      export const PAYE_TAX_BRACKETS: TaxBracket[] = [
        { min: 0, max: 237400, rate: 0.18, baseAmount: 0 },
        { min: 237401, max: 370500, rate: 0.26, baseAmount: 42732 },
        { min: 370501, max: 512800, rate: 0.31, baseAmount: 77326 },
        { min: 512801, max: 673000, rate: 0.36, baseAmount: 121439 },
        { min: 673001, max: 857900, rate: 0.39, baseAmount: 179112 },
        { min: 857901, max: 1817000, rate: 0.41, baseAmount: 251223 },
        { min: 1817001, max: Infinity, rate: 0.45, baseAmount: 644489 },
      ];
    </signature>
    <signature file="apps/api/src/database/constants/__tests__/paye.constants.spec.ts">
      describe('PAYE Constants Validation', () => {
        it('should match SARS 2024/25 tax tables exactly', () => { ... });
        it('should have contiguous brackets with no gaps', () => { ... });
        it('should have increasing rates per bracket', () => { ... });
      });
    </signature>
  </signatures>

  <constraints>
    - Bracket 1 max MUST equal 237400 (not 237100)
    - All values must be in CENTS (integers)
    - Base amounts must match SARS cumulative tax calculation
    - Test must load and compare against sars_tables_2025.json
    - NO changes to calculation service in this task
  </constraints>

  <verification>
    - npm run build succeeds
    - npm run test -- --testPathPattern="paye.constants" passes
    - Bracket values match SARS 2024/25 official tables
    - Continuous bracket coverage (no gaps or overlaps)
  </verification>
</definition_of_done>

<files_to_modify>
  <file path="apps/api/src/database/constants/paye.constants.ts" action="update">
    Update PAYE_TAX_BRACKETS[0].max from 237100 to 237400
  </file>
</files_to_modify>

<files_to_create>
  <file path="apps/api/src/database/constants/__tests__/paye.constants.spec.ts">
    Automated test comparing constants to SARS reference JSON
  </file>
</files_to_create>

<implementation_reference>
## Fix in paye.constants.ts

Change line containing bracket 1 definition:
```typescript
// BEFORE (INCORRECT)
{ min: 0, max: 237100, rate: 0.18, baseAmount: 0 },

// AFTER (CORRECT - matches SARS 2024/25)
{ min: 0, max: 237400, rate: 0.18, baseAmount: 0 },
```

## Test File Implementation

```typescript
/**
 * PAYE Constants Validation Tests
 * TASK-SARS-004: Ensures constants match official SARS tables
 */
import { PAYE_TAX_BRACKETS, TAX_REBATES, MEDICAL_TAX_CREDITS } from '../paye.constants';
import sarsTables from '../sars_tables_2025.json';

describe('PAYE Constants Validation', () => {
  describe('Tax Brackets', () => {
    it('should match SARS 2024/25 tax tables exactly', () => {
      // Compare each bracket against reference JSON
      sarsTables.taxBrackets.forEach((sarsBracket, index) => {
        expect(PAYE_TAX_BRACKETS[index].min).toBe(sarsBracket.min);
        expect(PAYE_TAX_BRACKETS[index].max).toBe(sarsBracket.max);
        expect(PAYE_TAX_BRACKETS[index].rate).toBe(sarsBracket.rate);
      });
    });

    it('should have bracket 1 max at R237,400 (23740000 cents)', () => {
      // Critical check for CRIT-004 fix
      expect(PAYE_TAX_BRACKETS[0].max).toBe(237400);
    });

    it('should have contiguous brackets with no gaps', () => {
      for (let i = 1; i < PAYE_TAX_BRACKETS.length; i++) {
        const prevMax = PAYE_TAX_BRACKETS[i - 1].max;
        const currMin = PAYE_TAX_BRACKETS[i].min;
        expect(currMin).toBe(prevMax + 1);
      }
    });

    it('should have increasing rates per bracket', () => {
      for (let i = 1; i < PAYE_TAX_BRACKETS.length; i++) {
        expect(PAYE_TAX_BRACKETS[i].rate).toBeGreaterThan(PAYE_TAX_BRACKETS[i - 1].rate);
      }
    });

    it('should have 7 tax brackets for 2024/25', () => {
      expect(PAYE_TAX_BRACKETS).toHaveLength(7);
    });
  });
});
```
</implementation_reference>

<validation_criteria>
  <criterion>Bracket 1 max equals 237400</criterion>
  <criterion>All brackets match SARS 2024/25 tables</criterion>
  <criterion>Automated test validates constants against JSON</criterion>
  <criterion>No gaps or overlaps in bracket ranges</criterion>
  <criterion>Build and all existing tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="paye.constants" --verbose</command>
  <command>npm run test -- --testPathPattern="paye-calculation" --verbose</command>
</test_commands>

<error_handling>
If bracket values don't match SARS tables:
1. STOP immediately
2. Log discrepancy with exact values
3. Throw ValidationException with details
4. Do NOT proceed with incorrect values
</error_handling>

</task_spec>
