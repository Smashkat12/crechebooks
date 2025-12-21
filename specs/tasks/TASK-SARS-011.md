<task_spec id="TASK-SARS-011" version="3.0">

<metadata>
  <title>VAT Calculation Service</title>
  <status>COMPLETE</status>
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
  <completed_date>2025-12-21</completed_date>
  <test_count>1076</test_count>
</metadata>

<context>
VatService handles all Value-Added Tax calculations for South African SARS compliance.

**What it does:**
- Output VAT: Tax collected on sales/invoices (15% standard rate)
- Input VAT: Tax paid on purchases/expenses (claimable)
- Zero-rated: 0% VAT but input VAT is claimable (exports, basic foodstuffs)
- Exempt: 0% VAT and input VAT is NOT claimable (bank charges, interest)

**CRITICAL RULES:**
- ALL monetary values are CENTS (integers) - never rands as floats
- Use Decimal.js ONLY for calculations, return integers
- Banker's rounding (ROUND_HALF_EVEN) for all rounding
- NO backwards compatibility - fail fast with descriptive errors
- NO mock data in tests - use real PostgreSQL database
- Tenant isolation required on ALL queries
</context>

<project_structure>
ACTUAL file locations (DO NOT use src/core/sars/ - it doesn't exist):

```
src/database/
├── services/
│   └── vat.service.ts          # VatService class
├── dto/
│   └── vat.dto.ts              # DTOs and interfaces
├── constants/
│   └── vat.constants.ts        # VAT_CONSTANTS, account codes
└── database.module.ts          # Add to providers and exports

tests/database/services/
└── vat.service.spec.ts         # Integration tests with real DB

prisma/schema.prisma            # VatType enum already exists
```
</project_structure>

<existing_infrastructure>
Already in prisma/schema.prisma:
```prisma
enum VatType {
  STANDARD    // 15% VAT
  ZERO_RATED  // 0% but claimable
  EXEMPT      // 0% not claimable
  NO_VAT      // No VAT (no supplier number)
}

model Invoice {
  subtotalCents Int @map("subtotal_cents")
  vatCents      Int @default(0) @map("vat_cents")
  totalCents    Int @map("total_cents")
}

model Categorization {
  vatAmountCents Int?    @map("vat_amount_cents")
  vatType        VatType @default(STANDARD) @map("vat_type")
}
```

Dependencies to inject:
- PrismaService (NOT separate repositories)
</existing_infrastructure>

<files_created>
1. src/database/constants/vat.constants.ts
2. src/database/dto/vat.dto.ts
3. src/database/services/vat.service.ts
4. tests/database/services/vat.service.spec.ts
</files_created>

<files_modified>
1. src/database/services/index.ts - `export { VatService } from './vat.service';`
2. src/database/dto/index.ts - `export * from './vat.dto';`
3. src/database/database.module.ts - Add VatService to providers and exports arrays
</files_modified>

<implementation_reference>

## Constants (src/database/constants/vat.constants.ts)
```typescript
import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

export const VAT_CONSTANTS = {
  VAT_RATE: new Decimal('0.15'),
  VAT_RATE_PERCENT: 15,
  VAT_DIVISOR: new Decimal('1.15'),
  VAT_NUMBER_REQUIRED_THRESHOLD_CENTS: 500000,  // R5000
  SUPPLIER_NAME_WARNING_THRESHOLD_CENTS: 200000, // R2000
  VAT_NUMBER_REGEX: /^\d{10}$/,
};

export const ZERO_RATED_ACCOUNTS = ['1200', '4100'];
export const EXEMPT_ACCOUNTS = ['8100', '8200', '4200'];
export const ZERO_RATED_KEYWORDS = ['export', 'basic food'];
export const EXEMPT_KEYWORDS = ['bank charge', 'interest'];
```

## DTO (src/database/dto/vat.dto.ts)
```typescript
// NOTE: Do NOT re-export VatType - it's already exported from entities
export interface VatCalculationResult {
  totalExcludingVatCents: number;  // Always integers
  vatAmountCents: number;
  totalIncludingVatCents: number;
  standardRatedCents: number;
  zeroRatedCents: number;
  exemptCents: number;
  itemCount: number;
}

export type VatFlagSeverity = 'WARNING' | 'ERROR';

export interface VatFlaggedItem {
  transactionId?: string;
  invoiceId?: string;
  description: string;
  issue: string;
  amountCents: number;
  severity: VatFlagSeverity;
}

export interface VatValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
```

## Service Methods
```typescript
@Injectable()
export class VatService {
  constructor(private readonly prisma: PrismaService) {}

  // Output VAT on sales - from invoices
  async calculateOutputVat(tenantId: string, periodStart: Date, periodEnd: Date): Promise<VatCalculationResult>;

  // Input VAT on purchases - from categorized transactions
  async calculateInputVat(tenantId: string, periodStart: Date, periodEnd: Date): Promise<VatCalculationResult>;

  // Classify by account code, description, supplier VAT number
  classifyVatType(accountCode: string, description: string, supplierVatNumber?: string): VatType;

  // Validate for compliance issues
  validateVatDetails(item: {...}): VatValidationResult;

  // Get items needing review
  async getFlaggedItems(tenantId: string, periodStart: Date, periodEnd: Date): Promise<VatFlaggedItem[]>;

  // Helper: VAT from exclusive amount
  calculateVatFromExclusive(exclusiveAmount: Decimal): Decimal;

  // Helper: Extract exclusive from inclusive
  extractExclusiveFromInclusive(inclusiveAmount: Decimal): Decimal;
}
```
</implementation_reference>

<test_requirements>
CRITICAL: Tests use REAL PostgreSQL database.

```typescript
beforeAll(async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [PrismaService, VatService],
  }).compile();
  prisma = module.get<PrismaService>(PrismaService);
  service = module.get<VatService>(VatService);
  await prisma.onModuleInit();
});

beforeEach(async () => {
  // Clean in FK order - CRITICAL
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
      vatNumber: '4123456789',
      // ... other required fields
    },
  });
});
```

**Test scenarios implemented:**
- R1000 excl VAT = R150 VAT (15% exact)
- Banker's rounding: R100.125 -> R100.12
- Zero-rated vs exempt distinction
- Missing VAT number on expense > R5000 = ERROR flag
- Output VAT aggregation for invoice period
- Input VAT extraction from inclusive amounts
- Tenant isolation enforcement
</test_requirements>

<lessons_learned>
1. **Use integers (cents) for all return values** - Only use Decimal internally
2. **Do NOT re-export VatType from DTOs** - causes conflicts, use directly from @prisma/client
3. **PrismaService directly, not repositories** - simpler dependency injection
4. **Tests need FK-aware cleanup order** - delete child tables first
5. **eslint-disable for async methods that don't await** - if method is sync but interface requires async
</lessons_learned>

<validation_completed>
- TypeScript compiles without errors (npm run build)
- Lint passes (npm run lint)
- All tests pass with real PostgreSQL database
- VAT calculation: R1000 excl = R150 VAT exactly (15%)
- Banker's rounding applied correctly
- Zero-rated vs exempt distinction works
- Missing VAT number flagging works
- Tenant isolation enforced
- No 'any' types used
</validation_completed>

</task_spec>
