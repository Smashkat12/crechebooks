<task_spec id="TASK-SARS-012" version="1.0">

<metadata>
  <title>PAYE Calculation Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>29</sequence>
  <implements>
    <requirement_ref>REQ-SARS-007</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-SARS-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task creates the PAYEService which calculates Pay-As-You-Earn tax for employees
according to 2025 South African SARS tax tables. The service implements the full PAYE
calculation including tax brackets, primary/secondary rebates, medical aid tax credits,
and annualization for irregular payments. All calculations use Decimal.js with banker's
rounding to ensure cent-accurate deductions matching SARS requirements.
</context>

<input_context_files>
  <file purpose="technical_spec">specs/technical/api-contracts.md#SarsService</file>
  <file purpose="paye_requirements">specs/requirements/sars-requirements.md</file>
  <file purpose="payroll_entity">src/database/entities/payroll.entity.ts</file>
  <file purpose="staff_entity">src/database/entities/staff.entity.ts</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
</input_context_files>

<prerequisites>
  <check>TASK-SARS-001 completed (Staff and Payroll entities exist)</check>
  <check>Decimal.js library installed</check>
  <check>2025 SARS tax tables available</check>
  <check>TypeScript compilation working</check>
</prerequisites>

<scope>
  <in_scope>
    - Create PAYEService class in src/core/sars/
    - Implement calculatePAYE method (main PAYE calculation)
    - Implement getTaxBracket method (determine applicable bracket)
    - Implement calculateRebate method (primary/secondary/tertiary)
    - Implement calculateMedicalCredits method (per SARS formula)
    - Implement annualizeEarnings method (for irregular pay)
    - Use 2025 SARS tax tables and thresholds
    - Use Decimal.js banker's rounding for all calculations
    - Handle monthly, weekly, daily, and hourly pay frequencies
    - Support medical aid tax credits (R364/R246 per member 2025)
    - Create PAYECalculationResult interface
    - Create TaxBracket interface
    - Unit tests with 2025 tax scenarios
  </in_scope>
  <out_of_scope>
    - EMP201 document generation (TASK-SARS-015)
    - IRP5 certificate generation (TASK-SARS-016)
    - API endpoints
    - Database persistence
    - Historical tax table support
    - Non-resident tax calculations
    - Directors' remuneration special rules
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/sars/paye.service.ts">
      import Decimal from 'decimal.js';

      interface TaxBracket {
        minIncome: Decimal;
        maxIncome: Decimal | null;
        baseAmount: Decimal;
        rate: Decimal;
      }

      interface PAYECalculationResult {
        grossIncome: Decimal;
        annualizedIncome: Decimal;
        taxBeforeRebates: Decimal;
        primaryRebate: Decimal;
        secondaryRebate: Decimal;
        tertiaryRebate: Decimal;
        medicalCredits: Decimal;
        netPAYE: Decimal;
        effectiveRate: Decimal;
        bracket: TaxBracket;
      }

      enum RebateType {
        PRIMARY = 'PRIMARY',
        SECONDARY = 'SECONDARY',
        TERTIARY = 'TERTIARY'
      }

      @Injectable()
      export class PAYEService {
        private readonly TAX_BRACKETS_2025: TaxBracket[];
        private readonly PRIMARY_REBATE = new Decimal('17235'); // 2025
        private readonly SECONDARY_REBATE = new Decimal('9444'); // Age 65+
        private readonly TERTIARY_REBATE = new Decimal('3145'); // Age 75+
        private readonly MEDICAL_CREDIT_MAIN = new Decimal('364'); // 2025
        private readonly MEDICAL_CREDIT_DEPENDENT = new Decimal('246'); // 2025

        async calculatePAYE(
          grossIncome: Decimal,
          payFrequency: PayFrequency,
          dateOfBirth: Date,
          medicalAidMembers: number
        ): Promise&lt;PAYECalculationResult&gt;;

        getTaxBracket(annualIncome: Decimal): TaxBracket;

        calculateRebate(
          dateOfBirth: Date,
          rebateType?: RebateType
        ): Decimal;

        calculateMedicalCredits(
          medicalAidMembers: number
        ): Decimal;

        annualizeEarnings(
          grossIncome: Decimal,
          payFrequency: PayFrequency
        ): Decimal;

        private calculateAge(dateOfBirth: Date): number;
        private calculateTaxOnIncome(annualIncome: Decimal, bracket: TaxBracket): Decimal;
      }
    </signature>
    <signature file="src/core/sars/constants/tax-tables.constants.ts">
      // 2025 SARS Tax Tables
      export const TAX_BRACKETS_2025: TaxBracket[] = [
        {
          minIncome: new Decimal(0),
          maxIncome: new Decimal(237100),
          baseAmount: new Decimal(0),
          rate: new Decimal(0.18)
        },
        {
          minIncome: new Decimal(237101),
          maxIncome: new Decimal(370500),
          baseAmount: new Decimal(42678),
          rate: new Decimal(0.26)
        },
        {
          minIncome: new Decimal(370501),
          maxIncome: new Decimal(512800),
          baseAmount: new Decimal(77362),
          rate: new Decimal(0.31)
        },
        {
          minIncome: new Decimal(512801),
          maxIncome: new Decimal(673000),
          baseAmount: new Decimal(121475),
          rate: new Decimal(0.36)
        },
        {
          minIncome: new Decimal(673001),
          maxIncome: new Decimal(857900),
          baseAmount: new Decimal(179147),
          rate: new Decimal(0.39)
        },
        {
          minIncome: new Decimal(857901),
          maxIncome: new Decimal(1817000),
          baseAmount: new Decimal(251258),
          rate: new Decimal(0.41)
        },
        {
          minIncome: new Decimal(1817001),
          maxIncome: null,
          baseAmount: new Decimal(644489),
          rate: new Decimal(0.45)
        }
      ];

      export const REBATES_2025 = {
        PRIMARY: new Decimal('17235'),
        SECONDARY: new Decimal('9444'),
        TERTIARY: new Decimal('3145')
      };

      export const MEDICAL_CREDITS_2025 = {
        MAIN_MEMBER: new Decimal('364'),
        FIRST_DEPENDENT: new Decimal('364'),
        ADDITIONAL_DEPENDENTS: new Decimal('246')
      };
    </signature>
  </signatures>

  <constraints>
    - Must use Decimal.js for ALL monetary calculations
    - Must use banker's rounding (ROUND_HALF_EVEN)
    - Must use 2025 SARS tax tables exactly as published
    - Must NOT use 'any' type anywhere
    - Primary rebate R17,235 (2025)
    - Secondary rebate R9,444 for age 65+ (2025)
    - Tertiary rebate R3,145 for age 75+ (2025)
    - Medical credit R364 for main member and first dependent (2025)
    - Medical credit R246 for additional dependents (2025)
    - Tax thresholds: &lt;65 = R95,750; 65-74 = R148,217; 75+ = R165,689 (2025)
    - Annualization: Monthly x12, Weekly x52, Daily x261, Hourly x2088
    - PAYE cannot be negative (floor at 0)
    - Age calculation uses current date vs date of birth
    - Medical credits are monthly (not annual)
    - Rebates are annual, must be pro-rated for monthly PAYE
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - Unit tests pass with 100% coverage
    - Monthly salary R30,000: PAYE = R5,056.25 (after rebates, no medical)
    - Age 67 employee gets primary + secondary rebate
    - Medical aid 3 members: Credit = R364 + R364 + R246 = R974/month
    - Annualization: R10,000 weekly = R520,000 annual
    - Tax bracket selection accurate for edge cases (R237,100 vs R237,101)
    - Banker's rounding applied to final PAYE amount
    - Zero income yields zero PAYE
    - Income below threshold (R95,750) yields zero PAYE after rebates
  </verification>
</definition_of_done>

<pseudo_code>
PAYEService Implementation (src/core/sars/paye.service.ts):

  Configure Decimal.js:
    Decimal.set({
      precision: 20,
      rounding: Decimal.ROUND_HALF_EVEN
    })

  calculatePAYE(grossIncome, payFrequency, dateOfBirth, medicalAidMembers):
    // Step 1: Annualize income
    annualIncome = annualizeEarnings(grossIncome, payFrequency)

    // Step 2: Determine tax bracket
    bracket = getTaxBracket(annualIncome)

    // Step 3: Calculate tax before rebates
    taxBeforeRebates = calculateTaxOnIncome(annualIncome, bracket)

    // Step 4: Calculate rebates based on age
    age = calculateAge(dateOfBirth)
    primaryRebate = REBATES_2025.PRIMARY
    secondaryRebate = age >= 65 ? REBATES_2025.SECONDARY : new Decimal(0)
    tertiaryRebate = age >= 75 ? REBATES_2025.TERTIARY : new Decimal(0)
    totalRebates = primaryRebate.plus(secondaryRebate).plus(tertiaryRebate)

    // Step 5: Annual tax after rebates
    annualTaxAfterRebates = taxBeforeRebates.minus(totalRebates)
    If annualTaxAfterRebates < 0:
      annualTaxAfterRebates = new Decimal(0)

    // Step 6: Convert to monthly PAYE
    monthlyPAYE = annualTaxAfterRebates.div(12)

    // Step 7: Apply medical aid tax credits
    medicalCredits = calculateMedicalCredits(medicalAidMembers)
    netPAYE = monthlyPAYE.minus(medicalCredits)
    If netPAYE < 0:
      netPAYE = new Decimal(0)

    // Step 8: Calculate effective rate
    effectiveRate = netPAYE.div(grossIncome).mul(100)

    Return PAYECalculationResult:
      grossIncome, annualizedIncome, taxBeforeRebates,
      primaryRebate, secondaryRebate, tertiaryRebate,
      medicalCredits, netPAYE, effectiveRate, bracket

  getTaxBracket(annualIncome: Decimal): TaxBracket:
    For each bracket in TAX_BRACKETS_2025:
      If annualIncome >= bracket.minIncome:
        If bracket.maxIncome is null OR annualIncome <= bracket.maxIncome:
          Return bracket

    // Fallback (should never reach)
    Return last bracket (highest)

  calculateRebate(dateOfBirth: Date, rebateType?: RebateType): Decimal:
    age = calculateAge(dateOfBirth)

    If rebateType specified:
      Return REBATES_2025[rebateType]

    // Calculate total applicable rebates
    total = REBATES_2025.PRIMARY
    If age >= 65:
      total = total.plus(REBATES_2025.SECONDARY)
    If age >= 75:
      total = total.plus(REBATES_2025.TERTIARY)

    Return total

  calculateMedicalCredits(medicalAidMembers: number): Decimal:
    If medicalAidMembers === 0:
      Return new Decimal(0)

    If medicalAidMembers === 1:
      // Main member only
      Return MEDICAL_CREDITS_2025.MAIN_MEMBER

    If medicalAidMembers === 2:
      // Main + first dependent
      Return MEDICAL_CREDITS_2025.MAIN_MEMBER
        .plus(MEDICAL_CREDITS_2025.FIRST_DEPENDENT)

    // Main + first dependent + additional dependents
    credits = MEDICAL_CREDITS_2025.MAIN_MEMBER
      .plus(MEDICAL_CREDITS_2025.FIRST_DEPENDENT)
      .plus(
        MEDICAL_CREDITS_2025.ADDITIONAL_DEPENDENTS
          .mul(medicalAidMembers - 2)
      )

    Return credits

  annualizeEarnings(grossIncome: Decimal, payFrequency: PayFrequency): Decimal:
    Switch payFrequency:
      Case MONTHLY:
        Return grossIncome.mul(12)
      Case WEEKLY:
        Return grossIncome.mul(52)
      Case DAILY:
        Return grossIncome.mul(261) // SA standard working days
      Case HOURLY:
        Return grossIncome.mul(2088) // 261 days * 8 hours
      Default:
        Throw error "Invalid pay frequency"

  private calculateAge(dateOfBirth: Date): number:
    today = new Date()
    age = today.getFullYear() - dateOfBirth.getFullYear()
    monthDiff = today.getMonth() - dateOfBirth.getMonth()

    If monthDiff < 0 OR (monthDiff === 0 AND today.getDate() < dateOfBirth.getDate()):
      age = age - 1

    Return age

  private calculateTaxOnIncome(annualIncome: Decimal, bracket: TaxBracket): Decimal:
    // Tax = Base Amount + (Income above threshold) * Rate
    If annualIncome <= 0:
      Return new Decimal(0)

    incomeAboveThreshold = annualIncome.minus(bracket.minIncome)
    If incomeAboveThreshold < 0:
      incomeAboveThreshold = new Decimal(0)

    tax = bracket.baseAmount.plus(
      incomeAboveThreshold.mul(bracket.rate)
    )

    Return tax

Constants:
  // 2025 SARS Tax Tables (see tax-tables.constants.ts)
  TAX_BRACKETS_2025: Array of 7 brackets
  REBATES_2025: { PRIMARY, SECONDARY, TERTIARY }
  MEDICAL_CREDITS_2025: { MAIN_MEMBER, FIRST_DEPENDENT, ADDITIONAL_DEPENDENTS }
  TAX_THRESHOLDS_2025:
    - Below 65: R95,750 (no tax)
    - 65-74: R148,217 (no tax)
    - 75+: R165,689 (no tax)
</pseudo_code>

<files_to_create>
  <file path="src/core/sars/paye.service.ts">PAYEService class with all methods</file>
  <file path="src/core/sars/constants/tax-tables.constants.ts">2025 SARS tax tables and rebates</file>
  <file path="src/core/sars/interfaces/paye.interface.ts">PAYE interfaces and enums</file>
  <file path="tests/core/sars/paye.service.spec.ts">Comprehensive unit tests with 2025 scenarios</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/sars/index.ts">Export PAYEService and interfaces</file>
</files_to_modify>

<validation_criteria>
  <criterion>PAYEService compiles without TypeScript errors</criterion>
  <criterion>All methods use Decimal.js for monetary calculations</criterion>
  <criterion>2025 SARS tax tables implemented exactly</criterion>
  <criterion>Banker's rounding applied to final PAYE amount</criterion>
  <criterion>Primary rebate R17,235 applied correctly</criterion>
  <criterion>Secondary rebate R9,444 applied for age 65+</criterion>
  <criterion>Tertiary rebate R3,145 applied for age 75+</criterion>
  <criterion>Medical credits R364/R364/R246 calculated correctly</criterion>
  <criterion>Tax thresholds prevent tax on low incomes</criterion>
  <criterion>Annualization accurate for all pay frequencies</criterion>
  <criterion>Age calculation handles leap years and edge cases</criterion>
  <criterion>PAYE never negative (floor at zero)</criterion>
  <criterion>Unit tests cover all 7 tax brackets</criterion>
  <criterion>No 'any' types used</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --grep "PAYEService"</command>
  <command>npm run lint -- src/core/sars/paye.service.ts</command>
</test_commands>

</task_spec>
