<task_spec id="TASK-SARS-014" version="3.0">

<metadata>
  <title>VAT201 Generation Service</title>
  <status>COMPLETE</status>
  <layer>logic</layer>
  <sequence>31</sequence>
  <implements>
    <requirement_ref>REQ-SARS-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-SARS-011</task_ref>
    <task_ref>TASK-SARS-002</task_ref>
  </depends_on>
  <completed_date>2025-12-21</completed_date>
  <test_count>1139</test_count>
</metadata>

<context>
Vat201Service generates South African VAT201 return documents.

**What it does:**
- Uses VatService to calculate output and input VAT
- Populates 19-field VAT201 structure per SARS specifications
- Validates VAT number format, period dates, flagged items
- Calculates net VAT (output - input): positive = due to SARS, negative = refund
- Stores submission as DRAFT with deadline calculation
- Flags items requiring review before submission

**CRITICAL RULES:**
- ALL monetary values are CENTS (integers)
- Use Decimal.js ONLY for calculations, return integers
- Banker's rounding (ROUND_HALF_EVEN)
- Tenant MUST be VAT_REGISTERED with valid vatNumber
- Deadline = last business day of month following period end
- Store as DRAFT initially (never auto-submit)
- NO backwards compatibility - fail fast with descriptive errors
</context>

<project_structure>
ACTUAL file locations (DO NOT use src/core/sars/ - it doesn't exist):

```
src/database/
├── services/
│   ├── vat.service.ts          # VatService (dependency)
│   └── vat201.service.ts       # Vat201Service class
├── dto/
│   ├── vat.dto.ts              # VatCalculationResult, VatFlaggedItem
│   └── vat201.dto.ts           # VAT201 specific DTOs
├── constants/
│   └── vat.constants.ts        # VAT_CONSTANTS.VAT_NUMBER_REGEX
└── database.module.ts          # Add to providers and exports

tests/database/services/
└── vat201.service.spec.ts      # Integration tests with real DB

prisma/schema.prisma:
- SarsSubmission model with documentData JSON field
- SubmissionType.VAT201 enum value
- SubmissionStatus.DRAFT enum value
- TaxStatus.VAT_REGISTERED for tenant validation
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

model SarsSubmission {
  id              String           @id @default(uuid())
  tenantId        String           @map("tenant_id")
  submissionType  SubmissionType   @map("submission_type")
  periodStart     DateTime         @map("period_start") @db.Date
  periodEnd       DateTime         @map("period_end") @db.Date
  deadline        DateTime         @db.Date
  outputVatCents  Int?             @map("output_vat_cents")
  inputVatCents   Int?             @map("input_vat_cents")
  netVatCents     Int?             @map("net_vat_cents")
  status          SubmissionStatus @default(DRAFT)
  documentData    Json?            @map("document_data")
}

model Tenant {
  taxStatus   TaxStatus  @default(NOT_REGISTERED)
  vatNumber   String?    @map("vat_number")
}
```

Dependencies to inject:
- PrismaService
- VatService
</existing_infrastructure>

<files_created>
1. src/database/dto/vat201.dto.ts
2. src/database/services/vat201.service.ts
3. tests/database/services/vat201.service.spec.ts
</files_created>

<files_modified>
1. src/database/services/index.ts - `export { Vat201Service } from './vat201.service';`
2. src/database/dto/index.ts - `export * from './vat201.dto';`
3. src/database/database.module.ts - Add Vat201Service to providers and exports arrays
</files_modified>

<implementation_reference>

## DTO (src/database/dto/vat201.dto.ts)
```typescript
import { VatFlaggedItem } from './vat.dto';

export interface Vat201Fields {
  field1OutputStandardCents: number;  // Output VAT on standard-rated
  field2OutputZeroRatedCents: number; // Output on zero-rated (0)
  field3OutputExemptCents: number;    // Output on exempt (0)
  field4TotalOutputCents: number;     // Total output VAT
  field5InputTaxCents: number;        // Input tax
  field6DeductibleInputCents: number; // Deductible input
  field7AdjustmentsCents: number;     // Adjustments
  field8ImportedServicesCents: number;
  field9BadDebtsCents: number;
  field10ReverseAdjustmentsCents: number;
  field11CreditTransferCents: number;
  field12VendorCents: number;
  field13ProvisionalCents: number;
  field14TotalCents: number;
  field15NetVatCents: number;
  field16PaymentsCents: number;
  field17InterestCents: number;
  field18PenaltyCents: number;
  field19TotalDueCents: number;       // Net amount due/refundable
}

export interface Vat201Document {
  submissionId: string;
  tenantId: string;
  vatNumber: string;
  periodStart: Date;
  periodEnd: Date;
  fields: Vat201Fields;
  netVatCents: number;
  isDueToSars: boolean;   // netVatCents > 0
  isRefundDue: boolean;   // netVatCents < 0
  flaggedItems: VatFlaggedItem[];
  generatedAt: Date;
}

export interface Vat201ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export interface GenerateVat201Dto {
  tenantId: string;
  periodStart: Date;
  periodEnd: Date;
}
```

## Service Methods
```typescript
@Injectable()
export class Vat201Service {
  private readonly logger = new Logger(Vat201Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly vatService: VatService,
  ) {}

  // Main generation - creates SarsSubmission record
  async generateVat201(dto: GenerateVat201Dto): Promise<SarsSubmission>;

  // Populate fields from VatService calculations
  populateFields(outputVat: VatCalculationResult, inputVat: VatCalculationResult): Vat201Fields;

  // Validate before submission
  validateSubmission(document: Vat201Document): Vat201ValidationResult;

  // Create document structure
  generateDocument(
    tenantId: string,
    vatNumber: string,
    periodStart: Date,
    periodEnd: Date,
    fields: Vat201Fields,
    flaggedItems: VatFlaggedItem[],
  ): Vat201Document;

  // Calculate net VAT (output - input)
  calculateNetVat(fields: Vat201Fields): number;

  // Calculate deadline (last business day of following month)
  private calculateDeadline(periodEnd: Date): Date;
}
```
</implementation_reference>

<test_requirements>
CRITICAL: Tests use REAL PostgreSQL database.

```typescript
beforeAll(async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [PrismaService, VatService, Vat201Service],
  }).compile();
  // ...
});

beforeEach(async () => {
  // Clean in FK order
  await prisma.sarsSubmission.deleteMany({});
  await prisma.invoiceLine.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.categorization.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.tenant.deleteMany({});

  // Create VAT-registered tenant
  testTenant = await prisma.tenant.create({
    data: {
      name: 'VAT201 Test Creche',
      taxStatus: 'VAT_REGISTERED',
      vatNumber: '4123456789',
      // ...
    },
  });
});
```

**Test scenarios implemented:**
- Standard generation: Output R15,000, Input R5,500 → Net R9,500 due
- Refund scenario: Output R3,000, Input R8,000 → Net -R5,000 refund
- Flagged items included in document
- Invalid VAT number format rejection
- Non-VAT-registered tenant rejection
- Period validation (start < end)
- Deadline calculation (last business day of following month)
- isDueToSars / isRefundDue flags
- Document stored as JSON in SarsSubmission
- Status is DRAFT
</test_requirements>

<lessons_learned>
1. **VatService must be injected** - Vat201Service depends on VatService for calculations
2. **documentData is JSON** - use `JSON.parse(JSON.stringify(document)) as object` for Prisma
3. **Deadline calculation handles weekends** - Friday if Saturday/Sunday
4. **Validate tenant.taxStatus** - must be VAT_REGISTERED
5. **netVatCents determines isDueToSars/isRefundDue** - positive = due, negative = refund
6. **Store raw document, not formatted** - let API layer format for display
</lessons_learned>

<validation_completed>
- TypeScript compiles without errors (npm run build)
- Lint passes (npm run lint)
- All tests pass with real PostgreSQL database
- All 19 VAT201 fields populated correctly
- Net VAT calculation accurate (output - input)
- isDueToSars/isRefundDue flags correct
- Flagged items included in document
- Submission stored with DRAFT status
- VAT number validation works (10 digits)
- Period validation works
- Deadline calculation correct
- No 'any' types used
</validation_completed>

</task_spec>
