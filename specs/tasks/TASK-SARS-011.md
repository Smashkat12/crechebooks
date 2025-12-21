<task_spec id="TASK-SARS-011" version="2.0">

<metadata>
  <title>VAT Calculation Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>28</sequence>
  <implements>
    <requirement_ref>REQ-SARS-001</requirement_ref>
    <requirement_ref>REQ-SARS-002</requirement_ref>
    <requirement_ref>REQ-SARS-004</requirement_ref>
    <requirement_ref>REQ-SARS-005</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-TRANS-002</task_ref>
    <task_ref>TASK-BILL-003</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <last_updated>2025-12-21</last_updated>
</metadata>

<context>
This task creates the VatService which handles all Value-Added Tax calculations for
South African SARS compliance. The service calculates output VAT (on sales/invoices)
and input VAT (on purchases), distinguishes between standard-rated (15%), zero-rated,
and exempt supplies, and flags missing VAT details required for VAT201 submissions.

CRITICAL RULES:
- All monetary values stored as CENTS (integers) in database
- All calculations use Decimal.js with banker's rounding (ROUND_HALF_EVEN)
- No backwards compatibility - fail fast with clear error messages
- No mock data in tests - use real PostgreSQL database
- Tenant isolation required on all queries
</context>

<project_structure>
ACTUAL file locations in this project:
- Services: src/database/services/*.service.ts
- DTOs: src/database/dto/*.dto.ts
- Constants: src/database/constants/*.ts
- Repositories: src/database/repositories/*.repository.ts
- Tests: tests/database/services/*.service.spec.ts
- Module: src/database/database.module.ts
- Prisma Schema: prisma/schema.prisma

DO NOT use src/core/sars/ - that path does not exist.
</project_structure>

<existing_infrastructure>
Already implemented in prisma/schema.prisma:

enum VatType {
  STANDARD
  ZERO_RATED
  EXEMPT
  NO_VAT
}

model Transaction {
  id            String            @id @default(uuid())
  tenantId      String            @map("tenant_id")
  amountCents   Int               @map("amount_cents")
  isCredit      Boolean           @map("is_credit")
  status        TransactionStatus @default(PENDING)
  // ... categorizations relation contains vatType, vatAmountCents
}

model Categorization {
  vatAmountCents Int?    @map("vat_amount_cents")
  vatType        VatType @default(STANDARD) @map("vat_type")
}

model Invoice {
  id          String   @id @default(uuid())
  tenantId    String   @map("tenant_id")
  subtotalCents Int    @map("subtotal_cents")
  vatCents    Int      @default(0) @map("vat_cents")
  totalCents  Int      @map("total_cents")
  issueDate   DateTime @map("issue_date") @db.Date
  status      InvoiceStatus
}

Existing repositories to use:
- TransactionRepository: src/database/repositories/transaction.repository.ts
- InvoiceRepository: src/database/repositories/invoice.repository.ts
- CategorizationRepository: src/database/repositories/categorization.repository.ts
</existing_infrastructure>

<files_to_create>
1. src/database/dto/vat.dto.ts - DTOs and interfaces
2. src/database/constants/vat.constants.ts - VAT rate and account mappings
3. src/database/services/vat.service.ts - VatService class
4. tests/database/services/vat.service.spec.ts - Integration tests
</files_to_create>

<files_to_modify>
1. src/database/services/index.ts - Add export for VatService
2. src/database/dto/index.ts - Add export for VAT DTOs
3. src/database/database.module.ts - Add VatService to providers/exports
</files_to_modify>

<implementation_details>

## File 1: src/database/dto/vat.dto.ts

```typescript
import Decimal from 'decimal.js';

// Re-export VatType from Prisma for convenience
export { VatType } from '@prisma/client';

export interface VatCalculationResult {
  totalExcludingVatCents: number;      // Stored as cents
  vatAmountCents: number;              // Stored as cents
  totalIncludingVatCents: number;      // Stored as cents
  standardRatedCents: number;          // Amount at 15%
  zeroRatedCents: number;              // Amount at 0% (claimable)
  exemptCents: number;                 // Amount at 0% (not claimable)
  itemCount: number;
}

export interface VatFlaggedItem {
  transactionId?: string;
  invoiceId?: string;
  description: string;
  issue: string;
  amountCents: number;
  severity: 'WARNING' | 'ERROR';
}

export interface VatValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
```

## File 2: src/database/constants/vat.constants.ts

```typescript
import Decimal from 'decimal.js';

// Configure Decimal.js for banker's rounding
Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_EVEN,
});

export const VAT_CONSTANTS = {
  // South African VAT rate (15%)
  VAT_RATE: new Decimal('0.15'),
  VAT_RATE_PERCENT: 15,

  // VAT-inclusive divisor (1.15)
  VAT_DIVISOR: new Decimal('1.15'),

  // Threshold for requiring supplier VAT number (R5000 = 500000 cents)
  VAT_NUMBER_REQUIRED_THRESHOLD_CENTS: 500000,

  // Threshold for supplier name warning (R2000 = 200000 cents)
  SUPPLIER_NAME_WARNING_THRESHOLD_CENTS: 200000,

  // Valid SA VAT number format (10 digits)
  VAT_NUMBER_REGEX: /^\d{10}$/,
};

// Account codes that are zero-rated (0% VAT but claimable input VAT)
export const ZERO_RATED_ACCOUNTS = [
  '1200', // Exports
  '4100', // Basic foodstuffs
];

// Account codes that are exempt (no VAT, not claimable)
export const EXEMPT_ACCOUNTS = [
  '8100', // Bank charges
  '8200', // Interest expense
  '4200', // Residential rent
];
```

## File 3: src/database/services/vat.service.ts

Key methods to implement:
- calculateOutputVat(tenantId, periodStart, periodEnd): VatCalculationResult
- calculateInputVat(tenantId, periodStart, periodEnd): VatCalculationResult
- classifyVatType(accountCode, description, supplierVatNumber?): VatType
- validateVatDetails(item): VatValidationResult
- getFlaggedItems(tenantId, periodStart, periodEnd): VatFlaggedItem[]

Dependencies to inject:
- PrismaService
- InvoiceRepository
- TransactionRepository
- CategorizationRepository

## File 4: tests/database/services/vat.service.spec.ts

Integration tests using real database:
- Test VAT calculation: R1000 excl VAT yields R150 VAT exactly
- Test banker's rounding: R100.125 rounds to R100.12
- Test zero-rated vs exempt distinction
- Test flagging missing VAT numbers on expenses > R5000
- Test output VAT aggregation for invoice period
- Test input VAT extraction from VAT-inclusive amounts
</implementation_details>

<test_requirements>
CRITICAL: Tests must use REAL PostgreSQL database, not mocks.

Test setup pattern (from existing tests):
```typescript
beforeAll(async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [PrismaService, VatService, /* dependencies */],
  }).compile();
  prisma = module.get<PrismaService>(PrismaService);
  service = module.get<VatService>(VatService);
  await prisma.onModuleInit();
});

beforeEach(async () => {
  // Clean in FK order - MUST include all related tables
  await prisma.reminder.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.invoiceLine.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.categorization.deleteMany({});
  await prisma.transaction.deleteMany({});
  await prisma.tenant.deleteMany({});

  // Create test tenant
  testTenant = await prisma.tenant.create({
    data: {
      name: 'VAT Test Creche',
      taxStatus: 'VAT_REGISTERED',
      vatNumber: '4123456789', // Valid 10-digit VAT number
      // ... required fields
    },
  });
});
```
</test_requirements>

<validation_criteria>
1. TypeScript compiles without errors (npm run build)
2. Lint passes (npm run lint)
3. All tests pass with real database
4. VAT calculation: R1000 excl = R150 VAT exactly (15%)
5. Banker's rounding applied (R100.125 -> R100.12, R100.135 -> R100.14)
6. Zero-rated items return 0 VAT but counted separately from exempt
7. Missing VAT number on expense > R5000 triggers ERROR flag
8. VAT extraction from inclusive: R115 inclusive = R15 VAT
9. Tenant isolation: Queries filter by tenantId
10. No 'any' types used
</validation_criteria>

<error_handling>
NO fallbacks or workarounds. Fail fast with descriptive errors:
- throw new Error(`VAT calculation failed: ${reason}`)
- Use Logger.error() before throwing
- Include tenantId, invoiceId, transactionId in error messages
</error_handling>

</task_spec>
