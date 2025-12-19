<task_spec id="TASK-SARS-013" version="1.0">

<metadata>
  <title>UIF Calculation Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>30</sequence>
  <implements>
    <requirement_ref>REQ-SARS-008</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-SARS-001</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
</metadata>

<context>
This task creates the UIFService which calculates Unemployment Insurance Fund
contributions for South African employees. UIF is a mandatory contribution split
equally between employee (1%) and employer (1%) on the employee's gross remuneration,
capped at a maximum monthly salary of R17,712 (2025), resulting in a maximum monthly
contribution of R177.12 per party. All calculations use Decimal.js with banker's
rounding for cent accuracy.
</context>

<input_context_files>
  <file purpose="technical_spec">specs/technical/api-contracts.md#SarsService</file>
  <file purpose="uif_requirements">specs/requirements/sars-requirements.md</file>
  <file purpose="payroll_entity">src/database/entities/payroll.entity.ts</file>
  <file purpose="staff_entity">src/database/entities/staff.entity.ts</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
</input_context_files>

<prerequisites>
  <check>TASK-SARS-001 completed (Staff and Payroll entities exist)</check>
  <check>Decimal.js library installed</check>
  <check>TypeScript compilation working</check>
</prerequisites>

<scope>
  <in_scope>
    - Create UIFService class in src/core/sars/
    - Implement calculateUIF method (total UIF calculation)
    - Implement calculateEmployeeContribution method (1% of gross)
    - Implement calculateEmployerContribution method (1% of gross)
    - Implement applyMaxCap method (cap at R17,712 gross / R177.12 contribution)
    - Use 2025 UIF thresholds and rates
    - Use Decimal.js banker's rounding for all calculations
    - Create UIFCalculationResult interface
    - Handle earnings below and above UIF cap
    - Unit tests with edge cases
  </in_scope>
  <out_of_scope>
    - EMP201 document generation (TASK-SARS-015)
    - API endpoints
    - Database persistence
    - Historical UIF rate changes
    - Foreign workers (exempt from UIF)
    - Commission-based UIF calculations
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/sars/uif.service.ts">
      import Decimal from 'decimal.js';

      interface UIFCalculationResult {
        grossRemuneration: Decimal;
        cappedRemuneration: Decimal;
        employeeContribution: Decimal;
        employerContribution: Decimal;
        totalContribution: Decimal;
        isAboveCap: boolean;
      }

      @Injectable()
      export class UIFService {
        private readonly UIF_RATE = new Decimal('0.01'); // 1%
        private readonly MAX_REMUNERATION = new Decimal('17712'); // 2025 cap
        private readonly MAX_CONTRIBUTION = new Decimal('177.12'); // Per party

        async calculateUIF(
          grossRemuneration: Decimal
        ): Promise&lt;UIFCalculationResult&gt;;

        calculateEmployeeContribution(
          grossRemuneration: Decimal
        ): Decimal;

        calculateEmployerContribution(
          grossRemuneration: Decimal
        ): Decimal;

        applyMaxCap(
          remuneration: Decimal
        ): { cappedRemuneration: Decimal; isAboveCap: boolean };
      }
    </signature>
    <signature file="src/core/sars/interfaces/uif.interface.ts">
      export interface UIFCalculationResult {
        grossRemuneration: Decimal;
        cappedRemuneration: Decimal;
        employeeContribution: Decimal;
        employerContribution: Decimal;
        totalContribution: Decimal;
        isAboveCap: boolean;
      }
    </signature>
    <signature file="src/core/sars/constants/uif.constants.ts">
      export const UIF_CONSTANTS_2025 = {
        EMPLOYEE_RATE: new Decimal('0.01'),
        EMPLOYER_RATE: new Decimal('0.01'),
        MAX_REMUNERATION: new Decimal('17712'),
        MAX_EMPLOYEE_CONTRIBUTION: new Decimal('177.12'),
        MAX_EMPLOYER_CONTRIBUTION: new Decimal('177.12'),
        MAX_TOTAL_CONTRIBUTION: new Decimal('354.24')
      };
    </signature>
  </signatures>

  <constraints>
    - Must use Decimal.js for ALL monetary calculations
    - Must use banker's rounding (ROUND_HALF_EVEN)
    - Employee contribution rate is 1% (2025)
    - Employer contribution rate is 1% (2025)
    - Maximum remuneration for UIF is R17,712 per month (2025)
    - Maximum employee contribution is R177.12 per month (2025)
    - Maximum employer contribution is R177.12 per month (2025)
    - Must NOT use 'any' type anywhere
    - Both employee and employer contributions calculated on same capped amount
    - Contributions cannot be negative
    - UIF applies to gross remuneration before any deductions
    - All methods must be async for consistency
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - Unit tests pass with 100% coverage
    - Gross R10,000: Employee UIF = R100.00, Employer UIF = R100.00
    - Gross R17,712: Employee UIF = R177.12, Employer UIF = R177.12
    - Gross R20,000: Employee UIF = R177.12 (capped), Employer UIF = R177.12 (capped)
    - Gross R0: Employee UIF = R0, Employer UIF = R0
    - Banker's rounding applied (R10,005 * 1% = R100.05)
    - isAboveCap flag set correctly
    - Cap applied before percentage calculation
    - Total contribution is exactly 2% of capped amount
  </verification>
</definition_of_done>

<pseudo_code>
UIFService Implementation (src/core/sars/uif.service.ts):

  Configure Decimal.js:
    Decimal.set({
      precision: 20,
      rounding: Decimal.ROUND_HALF_EVEN
    })

  calculateUIF(grossRemuneration: Decimal): UIFCalculationResult:
    // Step 1: Apply maximum cap
    { cappedRemuneration, isAboveCap } = applyMaxCap(grossRemuneration)

    // Step 2: Calculate employee contribution (1%)
    employeeContribution = calculateEmployeeContribution(cappedRemuneration)

    // Step 3: Calculate employer contribution (1%)
    employerContribution = calculateEmployerContribution(cappedRemuneration)

    // Step 4: Calculate total
    totalContribution = employeeContribution.plus(employerContribution)

    Return UIFCalculationResult:
      grossRemuneration,
      cappedRemuneration,
      employeeContribution,
      employerContribution,
      totalContribution,
      isAboveCap

  calculateEmployeeContribution(grossRemuneration: Decimal): Decimal:
    // 1% of gross remuneration
    If grossRemuneration <= 0:
      Return new Decimal(0)

    contribution = grossRemuneration.mul(UIF_RATE)

    // Ensure doesn't exceed max
    If contribution > MAX_CONTRIBUTION:
      contribution = MAX_CONTRIBUTION

    Return contribution

  calculateEmployerContribution(grossRemuneration: Decimal): Decimal:
    // Same as employee contribution (1%)
    Return calculateEmployeeContribution(grossRemuneration)

  applyMaxCap(remuneration: Decimal): { cappedRemuneration: Decimal; isAboveCap: boolean }:
    If remuneration <= 0:
      Return {
        cappedRemuneration: new Decimal(0),
        isAboveCap: false
      }

    If remuneration > MAX_REMUNERATION:
      Return {
        cappedRemuneration: MAX_REMUNERATION,
        isAboveCap: true
      }

    Return {
      cappedRemuneration: remuneration,
      isAboveCap: false
    }

Constants (src/core/sars/constants/uif.constants.ts):
  UIF_CONSTANTS_2025:
    EMPLOYEE_RATE: 0.01 (1%)
    EMPLOYER_RATE: 0.01 (1%)
    MAX_REMUNERATION: R17,712 (2025 threshold)
    MAX_EMPLOYEE_CONTRIBUTION: R177.12
    MAX_EMPLOYER_CONTRIBUTION: R177.12
    MAX_TOTAL_CONTRIBUTION: R354.24

Unit Tests (tests/core/sars/uif.service.spec.ts):
  Test case: Below cap
    Input: R10,000 gross
    Expected: Employee R100.00, Employer R100.00, Total R200.00, isAboveCap: false

  Test case: At cap
    Input: R17,712 gross
    Expected: Employee R177.12, Employer R177.12, Total R354.24, isAboveCap: false

  Test case: Above cap
    Input: R25,000 gross
    Expected: Employee R177.12, Employer R177.12, Total R354.24, isAboveCap: true

  Test case: Zero gross
    Input: R0
    Expected: All zeros, isAboveCap: false

  Test case: Banker's rounding
    Input: R10,005 gross
    Expected: Employee R100.05, Employer R100.05 (not R100.04 or R100.06)

  Test case: Just below cap
    Input: R17,711 gross
    Expected: Employee R177.11, Employer R177.11, isAboveCap: false

  Test case: Just above cap
    Input: R17,713 gross
    Expected: Employee R177.12, Employer R177.12, isAboveCap: true
</pseudo_code>

<files_to_create>
  <file path="src/core/sars/uif.service.ts">UIFService class with all methods</file>
  <file path="src/core/sars/constants/uif.constants.ts">2025 UIF thresholds and rates</file>
  <file path="src/core/sars/interfaces/uif.interface.ts">UIF interfaces</file>
  <file path="tests/core/sars/uif.service.spec.ts">Comprehensive unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/sars/index.ts">Export UIFService and interfaces</file>
</files_to_modify>

<validation_criteria>
  <criterion>UIFService compiles without TypeScript errors</criterion>
  <criterion>All methods use Decimal.js for monetary calculations</criterion>
  <criterion>1% rate applied correctly for both employee and employer</criterion>
  <criterion>R17,712 cap enforced accurately</criterion>
  <criterion>R177.12 maximum contribution enforced</criterion>
  <criterion>Banker's rounding applied correctly</criterion>
  <criterion>isAboveCap flag accurate</criterion>
  <criterion>Zero and negative inputs handled gracefully</criterion>
  <criterion>Unit tests cover below cap, at cap, above cap scenarios</criterion>
  <criterion>Employee and employer contributions always equal</criterion>
  <criterion>Total contribution is exactly sum of employee + employer</criterion>
  <criterion>No 'any' types used</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --grep "UIFService"</command>
  <command>npm run lint -- src/core/sars/uif.service.ts</command>
</test_commands>

</task_spec>
