<task_spec id="TASK-SARS-016" version="3.0">

<metadata>
  <title>IRP5 Certificate Generation Service</title>
  <status>COMPLETE</status>
  <layer>logic</layer>
  <sequence>33</sequence>
  <implements>
    <requirement_ref>REQ-SARS-010</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-SARS-012</task_ref>
    <task_ref>TASK-SARS-001</task_ref>
  </depends_on>
  <completed_date>2025-12-21</completed_date>
  <test_count>1176</test_count>
</metadata>

<context>
Irp5Service generates South African IRP5 employee tax certificates.

**What it does:**
- Aggregates year-to-date payroll data for a single employee
- Populates IRP5 code fields (3601, 3602, 3605, 3606, 3615, 3696, etc.)
- Calculates totals for income, PAYE, UIF
- Validates employee and employer details
- Supports bulk generation for all employees in a tenant

**CRITICAL RULES:**
- ALL monetary values are CENTS (integers)
- Use Decimal.js ONLY for calculations, return integers
- Banker's rounding (ROUND_HALF_EVEN)
- Tax year format: YYYY (e.g., "2025" = March 2024 to Feb 2025)
- SA tax year: March 1 (year-1) to February 28/29 (year)
- Only include PAID payrolls in YTD calculations
- Code 3615 MUST equal sum of 3601 + 3602 + 3605 + 3606
- Certificate ID format: `{tenantId}-{staffId}-{taxYear}`
- NO backwards compatibility - fail fast with descriptive errors
</context>

<project_structure>
ACTUAL file locations (DO NOT use src/core/sars/ - it doesn't exist):

```
src/database/
├── services/
│   ├── paye.service.ts          # PayeService (dependency)
│   └── irp5.service.ts          # Irp5Service class
├── dto/
│   └── irp5.dto.ts              # IRP5 specific DTOs
├── constants/
│   └── irp5.constants.ts        # IRP5 codes, tax year config
└── database.module.ts           # Add to providers and exports

tests/database/services/
└── irp5.service.spec.ts         # Integration tests with real DB

prisma/schema.prisma:
- Staff model with payroll relation
- Payroll model with PAID status
- Tenant model with registrationNumber (PAYE reference)
```
</project_structure>

<existing_infrastructure>
Already in prisma/schema.prisma:
```prisma
enum PayrollStatus {
  DRAFT
  APPROVED
  PAID
}

model Staff {
  id              String    @id @default(uuid())
  tenantId        String    @map("tenant_id")
  tenant          Tenant    @relation(...)
  employeeNumber  String?   @map("employee_number")
  firstName       String    @map("first_name")
  lastName        String    @map("last_name")
  idNumber        String    @map("id_number")
  taxNumber       String?   @map("tax_number")
  dateOfBirth     DateTime  @map("date_of_birth") @db.Date
  payrolls        Payroll[]
}

model Payroll {
  id                    String        @id @default(uuid())
  staffId               String        @map("staff_id")
  staff                 Staff         @relation(...)
  payPeriodStart        DateTime      @map("pay_period_start") @db.Date
  payPeriodEnd          DateTime      @map("pay_period_end") @db.Date
  status                PayrollStatus @default(DRAFT)
  basicSalaryCents      Int           @map("basic_salary_cents")
  overtimeCents         Int           @default(0) @map("overtime_cents")
  bonusCents            Int           @default(0) @map("bonus_cents")
  otherEarningsCents    Int           @default(0) @map("other_earnings_cents")
  grossSalaryCents      Int           @map("gross_salary_cents")
  payeCents             Int           @map("paye_cents")
  uifEmployeeCents      Int           @map("uif_employee_cents")
  medicalAidCreditCents Int           @default(0) @map("medical_aid_credit_cents")
}

model Tenant {
  name                String
  tradingName         String?       @map("trading_name")
  registrationNumber  String?       @map("registration_number")
}
```

Dependencies to inject:
- PrismaService
- PayeService
</existing_infrastructure>

<files_created>
1. src/database/constants/irp5.constants.ts
2. src/database/dto/irp5.dto.ts
3. src/database/services/irp5.service.ts
4. tests/database/services/irp5.service.spec.ts
</files_created>

<files_modified>
1. src/database/services/index.ts - `export { Irp5Service } from './irp5.service';`
2. src/database/dto/index.ts - `export * from './irp5.dto';`
3. src/database/database.module.ts - Add Irp5Service to providers and exports arrays
</files_modified>

<implementation_reference>

## Constants (src/database/constants/irp5.constants.ts)
```typescript
export const IRP5_INCOME_CODES = {
  CODE_3601: '3601',  // Basic salary
  CODE_3602: '3602',  // Overtime payments
  CODE_3605: '3605',  // Taxable allowances
  CODE_3606: '3606',  // Bonus / 13th cheque
  CODE_3615: '3615',  // Total income (remuneration)
};

export const IRP5_DEDUCTION_CODES = {
  CODE_3696: '3696',  // PAYE deducted
  CODE_3701: '3701',  // Pension fund contributions
  CODE_3702: '3702',  // Retirement annuity contributions
  CODE_3713: '3713',  // Medical aid contributions
  CODE_3714: '3714',  // Medical aid tax credits
  CODE_3810: '3810',  // UIF employee contributions
};

export const IRP5_CONSTANTS = {
  TAX_YEAR_FORMAT_REGEX: /^\d{4}$/,
  SA_ID_NUMBER_REGEX: /^\d{13}$/,
  TAX_NUMBER_REGEX: /^\d{10}$/,
};

export const TAX_YEAR_CONFIG = {
  START_MONTH: 2,   // March (0-indexed)
  END_MONTH: 1,     // February (0-indexed)
  START_DAY: 1,
};
```

## DTO (src/database/dto/irp5.dto.ts)
```typescript
export interface Irp5Fields {
  code3601Cents: number;  // Basic salary
  code3602Cents: number;  // Overtime
  code3605Cents: number;  // Allowances
  code3606Cents: number;  // Bonus
  code3615Cents: number;  // Total remuneration (sum of above)
  code3696Cents: number;  // PAYE deducted
  code3701Cents: number;  // Pension (not tracked)
  code3702Cents: number;  // RA (not tracked)
  code3713Cents: number;  // Medical aid (not tracked)
  code3714Cents: number;  // Medical credits
  code3810Cents: number;  // UIF employee
}

export interface Irp5EmployeeDetails {
  employeeNumber: string | null;
  firstName: string;
  lastName: string;
  idNumber: string;
  taxNumber: string | null;
  dateOfBirth: Date;
}

export interface Irp5EmployerDetails {
  name: string;
  payeReference: string | null;
  registrationNumber: string | null;
}

export interface Irp5TaxPeriod {
  startDate: Date;
  endDate: Date;
  periodsWorked: number;
}

export interface Irp5Certificate {
  certificateId: string;
  tenantId: string;
  staffId: string;
  taxYear: string;
  employeeDetails: Irp5EmployeeDetails;
  employerDetails: Irp5EmployerDetails;
  taxPeriod: Irp5TaxPeriod;
  fields: Irp5Fields;
  totalRemunerationCents: number;
  totalPayeCents: number;
  totalUifCents: number;
  generatedAt: Date;
}

export interface Irp5YtdTotals {
  totalBasicCents: number;
  totalOvertimeCents: number;
  totalBonusCents: number;
  totalOtherEarningsCents: number;
  totalGrossCents: number;
  totalPayeCents: number;
  totalUifCents: number;
  totalMedicalCreditsCents: number;
  periodCount: number;
}

export interface GenerateIrp5Dto {
  staffId: string;
  taxYear: string;
}

export interface Irp5ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
```

## Service Methods
```typescript
@Injectable()
export class Irp5Service {
  private readonly logger = new Logger(Irp5Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payeService: PayeService,
  ) {}

  // Generate IRP5 for single employee
  async generateIrp5(dto: GenerateIrp5Dto): Promise<Irp5Certificate>;

  // Calculate year-to-date totals
  calculateYtd(payrolls: {
    basicSalaryCents: number;
    overtimeCents: number;
    bonusCents: number;
    otherEarningsCents: number;
    grossSalaryCents: number;
    payeCents: number;
    uifEmployeeCents: number;
    medicalAidCreditCents: number;
  }[]): Irp5YtdTotals;

  // Populate IRP5 code fields from YTD totals
  populateFields(ytdTotals: Irp5YtdTotals): Irp5Fields;

  // Validate certificate for submission
  validateForSubmission(certificate: Irp5Certificate): Irp5ValidationResult;

  // Get tax year date range
  getTaxYearDates(taxYear: string): { startDate: Date; endDate: Date };

  // Check if leap year
  isLeapYear(year: number): boolean;

  // Generate certificates for all employees in tenant
  async generateBulkIrp5(tenantId: string, taxYear: string): Promise<Irp5Certificate[]>;
}
```
</implementation_reference>

<test_requirements>
CRITICAL: Tests use REAL PostgreSQL database.

```typescript
beforeAll(async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [PrismaService, PayeService, Irp5Service],
  }).compile();
  // ...
});

beforeEach(async () => {
  // Clean in FK order - VERY IMPORTANT
  await prisma.sarsSubmission.deleteMany({});
  await prisma.reminder.deleteMany({});
  await prisma.reconciliation.deleteMany({});
  await prisma.payroll.deleteMany({});
  await prisma.staff.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.invoiceLine.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.enrollment.deleteMany({});
  await prisma.feeStructure.deleteMany({});
  await prisma.child.deleteMany({});
  await prisma.parent.deleteMany({});
  await prisma.payeePattern.deleteMany({});
  await prisma.categorization.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});

  // Create tenant and staff with test data
  testTenant = await prisma.tenant.create({
    data: {
      name: 'IRP5 Test Creche',
      tradingName: 'Happy Kids Creche',
      registrationNumber: '1234567ABC',
      // ...
    },
  });

  testStaff = await prisma.staff.create({
    data: {
      tenantId: testTenant.id,
      firstName: 'John',
      lastName: 'Smith',
      idNumber: '8501015800083',
      taxNumber: '1234567890',
      dateOfBirth: new Date('1985-01-01'),
      // ...
    },
  });
});
```

**Test scenarios implemented:**
- Full year employment: 12 months @ R20,000 → code3601 = R240,000
- Mid-year start: 8 months worked → Only those months in YTD
- With bonuses: R10,000 bonus in December → code3606 = R10,000
- With overtime: Monthly overtime → code3602 populated
- Tax year dates: "2025" → March 1, 2024 to Feb 28, 2025
- Leap year: "2024" → End date Feb 29, 2024
- Field consistency: code3615 = 3601 + 3602 + 3605 + 3606
- Missing tax number: Validation error
- Invalid ID number: Validation error (not 13 digits)
- No paid payrolls: Error thrown
- Invalid tax year format: Error thrown
- Bulk generation: Generate for all employees with payrolls
- periodsWorked: Count of payroll records
</test_requirements>

<lessons_learned>
1. **Tax year format is YYYY, not YYYY-YY** - Just the end year (e.g., "2025" means March 2024 - Feb 2025)
2. **Tax year calculation**: `new Date(year - 1, 2, 1)` for start, `new Date(year, 2, 0)` for end (last day of Feb)
3. **code3602 for overtime** - Spec originally missed this, it's separate from allowances
4. **code3615 MUST equal sum of income codes** - Validation error if mismatch
5. **Only PAID payrolls** - Filter by PayrollStatus.PAID, not APPROVED
6. **periodsWorked = payroll count** - Number of pay periods in the tax year
7. **certificateId format** - Use `{tenantId}-{staffId}-{taxYear}` for uniqueness
8. **registrationNumber is PAYE reference** - Same as EMP201
9. **Use tradingName for display** - Fall back to name if tradingName not set
10. **Bulk generation handles errors gracefully** - Log errors, continue with other staff
11. **Feb end date with day 0** - `new Date(year, 2, 0)` gives last day of Feb (handles leap years)
12. **Date constructor for local dates** - Use `new Date(year, month, day)`, NOT string parsing
</lessons_learned>

<validation_completed>
- TypeScript compiles without errors (npm run build)
- Lint passes (npm run lint)
- All tests pass with real PostgreSQL database
- Tax year dates correct (March 1 - Feb 28/29)
- All IRP5 code fields populated correctly
- YTD calculations accurate
- Code 3615 equals sum of income codes
- Employee and employer details included
- Missing tax number triggers validation error
- Mid-year employment handled correctly
- Leap year handling correct
- Bulk generation works for all employees
- No 'any' types used
</validation_completed>

</task_spec>
