<task_spec id="TASK-SARS-013" version="3.0">

<metadata>
  <title>UIF Calculation Service</title>
  <status>COMPLETE</status>
  <layer>logic</layer>
  <sequence>30</sequence>
  <implements>
    <requirement_ref>REQ-SARS-008</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-SARS-001</task_ref>
  </depends_on>
  <completed_date>2025-12-21</completed_date>
  <test_count>1118</test_count>
</metadata>

<context>
UifService calculates Unemployment Insurance Fund contributions for South African employees.

**What it does:**
- Employee contribution: 1% of gross remuneration
- Employer contribution: 1% of gross remuneration (matching)
- Maximum monthly remuneration: R17,712 (2025)
- Maximum contribution per party: R177.12 (R17,712 × 1%)
- Total UIF: 2% of capped gross (R354.24 max total)

**CRITICAL RULES:**
- ALL monetary values are CENTS (integers) - never rands as floats
- Use Decimal.js ONLY for calculations, return integers
- Banker's rounding (ROUND_HALF_EVEN) for all rounding
- Cap applies BEFORE percentage calculation
- Employee and employer contributions always equal
- Contributions cannot be negative
</context>

<project_structure>
ACTUAL file locations (DO NOT use src/core/sars/ - it doesn't exist):

```
src/database/
├── services/
│   └── uif.service.ts          # UifService class
├── dto/
│   └── uif.dto.ts              # DTOs and interfaces
├── constants/
│   └── uif.constants.ts        # UIF rates and caps
└── database.module.ts          # Add to providers and exports

tests/database/services/
└── uif.service.spec.ts         # Integration tests with real DB
```
</project_structure>

<existing_infrastructure>
Already in prisma/schema.prisma:
```prisma
model Payroll {
  grossSalaryCents    Int @map("gross_salary_cents")
  uifEmployeeCents    Int @map("uif_employee_cents")
  uifEmployerCents    Int @map("uif_employer_cents")
}
```

Dependencies to inject:
- None (pure calculation service - no database access needed)
</existing_infrastructure>

<files_created>
1. src/database/constants/uif.constants.ts
2. src/database/dto/uif.dto.ts
3. src/database/services/uif.service.ts
4. tests/database/services/uif.service.spec.ts
</files_created>

<files_modified>
1. src/database/services/index.ts - `export { UifService } from './uif.service';`
2. src/database/dto/index.ts - `export * from './uif.dto';`
3. src/database/database.module.ts - Add UifService to providers and exports arrays
</files_modified>

<implementation_reference>

## Constants (src/database/constants/uif.constants.ts)
```typescript
import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

export const UIF_CONSTANTS = {
  // 2025 UIF rates
  EMPLOYEE_RATE: new Decimal('0.01'), // 1%
  EMPLOYER_RATE: new Decimal('0.01'), // 1%

  // Maximum monthly remuneration for UIF (2025) in CENTS
  MAX_REMUNERATION_CENTS: 1771200, // R17,712

  // Maximum contributions per party in CENTS
  MAX_EMPLOYEE_CONTRIBUTION_CENTS: 17712, // R177.12
  MAX_EMPLOYER_CONTRIBUTION_CENTS: 17712, // R177.12
  MAX_TOTAL_CONTRIBUTION_CENTS: 35424,    // R354.24
};
```

## DTO (src/database/dto/uif.dto.ts)
```typescript
export interface UifCalculationResult {
  grossRemunerationCents: number;
  cappedRemunerationCents: number;
  employeeContributionCents: number;
  employerContributionCents: number;
  totalContributionCents: number;
  isAboveCap: boolean;
}
```

## Service Methods
```typescript
@Injectable()
export class UifService {
  private readonly logger = new Logger(UifService.name);

  // Main calculation
  // eslint-disable-next-line @typescript-eslint/require-await
  async calculateUif(grossRemunerationCents: number): Promise<UifCalculationResult>;

  // Employee contribution (1% of capped gross)
  calculateEmployeeContribution(grossRemunerationCents: number): number;

  // Employer contribution (same as employee - 1%)
  calculateEmployerContribution(grossRemunerationCents: number): number;

  // Apply R17,712 cap
  applyMaxCap(remunerationCents: number): {
    cappedRemunerationCents: number;
    isAboveCap: boolean;
  };
}
```
</implementation_reference>

<test_requirements>
CRITICAL: Tests use REAL PostgreSQL database (even though service is pure calculation).

```typescript
beforeAll(async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [PrismaService, UifService],
  }).compile();
  prisma = module.get<PrismaService>(PrismaService);
  service = module.get<UifService>(UifService);
  await prisma.onModuleInit();
});
```

**Test scenarios implemented:**
- Below cap: R10,000 gross → R100 employee, R100 employer, R200 total
- At cap: R17,712 gross → R177.12 employee, R177.12 employer
- Above cap: R25,000 gross → R177.12 employee (capped), R177.12 employer (capped)
- Zero gross: All zeros
- Banker's rounding: R10,005 → R100.05 (not R100.04 or R100.06)
- Just below cap: R17,711 → R177.11
- Just above cap: R17,713 → R177.12 (capped)
- isAboveCap flag accuracy
</test_requirements>

<lessons_learned>
1. **Cap applies to remuneration, not contribution** - calculate 1% of capped amount
2. **Employee and employer always equal** - employer contribution mirrors employee
3. **Use Math.min for cap enforcement** - after percentage calculation
4. **Store cap in cents** - R17,712 = 1771200 cents
5. **Total = employee + employer** - always exactly 2× employee contribution
6. **Negative inputs return 0** - no negative contributions allowed
</lessons_learned>

<validation_completed>
- TypeScript compiles without errors (npm run build)
- Lint passes (npm run lint)
- All tests pass with real PostgreSQL database
- 1% rate applied correctly
- R17,712 cap enforced accurately
- R177.12 maximum contribution enforced
- Banker's rounding applied correctly
- isAboveCap flag accurate
- Zero/negative inputs handled gracefully
- Employee and employer contributions always equal
- No 'any' types used
</validation_completed>

</task_spec>
