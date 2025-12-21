<task_spec id="TASK-SARS-015" version="3.0">

<metadata>
  <title>EMP201 Generation Service</title>
  <status>COMPLETE</status>
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
  <completed_date>2025-12-21</completed_date>
  <test_count>1155</test_count>
</metadata>

<context>
Emp201Service generates South African EMP201 monthly employer reconciliation returns.

**What it does:**
- Aggregates all approved payroll records for a month
- Calculates totals: PAYE, UIF (employee + employer), SDL
- Builds employee-level breakdown with validation
- Creates submission record with DRAFT status
- Calculates deadline (7th of following month)
- Handles SDL exemption (annual payroll < R500,000)

**CRITICAL RULES:**
- ALL monetary values are CENTS (integers)
- Use Decimal.js ONLY for calculations, return integers
- Banker's rounding (ROUND_HALF_EVEN)
- Period format: YYYY-MM (e.g., "2025-01")
- SDL exempt if estimated annual payroll < R500,000
- Deadline = 7th of following month (or next business day if weekend)
- Store as DRAFT initially (never auto-submit)
- Flag validation issues but don't block generation
- NO backwards compatibility - fail fast with descriptive errors
</context>

<project_structure>
ACTUAL file locations (DO NOT use src/core/sars/ - it doesn't exist):

```
src/database/
├── services/
│   ├── paye.service.ts          # PayeService (dependency)
│   ├── uif.service.ts           # UifService (dependency)
│   └── emp201.service.ts        # Emp201Service class
├── dto/
│   └── emp201.dto.ts            # EMP201 specific DTOs
├── constants/
│   └── emp201.constants.ts      # SDL rate, thresholds, validation
└── database.module.ts           # Add to providers and exports

tests/database/services/
└── emp201.service.spec.ts       # Integration tests with real DB

prisma/schema.prisma:
- SarsSubmission model with documentData JSON field
- SubmissionType.EMP201 enum value
- PayrollStatus.APPROVED for filtering payrolls
```
</project_structure>

<existing_infrastructure>
Already in prisma/schema.prisma:
```prisma
enum SubmissionType {
  VAT201
  EMP201
  IRP5
  EMP501
}

enum SubmissionStatus {
  DRAFT
  SUBMITTED
  ACCEPTED
  REJECTED
}

enum PayrollStatus {
  DRAFT
  APPROVED
  PAID
}

model SarsSubmission {
  id              String           @id @default(uuid())
  tenantId        String           @map("tenant_id")
  submissionType  SubmissionType   @map("submission_type")
  periodStart     DateTime         @map("period_start") @db.Date
  periodEnd       DateTime         @map("period_end") @db.Date
  deadline        DateTime         @db.Date
  totalPayeCents  Int?             @map("total_paye_cents")
  totalUifCents   Int?             @map("total_uif_cents")
  totalSdlCents   Int?             @map("total_sdl_cents")
  status          SubmissionStatus @default(DRAFT)
  documentData    Json?            @map("document_data")
}

model Payroll {
  id                  String        @id @default(uuid())
  tenantId            String        @map("tenant_id")
  staffId             String        @map("staff_id")
  staff               Staff         @relation(...)
  payPeriodStart      DateTime      @map("pay_period_start") @db.Date
  payPeriodEnd        DateTime      @map("pay_period_end") @db.Date
  status              PayrollStatus @default(DRAFT)
  grossSalaryCents    Int           @map("gross_salary_cents")
  payeCents           Int           @map("paye_cents")
  uifEmployeeCents    Int           @map("uif_employee_cents")
  uifEmployerCents    Int           @map("uif_employer_cents")
}

model Tenant {
  registrationNumber  String?       @map("registration_number")  // PAYE reference
  tradingName         String?       @map("trading_name")
}
```

Dependencies to inject:
- PrismaService
- PayeService
- UifService
</existing_infrastructure>

<files_created>
1. src/database/constants/emp201.constants.ts
2. src/database/dto/emp201.dto.ts
3. src/database/services/emp201.service.ts
4. tests/database/services/emp201.service.spec.ts
</files_created>

<files_modified>
1. src/database/services/index.ts - `export { Emp201Service } from './emp201.service';`
2. src/database/dto/index.ts - `export * from './emp201.dto';`
3. src/database/database.module.ts - Add Emp201Service to providers and exports arrays
</files_modified>

<implementation_reference>

## Constants (src/database/constants/emp201.constants.ts)
```typescript
import Decimal from 'decimal.js';

export const EMP201_CONSTANTS = {
  // SDL rate (1% of payroll)
  SDL_RATE: new Decimal('0.01'),

  // SDL exemption threshold: R500,000 annual (in cents)
  SDL_EXEMPTION_THRESHOLD_CENTS: 50000000,

  // Period format regex (YYYY-MM)
  PERIOD_FORMAT_REGEX: /^\d{4}-(0[1-9]|1[0-2])$/,

  // Max employees per submission (SARS limit)
  MAX_EMPLOYEES_PER_SUBMISSION: 500,
};

export const EMP201_VALIDATION = {
  // Warn if average salary > R100,000/month
  HIGH_AVERAGE_SALARY_CENTS: 10000000,
};
```

## DTO (src/database/dto/emp201.dto.ts)
```typescript
export interface Emp201EmployeeRecord {
  staffId: string;
  employeeNumber: string | null;
  fullName: string;
  idNumber: string;
  taxNumber: string | null;
  grossRemunerationCents: number;
  payeCents: number;
  uifEmployeeCents: number;
  uifEmployerCents: number;
}

export interface Emp201Summary {
  employeeCount: number;
  totalGrossRemunerationCents: number;
  totalPayeCents: number;
  totalUifEmployeeCents: number;
  totalUifEmployerCents: number;
  totalUifCents: number;
  totalSdlCents: number;
  totalDueCents: number;
}

export interface Emp201Document {
  submissionId: string;
  tenantId: string;
  payeReference: string | null;
  tradingName: string;
  periodMonth: string;
  periodStart: Date;
  periodEnd: Date;
  summary: Emp201Summary;
  employees: Emp201EmployeeRecord[];
  validationIssues: string[];
  sdlApplicable: boolean;
  generatedAt: Date;
}

export interface GenerateEmp201Dto {
  tenantId: string;
  periodMonth: string;
}

export interface Emp201ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
```

## Service Methods
```typescript
@Injectable()
export class Emp201Service {
  private readonly logger = new Logger(Emp201Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payeService: PayeService,
    private readonly uifService: UifService,
  ) {}

  // Main generation - creates SarsSubmission record
  async generateEmp201(dto: GenerateEmp201Dto): Promise<SarsSubmission>;

  // Aggregate payroll without creating submission
  async aggregatePayroll(tenantId: string, periodMonth: string): Promise<Emp201Summary>;

  // Validate employee data, return issues list
  validateEmployeeData(employees: Emp201EmployeeRecord[]): string[];

  // Generate document structure
  generateDocument(
    tenantId: string,
    payeReference: string | null,
    tradingName: string,
    periodMonth: string,
    periodStart: Date,
    periodEnd: Date,
    summary: Emp201Summary,
    employees: Emp201EmployeeRecord[],
    validationIssues: string[],
    sdlApplicable: boolean,
  ): Emp201Document;

  // Validate document before submission
  validateSubmission(document: Emp201Document): Emp201ValidationResult;

  // Calculate SDL with exemption check
  calculateSdl(totalGrossCents: number): {
    sdlCents: number;
    sdlApplicable: boolean;
  };

  // Calculate deadline (7th of following month)
  private calculateDeadline(periodEnd: Date): Date;
}
```
</implementation_reference>

<test_requirements>
CRITICAL: Tests use REAL PostgreSQL database.

```typescript
beforeAll(async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [PrismaService, PayeService, UifService, Emp201Service],
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

  // Create tenant with PAYE reference (registrationNumber field)
  testTenant = await prisma.tenant.create({
    data: {
      name: 'EMP201 Test Creche',
      tradingName: 'Happy Kids Creche',
      registrationNumber: '1234567ABC',  // This is the PAYE reference
      // ... other required fields
    },
  });
});
```

**Test scenarios implemented:**
- Single employee: R20,000 gross, PAYE R2,500, UIF R200 → Total due calculated
- Multiple employees: 5 employees, various salaries → Totals sum correctly
- SDL calculation: 1% of total gross (if above R500k threshold)
- SDL exemption: Monthly payroll under R41,667 → SDL = 0
- Missing tax number: Warning in validationIssues, document still generates
- Invalid ID number (not 13 digits): Error in validationIssues
- No payrolls: Error thrown
- Invalid period format: Error thrown ("2025/01" → should be "2025-01")
- Deadline calculation: 7th of following month
- Weekend deadline adjustment: Saturday → Monday
- DRAFT status on creation
- Document stored as JSON in SarsSubmission
- Employee count matches unique staff in payroll
</test_requirements>

<lessons_learned>
1. **SDL has exemption threshold** - Annual payroll < R500,000 = SDL exempt (check monthly * 12)
2. **Period format YYYY-MM not YYYY/MM** - Use regex `/^\d{4}-(0[1-9]|1[0-2])$/`
3. **registrationNumber is PAYE reference** - Tenant model uses registrationNumber for PAYE reference
4. **Deadline is 7th, not last business day** - EMP201 due 7th of following month
5. **Include both PayeService and UifService** - Even though we read from payroll, may need for validation
6. **sdlApplicable flag in document** - Indicates whether SDL was calculated
7. **validationIssues includes "(warning)" suffix** - Distinguishes warnings from errors
8. **Multiple payrolls per staff possible** - Handle case where staff has multiple payroll entries
9. **Use tradingName for display** - Fall back to name if tradingName not set
10. **documentData uses JSON.parse(JSON.stringify())** - Convert to plain object for Prisma
</lessons_learned>

<validation_completed>
- TypeScript compiles without errors (npm run build)
- Lint passes (npm run lint)
- All tests pass with real PostgreSQL database
- SDL calculation: 1% of gross when above threshold
- SDL exemption working for small payrolls
- Total due = PAYE + UIF employee + UIF employer + SDL
- Employee count matches payroll count
- Validation issues flagged but don't block generation
- DRAFT status on submission creation
- Deadline calculation handles weekends
- Period format validated (YYYY-MM)
- No 'any' types used
</validation_completed>

</task_spec>
