<task_spec id="TASK-SARS-016" version="1.0">

<metadata>
  <title>IRP5 Generation Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>33</sequence>
  <implements>
    <requirement_ref>REQ-SARS-010</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-SARS-012</task_ref>
    <task_ref>TASK-SARS-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task creates the IRP5Service which generates annual employee tax certificates
(IRP5/IT3a) for South African employees. The service aggregates year-to-date payroll
data, calculates annual totals for gross income, PAYE, UIF, and other deductions,
and generates the IRP5 certificate according to SARS specifications. IRP5 certificates
must be issued to employees by end of February for the previous tax year and submitted
to SARS for annual reconciliation. All calculations use Decimal.js with banker's
rounding for accuracy.
</context>

<input_context_files>
  <file purpose="technical_spec">specs/technical/api-contracts.md#SarsService</file>
  <file purpose="irp5_requirements">specs/requirements/sars-requirements.md</file>
  <file purpose="paye_service">src/core/sars/paye.service.ts</file>
  <file purpose="payroll_entity">src/database/entities/payroll.entity.ts</file>
  <file purpose="staff_entity">src/database/entities/staff.entity.ts</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
</input_context_files>

<prerequisites>
  <check>TASK-SARS-012 completed (PAYEService exists)</check>
  <check>TASK-SARS-001 completed (Staff and Payroll entities exist)</check>
  <check>Decimal.js library installed</check>
  <check>TypeScript compilation working</check>
</prerequisites>

<scope>
  <in_scope>
    - Create IRP5Service class in src/core/sars/
    - Implement generateIRP5 method (generate certificate for one employee)
    - Implement calculateYTD method (year-to-date totals)
    - Implement populateCertificate method (populate IRP5 fields)
    - Implement validateForSubmission method (validate certificate data)
    - Use PAYEService for tax calculations verification
    - Create IRP5Certificate interface matching SARS format
    - Create IRP5Fields interface for all required fields
    - Handle tax year period (March to February in SA)
    - Include all IRP5 code fields (3601-3810 series)
    - Support medical aid contributions and credits
    - Support retirement fund contributions
    - Use Decimal.js banker's rounding
    - Unit tests with annual scenarios
  </in_scope>
  <out_of_scope>
    - API endpoints
    - PDF rendering of IRP5
    - eFiling/EMP501 bulk submission
    - Multiple tax years
    - Fringe benefits calculations
    - Travel allowance calculations
    - Commission-based income
    - IRP5 amendments
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/sars/irp5.service.ts">
      import Decimal from 'decimal.js';
      import { PAYEService } from './paye.service';

      interface IRP5Fields {
        code3601: Decimal;  // Income - Basic salary
        code3605: Decimal;  // Income - Allowances
        code3606: Decimal;  // Income - Bonuses
        code3615: Decimal;  // Total income (remuneration)
        code3696: Decimal;  // PAYE deducted
        code3701: Decimal;  // Pension fund contributions
        code3702: Decimal;  // Retirement annuity contributions
        code3713: Decimal;  // Medical aid contributions
        code3714: Decimal;  // Medical aid tax credits
        code3810: Decimal;  // UIF contributions (employee)
      }

      interface IRP5Certificate {
        certificateId: string;
        tenantId: string;
        staffId: string;
        taxYear: string;
        employeeDetails: {
          employeeNumber: string | null;
          firstName: string;
          lastName: string;
          idNumber: string;
          taxNumber: string | null;
          dateOfBirth: Date;
        };
        employerDetails: {
          name: string;
          payeReference: string;
          registrationNumber: string;
        };
        taxPeriod: {
          startDate: Date;
          endDate: Date;
        };
        fields: IRP5Fields;
        totalRemuneration: Decimal;
        totalPAYE: Decimal;
        totalUIF: Decimal;
        generatedAt: Date;
      }

      @Injectable()
      export class IRP5Service {
        constructor(
          private payeService: PAYEService,
          private payrollRepository: PayrollRepository,
          private staffRepository: StaffRepository,
          private tenantRepository: TenantRepository
        ) {}

        async generateIRP5(
          staffId: string,
          taxYear: string
        ): Promise&lt;IRP5Certificate&gt;;

        calculateYTD(
          payrolls: Payroll[]
        ): {
          totalGross: Decimal;
          totalPAYE: Decimal;
          totalUIF: Decimal;
          totalMedicalAid: Decimal;
          totalPension: Decimal;
          totalBonus: Decimal;
        };

        populateCertificate(
          staff: Staff,
          tenant: Tenant,
          taxYear: string,
          ytdTotals: any
        ): IRP5Certificate;

        validateForSubmission(
          certificate: IRP5Certificate
        ): ValidationResult;

        private getTaxYearDates(taxYear: string): { startDate: Date; endDate: Date };
      }
    </signature>
    <signature file="src/core/sars/interfaces/irp5.interface.ts">
      export interface IRP5Fields {
        code3601: Decimal;
        code3605: Decimal;
        code3606: Decimal;
        code3615: Decimal;
        code3696: Decimal;
        code3701: Decimal;
        code3702: Decimal;
        code3713: Decimal;
        code3714: Decimal;
        code3810: Decimal;
      }

      export interface IRP5Certificate {
        certificateId: string;
        tenantId: string;
        staffId: string;
        taxYear: string;
        employeeDetails: {
          employeeNumber: string | null;
          firstName: string;
          lastName: string;
          idNumber: string;
          taxNumber: string | null;
          dateOfBirth: Date;
        };
        employerDetails: {
          name: string;
          payeReference: string;
          registrationNumber: string;
        };
        taxPeriod: {
          startDate: Date;
          endDate: Date;
        };
        fields: IRP5Fields;
        totalRemuneration: Decimal;
        totalPAYE: Decimal;
        totalUIF: Decimal;
        generatedAt: Date;
      }
    </signature>
  </signatures>

  <constraints>
    - Must use Decimal.js for ALL monetary calculations
    - Must use banker's rounding (ROUND_HALF_EVEN)
    - Tax year runs March 1 to February 28/29 in South Africa
    - Must NOT use 'any' type anywhere
    - Code 3601 = Basic salary
    - Code 3605 = Allowances
    - Code 3606 = Bonuses
    - Code 3615 = Total remuneration (sum of 3601+3605+3606)
    - Code 3696 = PAYE deducted
    - Code 3701 = Pension fund contributions
    - Code 3713 = Medical aid contributions (employee portion)
    - Code 3714 = Medical aid tax credits
    - Code 3810 = UIF employee contributions
    - Must validate employee has tax number
    - Must validate employer has PAYE reference
    - Must include all 12 months of tax year
    - Must handle employees who started/ended mid-year
    - All amounts must be annual totals (not monthly)
    - Certificate ID must be unique per employee per tax year
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - Unit tests pass with 100% coverage
    - 12 months @ R20,000/month: Code 3601 = R240,000
    - YTD PAYE sum matches code 3696
    - YTD UIF sum matches code 3810
    - Tax year dates correct (Mar 1 - Feb 28/29)
    - Banker's rounding applied to all fields
    - Employee started mid-year: Only includes actual months worked
    - Missing tax number triggers validation error
    - Certificate includes employee and employer details
    - Medical aid contributions and credits calculated correctly
    - All code fields populated with Decimal values
    - Total remuneration (3615) = sum of income codes
  </verification>
</definition_of_done>

<pseudo_code>
IRP5Service Implementation (src/core/sars/irp5.service.ts):

  Configure Decimal.js:
    Decimal.set({
      precision: 20,
      rounding: Decimal.ROUND_HALF_EVEN
    })

  generateIRP5(staffId, taxYear):
    // Step 1: Get staff record
    staff = await staffRepository.findById(staffId)
    If !staff:
      Throw error "Staff not found"

    // Step 2: Get tax year date range
    { startDate, endDate } = getTaxYearDates(taxYear)

    // Step 3: Get all payroll records for tax year
    payrolls = await payrollRepository.findByStaffAndPeriod(
      staffId,
      startDate,
      endDate,
      { status: 'PAID' }
    )

    If payrolls.length === 0:
      Throw error "No paid payroll records for tax year"

    // Step 4: Calculate year-to-date totals
    ytdTotals = calculateYTD(payrolls)

    // Step 5: Get tenant/employer details
    tenant = await tenantRepository.findById(staff.tenantId)

    // Step 6: Populate certificate
    certificate = populateCertificate(staff, tenant, taxYear, ytdTotals)

    // Step 7: Validate certificate
    validationResult = validateForSubmission(certificate)
    If !validationResult.isValid:
      Log warnings/errors

    Return certificate

  calculateYTD(payrolls):
    totals = {
      totalGross: new Decimal(0),
      totalBasic: new Decimal(0),
      totalOvertime: new Decimal(0),
      totalBonus: new Decimal(0),
      totalPAYE: new Decimal(0),
      totalUIF: new Decimal(0),
      totalMedicalAid: new Decimal(0),
      totalPension: new Decimal(0),
      totalMedicalCredits: new Decimal(0)
    }

    For each payroll in payrolls:
      totals.totalGross = totals.totalGross
        .plus(new Decimal(payroll.grossSalaryCents).div(100))
      totals.totalBasic = totals.totalBasic
        .plus(new Decimal(payroll.basicSalaryCents).div(100))
      totals.totalOvertime = totals.totalOvertime
        .plus(new Decimal(payroll.overtimeCents).div(100))
      totals.totalBonus = totals.totalBonus
        .plus(new Decimal(payroll.bonusCents).div(100))
      totals.totalPAYE = totals.totalPAYE
        .plus(new Decimal(payroll.payeCents).div(100))
      totals.totalUIF = totals.totalUIF
        .plus(new Decimal(payroll.uifEmployeeCents).div(100))
      totals.totalMedicalCredits = totals.totalMedicalCredits
        .plus(new Decimal(payroll.medicalAidCreditCents).div(100))

    Return totals

  populateCertificate(staff, tenant, taxYear, ytdTotals):
    { startDate, endDate } = getTaxYearDates(taxYear)

    // Populate IRP5 code fields
    fields = {
      code3601: ytdTotals.totalBasic,                           // Basic salary
      code3605: ytdTotals.totalOvertime,                        // Allowances (overtime)
      code3606: ytdTotals.totalBonus,                           // Bonuses
      code3615: ytdTotals.totalGross,                           // Total remuneration
      code3696: ytdTotals.totalPAYE,                            // PAYE deducted
      code3701: new Decimal(0),                                 // Pension (future)
      code3702: new Decimal(0),                                 // RA (future)
      code3713: new Decimal(0),                                 // Medical aid (future)
      code3714: ytdTotals.totalMedicalCredits,                  // Medical credits
      code3810: ytdTotals.totalUIF                              // UIF employee
    }

    certificate = {
      certificateId: `${staff.tenantId}-${staff.id}-${taxYear}`,
      tenantId: staff.tenantId,
      staffId: staff.id,
      taxYear,
      employeeDetails: {
        employeeNumber: staff.employeeNumber,
        firstName: staff.firstName,
        lastName: staff.lastName,
        idNumber: staff.idNumber,
        taxNumber: staff.taxNumber,
        dateOfBirth: staff.dateOfBirth
      },
      employerDetails: {
        name: tenant.name,
        payeReference: tenant.payeReference,
        registrationNumber: tenant.registrationNumber
      },
      taxPeriod: {
        startDate,
        endDate
      },
      fields,
      totalRemuneration: ytdTotals.totalGross,
      totalPAYE: ytdTotals.totalPAYE,
      totalUIF: ytdTotals.totalUIF,
      generatedAt: new Date()
    }

    Return certificate

  validateForSubmission(certificate):
    errors = []
    warnings = []

    // Validate employee details
    If !certificate.employeeDetails.taxNumber:
      errors.push("Employee tax number is required")

    If !certificate.employeeDetails.idNumber OR
       certificate.employeeDetails.idNumber.length !== 13:
      errors.push("Valid SA ID number (13 digits) is required")

    // Validate employer details
    If !certificate.employerDetails.payeReference:
      errors.push("Employer PAYE reference is required")

    // Validate amounts
    If certificate.totalRemuneration <= 0:
      warnings.push("Total remuneration is zero or negative")

    // Validate field consistency
    expectedTotal = certificate.fields.code3601
      .plus(certificate.fields.code3605)
      .plus(certificate.fields.code3606)

    If !expectedTotal.equals(certificate.fields.code3615):
      errors.push("Code 3615 (total) doesn't match sum of income codes")

    Return {
      isValid: errors.length === 0,
      errors,
      warnings
    }

  private getTaxYearDates(taxYear: string): { startDate: Date; endDate: Date }:
    // SA tax year: March 1 (taxYear-1) to Feb 28/29 (taxYear)
    // Example: "2025" = March 1, 2024 to Feb 28, 2025

    year = parseInt(taxYear)
    startDate = new Date(year - 1, 2, 1) // March 1 (month 2 = March, 0-indexed)
    endDate = new Date(year, 1, 28)      // Feb 28 (check for leap year)

    // Check if leap year
    If isLeapYear(year):
      endDate = new Date(year, 1, 29)    // Feb 29

    Return { startDate, endDate }

Unit Tests (tests/core/sars/irp5.service.spec.ts):
  Test case: Full year employment
    Input:
      - 12 months @ R20,000/month
      - PAYE R2,500/month
      - UIF R200/month
    Expected:
      - code3601: R240,000
      - code3696: R30,000
      - code3810: R2,400
      - code3615: R240,000

  Test case: Mid-year start
    Input:
      - Employee started July (8 months)
      - R15,000/month
    Expected:
      - code3601: R120,000 (8 months only)
      - Correct totals for partial year

  Test case: With bonuses
    Input:
      - R20,000 basic/month
      - R10,000 bonus in December
    Expected:
      - code3601: R240,000
      - code3606: R10,000
      - code3615: R250,000

  Test case: Missing tax number
    Input:
      - Employee without tax number
    Expected:
      - ValidationError in result

  Test case: Tax year dates
    Input: taxYear = "2025"
    Expected:
      - startDate: March 1, 2024
      - endDate: Feb 28/29, 2025

  Test case: Leap year
    Input: taxYear = "2024"
    Expected:
      - endDate: Feb 29, 2024 (leap year)

  Test case: Field consistency
    Input:
      - Mismatched totals
    Expected:
      - Validation error for code 3615 mismatch
</pseudo_code>

<files_to_create>
  <file path="src/core/sars/irp5.service.ts">IRP5Service class</file>
  <file path="src/core/sars/interfaces/irp5.interface.ts">IRP5 interfaces</file>
  <file path="tests/core/sars/irp5.service.spec.ts">Comprehensive unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/sars/index.ts">Export IRP5Service and interfaces</file>
</files_to_modify>

<validation_criteria>
  <criterion>IRP5Service compiles without TypeScript errors</criterion>
  <criterion>Decimal.js used for all monetary calculations</criterion>
  <criterion>Banker's rounding applied throughout</criterion>
  <criterion>Tax year dates correct (March to February)</criterion>
  <criterion>All IRP5 code fields populated</criterion>
  <criterion>YTD calculations accurate</criterion>
  <criterion>Code 3615 equals sum of income codes</criterion>
  <criterion>Employee and employer details included</criterion>
  <criterion>Missing tax number triggers validation error</criterion>
  <criterion>Mid-year employment handled correctly</criterion>
  <criterion>Leap year handling correct</criterion>
  <criterion>Certificate ID unique per employee per tax year</criterion>
  <criterion>Unit tests cover full year, partial year, and bonuses</criterion>
  <criterion>No 'any' types used</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --grep "IRP5Service"</command>
  <command>npm run lint -- src/core/sars/irp5.service.ts</command>
</test_commands>

</task_spec>
