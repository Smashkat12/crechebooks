<task_spec id="TASK-SARS-012" version="3.0">

<metadata>
  <title>PAYE Calculation Service</title>
  <status>COMPLETE</status>
  <layer>logic</layer>
  <sequence>29</sequence>
  <implements>
    <requirement_ref>REQ-SARS-007</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-SARS-001</task_ref>
  </depends_on>
  <completed_date>2025-12-21</completed_date>
  <test_count>1097</test_count>
</metadata>

<context>
PayeService calculates Pay-As-You-Earn tax for South African employees using 2025 SARS tax tables.

**What it does:**
- Calculate PAYE based on 2025 tax brackets (7 brackets: 18% to 45%)
- Apply primary rebate (all taxpayers), secondary (65+), tertiary (75+)
- Apply medical aid tax credits (R364 main, R364 first dep, R246 additional)
- Annualize earnings for different pay frequencies
- Calculate effective tax rate

**CRITICAL RULES:**
- ALL monetary values are CENTS (integers) - never rands as floats
- Use Decimal.js ONLY for calculations, return integers
- Banker's rounding (ROUND_HALF_EVEN) for all rounding
- PAYE cannot be negative (floor at 0)
- Rebates are annual, medical credits are monthly
- NO backwards compatibility - fail fast with descriptive errors
</context>

<project_structure>
ACTUAL file locations (DO NOT use src/core/sars/ - it doesn't exist):

```
src/database/
├── services/
│   └── paye.service.ts         # PayeService class
├── dto/
│   └── paye.dto.ts             # DTOs and interfaces
├── constants/
│   └── paye.constants.ts       # Tax brackets, rebates, credits
└── database.module.ts          # Add to providers and exports

tests/database/services/
└── paye.service.spec.ts        # Integration tests with real DB

prisma/schema.prisma            # PayFrequency enum already exists
```
</project_structure>

<existing_infrastructure>
Already in prisma/schema.prisma:
```prisma
enum PayFrequency {
  MONTHLY
  WEEKLY
  FORTNIGHTLY
  DAILY
  HOURLY
}

model Staff {
  dateOfBirth DateTime? @map("date_of_birth") @db.Date
  // Used for age-based rebates
}

model Payroll {
  payFrequency   PayFrequency @default(MONTHLY) @map("pay_frequency")
  grossSalaryCents Int @map("gross_salary_cents")
  payeCents      Int @map("paye_cents")
  // PAYE is already calculated and stored
}
```

Dependencies to inject:
- None (pure calculation service - no database access needed)
</existing_infrastructure>

<files_created>
1. src/database/constants/paye.constants.ts
2. src/database/dto/paye.dto.ts
3. src/database/services/paye.service.ts
4. tests/database/services/paye.service.spec.ts
</files_created>

<files_modified>
1. src/database/services/index.ts - `export { PayeService } from './paye.service';`
2. src/database/dto/index.ts - `export * from './paye.dto';`
3. src/database/database.module.ts - Add PayeService to providers and exports arrays
</files_modified>

<implementation_reference>

## Constants (src/database/constants/paye.constants.ts)
```typescript
import Decimal from 'decimal.js';
import { PayFrequency } from '@prisma/client';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_EVEN });

// 2025 SARS Tax Brackets (amounts in CENTS)
export interface TaxBracket {
  minIncomeCents: number;
  maxIncomeCents: number | null;
  baseAmountCents: number;
  rate: Decimal;
}

export const TAX_BRACKETS_2025: TaxBracket[] = [
  { minIncomeCents: 0, maxIncomeCents: 23710000, baseAmountCents: 0, rate: new Decimal('0.18') },
  { minIncomeCents: 23710100, maxIncomeCents: 37050000, baseAmountCents: 4267800, rate: new Decimal('0.26') },
  { minIncomeCents: 37050100, maxIncomeCents: 51280000, baseAmountCents: 7736200, rate: new Decimal('0.31') },
  { minIncomeCents: 51280100, maxIncomeCents: 67300000, baseAmountCents: 12147500, rate: new Decimal('0.36') },
  { minIncomeCents: 67300100, maxIncomeCents: 85790000, baseAmountCents: 17914700, rate: new Decimal('0.39') },
  { minIncomeCents: 85790100, maxIncomeCents: 181700000, baseAmountCents: 25125800, rate: new Decimal('0.41') },
  { minIncomeCents: 181700100, maxIncomeCents: null, baseAmountCents: 64448900, rate: new Decimal('0.45') },
];

// 2025 Rebates (annual, in CENTS)
export const REBATES_2025 = {
  PRIMARY: 1723500,     // R17,235
  SECONDARY: 944400,    // R9,444 (age 65+)
  TERTIARY: 314500,     // R3,145 (age 75+)
};

// 2025 Medical Credits (monthly, in CENTS)
export const MEDICAL_CREDITS_2025 = {
  MAIN_MEMBER: 36400,         // R364
  FIRST_DEPENDENT: 36400,     // R364
  ADDITIONAL_DEPENDENT: 24600, // R246
};

// 2025 Tax Thresholds (annual income in CENTS below which no tax)
export const TAX_THRESHOLDS_2025 = {
  BELOW_65: 9575000,     // R95,750
  AGE_65_TO_74: 14821700, // R148,217
  AGE_75_PLUS: 16568900,  // R165,689
};

// Pay frequency multipliers for annualization
export const PAY_FREQUENCY_MULTIPLIERS: Record<PayFrequency, number> = {
  MONTHLY: 12,
  FORTNIGHTLY: 26,
  WEEKLY: 52,
  DAILY: 261,   // SA standard working days
  HOURLY: 2088, // 261 days * 8 hours
};
```

## DTO (src/database/dto/paye.dto.ts)
```typescript
import { PayFrequency } from '@prisma/client';
// NOTE: Do NOT re-export PayFrequency - it's already exported from entities

export interface PayeCalculationResult {
  grossIncomeCents: number;
  annualizedIncomeCents: number;
  taxBeforeRebatesCents: number;
  primaryRebateCents: number;
  secondaryRebateCents: number;
  tertiaryRebateCents: number;
  totalRebatesCents: number;
  taxAfterRebatesCents: number;
  medicalCreditsCents: number;
  netPayeCents: number;          // Monthly PAYE after all deductions
  effectiveRatePercent: number;  // Percentage with 2 decimal places
  bracketIndex: number;
}

export interface CalculatePayeDto {
  grossIncomeCents: number;
  payFrequency: PayFrequency;
  dateOfBirth: Date;
  medicalAidMembers: number;
}

export type RebateType = 'PRIMARY' | 'SECONDARY' | 'TERTIARY';
```

## Service Methods
```typescript
@Injectable()
export class PayeService {
  private readonly logger = new Logger(PayeService.name);

  // Main calculation - returns monthly PAYE
  // eslint-disable-next-line @typescript-eslint/require-await
  async calculatePaye(dto: CalculatePayeDto): Promise<PayeCalculationResult>;

  // Get applicable tax bracket for annual income
  getTaxBracket(annualIncomeCents: number): { bracket: TaxBracket; bracketIndex: number };

  // Calculate rebate based on age
  calculateRebate(dateOfBirth: Date, rebateType?: RebateType): number;

  // Calculate monthly medical credits
  calculateMedicalCredits(medicalAidMembers: number): number;

  // Annualize earnings based on pay frequency
  annualizeEarnings(grossIncomeCents: number, payFrequency: PayFrequency): number;

  // Get tax threshold based on age
  getTaxThreshold(age: number): number;

  // Check if income is below threshold
  isBelowThreshold(annualIncomeCents: number, age: number): boolean;

  // Private: Calculate age from DOB
  private calculateAge(dateOfBirth: Date): number;

  // Private: Calculate tax on income using bracket
  private calculateTaxOnIncome(annualIncomeCents: number, bracket: TaxBracket): number;
}
```
</implementation_reference>

<test_requirements>
CRITICAL: Tests use REAL PostgreSQL database.

```typescript
beforeAll(async () => {
  const module: TestingModule = await Test.createTestingModule({
    providers: [PrismaService, PayeService],
  }).compile();
  prisma = module.get<PrismaService>(PrismaService);
  service = module.get<PayeService>(PayeService);
  await prisma.onModuleInit();
});
```

**Test scenarios implemented:**
- Monthly salary R30,000: PAYE ~R5,056 (after rebates, no medical)
- Age 67 employee gets primary + secondary rebate
- Age 77 employee gets all three rebates
- Medical aid 3 members: R364 + R364 + R246 = R974/month
- Annualization: R10,000 weekly = R520,000 annual
- Tax bracket edge cases (R237,100 vs R237,101)
- Zero income yields zero PAYE
- Income below threshold yields zero PAYE
- All 7 tax brackets tested

**IMPORTANT - Date handling:**
Use `new Date(year, month, day)` for local time, NOT `new Date('YYYY-MM-DD')` which is UTC
```typescript
// CORRECT
const dob = new Date(1980, 0, 15); // Jan 15, 1980 local time

// WRONG - creates UTC midnight which may be previous day locally
const dob = new Date('1980-01-15');
```
</test_requirements>

<lessons_learned>
1. **Use integers (cents) for all values including constants** - Decimal only for intermediate math
2. **Tax brackets store values in CENTS** - e.g., R237,100 = 23710000 cents
3. **Medical credits are monthly, rebates are annual** - divide annual tax by 12 before applying credits
4. **PAYE floor at zero** - after rebates and credits, never return negative
5. **Effective rate uses actual monthly gross** - not annualized income
6. **eslint-disable for async methods** - method must be async per interface but has no await
7. **Date constructor for local dates** - avoid UTC string parsing
</lessons_learned>

<validation_completed>
- TypeScript compiles without errors (npm run build)
- Lint passes (npm run lint)
- All tests pass with real PostgreSQL database
- 2025 SARS tax tables implemented exactly
- Banker's rounding applied correctly
- All rebates applied correctly by age
- Medical credits calculated correctly
- Tax thresholds working
- Annualization accurate for all frequencies
- No 'any' types used
</validation_completed>

</task_spec>
