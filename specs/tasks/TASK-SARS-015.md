<task_spec id="TASK-SARS-015" version="1.0">

<metadata>
  <title>EMP201 Generation Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>32</sequence>
  <implements>
    <requirement_ref>REQ-SARS-009</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-SARS-012</task_ref>
    <task_ref>TASK-SARS-013</task_ref>
    <task_ref>TASK-SARS-002</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
</metadata>

<context>
This task creates the EMP201Service which generates the South African EMP201 monthly
employer reconciliation return. The service aggregates all payroll records for a month,
calculates total PAYE and UIF contributions using PAYEService and UIFService, validates
employee data, and generates the EMP201 document structure according to SARS
specifications. The EMP201 is submitted monthly by employers to declare total employee
taxes and UIF collected. All calculations use Decimal.js with banker's rounding.
</context>

<input_context_files>
  <file purpose="technical_spec">specs/technical/api-contracts.md#SarsService</file>
  <file purpose="emp201_requirements">specs/requirements/sars-requirements.md</file>
  <file purpose="paye_service">src/core/sars/paye.service.ts</file>
  <file purpose="uif_service">src/core/sars/uif.service.ts</file>
  <file purpose="payroll_entity">src/database/entities/payroll.entity.ts</file>
  <file purpose="staff_entity">src/database/entities/staff.entity.ts</file>
  <file purpose="sars_submission_entity">src/database/entities/sars-submission.entity.ts</file>
  <file purpose="naming_conventions">specs/constitution.md#coding_standards</file>
</input_context_files>

<prerequisites>
  <check>TASK-SARS-012 completed (PAYEService exists)</check>
  <check>TASK-SARS-013 completed (UIFService exists)</check>
  <check>TASK-SARS-002 completed (SarsSubmission entity exists)</check>
  <check>Decimal.js library installed</check>
  <check>TypeScript compilation working</check>
</prerequisites>

<scope>
  <in_scope>
    - Create EMP201Service class in src/core/sars/
    - Implement generateEMP201 method (main generation logic)
    - Implement aggregatePayroll method (sum all payroll for month)
    - Implement validateEmployeeData method (validate staff records)
    - Implement generateDocument method (create EMP201 structure)
    - Use PAYEService and UIFService for calculations
    - Create EMP201Document interface matching SARS format
    - Create EMP201Summary interface for totals
    - Handle PAYE, UIF employee, UIF employer totals
    - Include SDL (Skills Development Levy) placeholder (1% of payroll)
    - Store submission as DRAFT with SarsSubmissionRepository
    - Use Decimal.js banker's rounding
    - Unit tests with multi-employee scenarios
  </in_scope>
  <out_of_scope>
    - API endpoints
    - PDF rendering of EMP201
    - eFiling integration
    - Historical period submissions
    - EMP501 annual reconciliation
    - ETI (Employment Tax Incentive) calculations
    - EMP201 amendment logic
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="src/core/sars/emp201.service.ts">
      import Decimal from 'decimal.js';
      import { PAYEService } from './paye.service';
      import { UIFService } from './uif.service';

      interface EMP201Summary {
        employeeCount: number;
        totalGrossRemuneration: Decimal;
        totalPAYE: Decimal;
        totalUIFEmployee: Decimal;
        totalUIFEmployer: Decimal;
        totalUIF: Decimal;
        totalSDL: Decimal;
        totalDue: Decimal;
      }

      interface EMP201EmployeeRecord {
        staffId: string;
        employeeNumber: string | null;
        fullName: string;
        idNumber: string;
        taxNumber: string | null;
        grossRemuneration: Decimal;
        paye: Decimal;
        uifEmployee: Decimal;
        uifEmployer: Decimal;
      }

      interface EMP201Document {
        submissionId: string;
        tenantId: string;
        payeReference: string;
        periodMonth: string;
        summary: EMP201Summary;
        employees: EMP201EmployeeRecord[];
        validationIssues: string[];
        generatedAt: Date;
      }

      @Injectable()
      export class EMP201Service {
        private readonly SDL_RATE = new Decimal('0.01'); // 1% SDL

        constructor(
          private payeService: PAYEService,
          private uifService: UIFService,
          private payrollRepository: PayrollRepository,
          private staffRepository: StaffRepository,
          private sarsSubmissionRepository: SarsSubmissionRepository
        ) {}

        async generateEMP201(
          tenantId: string,
          periodMonth: string
        ): Promise&lt;SarsSubmission&gt;;

        async aggregatePayroll(
          tenantId: string,
          periodMonth: string
        ): Promise&lt;EMP201Summary&gt;;

        validateEmployeeData(
          staff: Staff[],
          payrolls: Payroll[]
        ): string[];

        generateDocument(
          tenantId: string,
          payeReference: string,
          periodMonth: string,
          summary: EMP201Summary,
          employees: EMP201EmployeeRecord[],
          validationIssues: string[]
        ): EMP201Document;

        private calculateSDL(totalGross: Decimal): Decimal;
      }
    </signature>
    <signature file="src/core/sars/interfaces/emp201.interface.ts">
      export interface EMP201Summary {
        employeeCount: number;
        totalGrossRemuneration: Decimal;
        totalPAYE: Decimal;
        totalUIFEmployee: Decimal;
        totalUIFEmployer: Decimal;
        totalUIF: Decimal;
        totalSDL: Decimal;
        totalDue: Decimal;
      }

      export interface EMP201EmployeeRecord {
        staffId: string;
        employeeNumber: string | null;
        fullName: string;
        idNumber: string;
        taxNumber: string | null;
        grossRemuneration: Decimal;
        paye: Decimal;
        uifEmployee: Decimal;
        uifEmployer: Decimal;
      }

      export interface EMP201Document {
        submissionId: string;
        tenantId: string;
        payeReference: string;
        periodMonth: string;
        summary: EMP201Summary;
        employees: EMP201EmployeeRecord[];
        validationIssues: string[];
        generatedAt: Date;
      }
    </signature>
  </signatures>

  <constraints>
    - Must use Decimal.js for ALL monetary calculations
    - Must use banker's rounding (ROUND_HALF_EVEN)
    - Must aggregate all approved payroll records for month
    - SDL rate is 1% of gross payroll (2025)
    - Must NOT use 'any' type anywhere
    - Must validate all staff have ID numbers
    - Must warn if staff missing tax numbers
    - Total due = PAYE + UIF Employee + UIF Employer + SDL
    - Period must be in format "YYYY-MM"
    - Must include employee-level breakdown
    - Must flag validation issues but not block generation
    - Document must be stored as JSON in sars_submissions table
    - Status must be DRAFT initially
    - Employee count must match number of unique staff in payroll
    - All totals must reconcile to employee records
  </constraints>

  <verification>
    - TypeScript compiles without errors
    - Unit tests pass with 100% coverage
    - 5 employees, avg R15,000 gross: Reasonable PAYE, UIF, SDL totals
    - Total due = PAYE + UIF + SDL
    - Employee count matches unique staff
    - Missing tax number triggers warning, not error
    - Banker's rounding applied to all calculations
    - SDL = 1% of total gross remuneration
    - UIF capped at R177.12 per employee
    - Submission stored with DRAFT status
    - Period format validated (YYYY-MM)
    - Employee records include all payroll for month
    - Validation issues listed in document
  </verification>
</definition_of_done>

<pseudo_code>
EMP201Service Implementation (src/core/sars/emp201.service.ts):

  Configure Decimal.js:
    Decimal.set({
      precision: 20,
      rounding: Decimal.ROUND_HALF_EVEN
    })

  generateEMP201(tenantId, periodMonth):
    // Step 1: Validate period format
    If !periodMonth.match(/^\d{4}-\d{2}$/):
      Throw error "Invalid period format (expected YYYY-MM)"

    // Step 2: Get tenant details
    tenant = await tenantRepository.findById(tenantId)
    If !tenant.payeReference:
      Throw error "Tenant PAYE reference not configured"

    // Step 3: Parse period dates
    periodStart = startOfMonth(parseISO(periodMonth + '-01'))
    periodEnd = endOfMonth(periodStart)

    // Step 4: Get approved payroll records for month
    payrolls = await payrollRepository.findByPeriod(
      tenantId,
      periodStart,
      periodEnd,
      { status: 'APPROVED' }
    )

    If payrolls.length === 0:
      Throw error "No approved payroll records for period"

    // Step 5: Get staff records
    staffIds = payrolls.map(p => p.staffId)
    staff = await staffRepository.findByIds(staffIds)

    // Step 6: Validate employee data
    validationIssues = validateEmployeeData(staff, payrolls)

    // Step 7: Build employee records with calculations
    employees = []
    totalGross = new Decimal(0)
    totalPAYE = new Decimal(0)
    totalUIFEmployee = new Decimal(0)
    totalUIFEmployer = new Decimal(0)

    For each payroll in payrolls:
      staffRecord = staff.find(s => s.id === payroll.staffId)

      employeeRecord = {
        staffId: staffRecord.id,
        employeeNumber: staffRecord.employeeNumber,
        fullName: `${staffRecord.firstName} ${staffRecord.lastName}`,
        idNumber: staffRecord.idNumber,
        taxNumber: staffRecord.taxNumber,
        grossRemuneration: new Decimal(payroll.grossSalaryCents).div(100),
        paye: new Decimal(payroll.payeCents).div(100),
        uifEmployee: new Decimal(payroll.uifEmployeeCents).div(100),
        uifEmployer: new Decimal(payroll.uifEmployerCents).div(100)
      }

      employees.push(employeeRecord)

      totalGross = totalGross.plus(employeeRecord.grossRemuneration)
      totalPAYE = totalPAYE.plus(employeeRecord.paye)
      totalUIFEmployee = totalUIFEmployee.plus(employeeRecord.uifEmployee)
      totalUIFEmployer = totalUIFEmployer.plus(employeeRecord.uifEmployer)

    // Step 8: Calculate SDL
    totalSDL = calculateSDL(totalGross)

    // Step 9: Create summary
    summary = {
      employeeCount: employees.length,
      totalGrossRemuneration: totalGross,
      totalPAYE,
      totalUIFEmployee,
      totalUIFEmployer,
      totalUIF: totalUIFEmployee.plus(totalUIFEmployer),
      totalSDL,
      totalDue: totalPAYE.plus(totalUIFEmployee).plus(totalUIFEmployer).plus(totalSDL)
    }

    // Step 10: Generate document
    document = generateDocument(
      tenantId,
      tenant.payeReference,
      periodMonth,
      summary,
      employees,
      validationIssues
    )

    // Step 11: Store submission as DRAFT
    submission = await sarsSubmissionRepository.create({
      tenantId,
      submissionType: 'EMP201',
      period: periodMonth,
      status: 'DRAFT',
      documentData: JSON.stringify(document),
      flaggedItemsCount: validationIssues.length
    })

    Return submission

  aggregatePayroll(tenantId, periodMonth):
    // Get payrolls and calculate totals
    periodStart = startOfMonth(parseISO(periodMonth + '-01'))
    periodEnd = endOfMonth(periodStart)

    payrolls = await payrollRepository.findByPeriod(tenantId, periodStart, periodEnd)

    summary = {
      employeeCount: new Set(payrolls.map(p => p.staffId)).size,
      totalGrossRemuneration: new Decimal(0),
      totalPAYE: new Decimal(0),
      totalUIFEmployee: new Decimal(0),
      totalUIFEmployer: new Decimal(0),
      totalUIF: new Decimal(0),
      totalSDL: new Decimal(0),
      totalDue: new Decimal(0)
    }

    For each payroll in payrolls:
      summary.totalGrossRemuneration = summary.totalGrossRemuneration
        .plus(new Decimal(payroll.grossSalaryCents).div(100))
      summary.totalPAYE = summary.totalPAYE
        .plus(new Decimal(payroll.payeCents).div(100))
      summary.totalUIFEmployee = summary.totalUIFEmployee
        .plus(new Decimal(payroll.uifEmployeeCents).div(100))
      summary.totalUIFEmployer = summary.totalUIFEmployer
        .plus(new Decimal(payroll.uifEmployerCents).div(100))

    summary.totalUIF = summary.totalUIFEmployee.plus(summary.totalUIFEmployer)
    summary.totalSDL = calculateSDL(summary.totalGrossRemuneration)
    summary.totalDue = summary.totalPAYE
      .plus(summary.totalUIF)
      .plus(summary.totalSDL)

    Return summary

  validateEmployeeData(staff, payrolls):
    issues = []

    For each staffRecord in staff:
      // Check ID number
      If !staffRecord.idNumber OR staffRecord.idNumber.length !== 13:
        issues.push(`Employee ${staffRecord.firstName} ${staffRecord.lastName}: Invalid ID number`)

      // Warn about missing tax number
      If !staffRecord.taxNumber:
        issues.push(`Employee ${staffRecord.firstName} ${staffRecord.lastName}: Missing tax number`)

    // Check all payrolls have matching staff
    For each payroll in payrolls:
      If !staff.find(s => s.id === payroll.staffId):
        issues.push(`Payroll ${payroll.id}: Staff record not found`)

    Return issues

  generateDocument(tenantId, payeReference, periodMonth, summary, employees, validationIssues):
    Return EMP201Document:
      submissionId: uuid()
      tenantId
      payeReference
      periodMonth
      summary
      employees
      validationIssues
      generatedAt: new Date()

  private calculateSDL(totalGross: Decimal): Decimal:
    // SDL = 1% of total gross payroll
    sdl = totalGross.mul(SDL_RATE)
    Return sdl

Unit Tests (tests/core/sars/emp201.service.spec.ts):
  Test case: Single employee
    Input:
      - 1 employee, R20,000 gross
      - PAYE R2,500, UIF R200 (R100 each)
    Expected:
      - employeeCount: 1
      - totalGross: R20,000
      - totalPAYE: R2,500
      - totalUIF: R200
      - totalSDL: R200 (1%)
      - totalDue: R2,900

  Test case: Multiple employees
    Input:
      - 5 employees, various salaries
    Expected:
      - employeeCount: 5
      - Totals sum correctly
      - Each employee record present

  Test case: Missing tax number
    Input:
      - Employee without tax number
    Expected:
      - Warning in validationIssues
      - Document still generated

  Test case: Invalid ID number
    Input:
      - Employee with 12-digit ID
    Expected:
      - Error in validationIssues

  Test case: No payrolls
    Input:
      - Period with no approved payroll
    Expected:
      - Error thrown

  Test case: Invalid period format
    Input: "2025/01" instead of "2025-01"
    Expected: ValidationError thrown
</pseudo_code>

<files_to_create>
  <file path="src/core/sars/emp201.service.ts">EMP201Service class</file>
  <file path="src/core/sars/interfaces/emp201.interface.ts">EMP201 interfaces</file>
  <file path="tests/core/sars/emp201.service.spec.ts">Comprehensive unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="src/core/sars/index.ts">Export EMP201Service and interfaces</file>
</files_to_modify>

<validation_criteria>
  <criterion>EMP201Service compiles without TypeScript errors</criterion>
  <criterion>Decimal.js used for all monetary calculations</criterion>
  <criterion>Banker's rounding applied throughout</criterion>
  <criterion>SDL calculated as 1% of gross payroll</criterion>
  <criterion>Total due = PAYE + UIF + SDL</criterion>
  <criterion>Employee count matches unique staff</criterion>
  <criterion>All employee records included</criterion>
  <criterion>Validation issues logged but don't block generation</criterion>
  <criterion>Missing tax numbers trigger warnings</criterion>
  <criterion>Invalid ID numbers trigger errors</criterion>
  <criterion>Submission stored with DRAFT status</criterion>
  <criterion>Period format validated (YYYY-MM)</criterion>
  <criterion>Unit tests cover single and multiple employees</criterion>
  <criterion>No 'any' types used</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --grep "EMP201Service"</command>
  <command>npm run lint -- src/core/sars/emp201.service.ts</command>
</test_commands>

</task_spec>
