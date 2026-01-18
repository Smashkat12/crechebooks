<task_spec id="TASK-SARS-034" version="2.0">

<metadata>
  <title>Update PAYE Tax Tables to 2025/2026</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>181</sequence>
  <implements>
    <requirement_ref>REQ-SARS-COMPLIANCE-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-SARS-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-01-17</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Modify:**
  - `apps/api/src/database/constants/paye.constants.ts`
  - `apps/api/src/database/services/paye.service.ts`
  - `apps/api/src/database/dto/paye.dto.ts`
  - `apps/api/tests/database/services/paye.service.spec.ts`

  **Current Problem:**
  The PAYE constants are hardcoded for 2024/2025 tax year (1 March 2024 - 28 February 2025).
  We are now in 2026, meaning the system is using outdated tax tables.

  **Current Implementation:**
  - `TAX_BRACKETS_2025` - Hardcoded 2024/2025 brackets
  - `REBATES_2025` - Hardcoded 2024/2025 rebates
  - `MEDICAL_CREDITS_2025` - Hardcoded 2024/2025 credits
  - `TAX_THRESHOLDS_2025` - Hardcoded 2024/2025 thresholds

  **Required Update:**
  Add 2025/2026 tax tables (1 March 2025 - 28 February 2026) and make the service select
  the correct table based on pay period date.

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Tax Table Structure (from existing code)
  ```typescript
  export interface PayeTaxBracket {
    minIncomeCents: number;
    maxIncomeCents: number | null;
    baseAmountCents: number;
    rate: Decimal;
  }

  // All values in CENTS
  export const TAX_BRACKETS_2026: PayeTaxBracket[] = [
    {
      minIncomeCents: 0,
      maxIncomeCents: 23710000, // R237,100 (update when SARS publishes)
      baseAmountCents: 0,
      rate: new Decimal('0.18'),
    },
    // ... more brackets
  ];
  ```

  ### 3. Tax Year Selection Pattern
  ```typescript
  export function getTaxYear(date: Date): string {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;

    // SA Tax year runs March to February
    if (month >= 3) {
      return `${year}/${year + 1}`;
    }
    return `${year - 1}/${year}`;
  }

  export function getTaxYearTables(payPeriodDate: Date): {
    brackets: PayeTaxBracket[];
    rebates: typeof REBATES_2025;
    medicalCredits: typeof MEDICAL_CREDITS_2025;
    thresholds: typeof TAX_THRESHOLDS_2025;
  } {
    const taxYear = getTaxYear(payPeriodDate);

    switch (taxYear) {
      case '2025/2026':
        return {
          brackets: TAX_BRACKETS_2026,
          rebates: REBATES_2026,
          medicalCredits: MEDICAL_CREDITS_2026,
          thresholds: TAX_THRESHOLDS_2026,
        };
      case '2024/2025':
      default:
        return {
          brackets: TAX_BRACKETS_2025,
          rebates: REBATES_2025,
          medicalCredits: MEDICAL_CREDITS_2025,
          thresholds: TAX_THRESHOLDS_2025,
        };
    }
  }
  ```

  ### 4. Service Update Pattern
  ```typescript
  async calculatePaye(dto: CalculatePayeDto): Promise<PayeCalculationResult> {
    const { grossIncomeCents, payFrequency, dateOfBirth, medicalAidMembers, payPeriodDate } = dto;

    // Get correct tax tables for pay period
    const taxTables = getTaxYearTables(payPeriodDate || new Date());

    // Use taxTables.brackets instead of TAX_BRACKETS_2025
    // Use taxTables.rebates instead of REBATES_2025
    // etc.
  }
  ```

  ### 5. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task updates the PAYE calculation system to support multiple tax years with automatic selection based on pay period date. SARS updates tax tables annually on 1 March.

**2025/2026 Tax Year:** 1 March 2025 - 28 February 2026

**Note:** If official 2025/2026 SARS tables are not yet available, use 2024/2025 values as placeholders with clear TODO comments. The structure must be in place for easy updates.
</context>

<scope>
  <in_scope>
    - Add TAX_BRACKETS_2026, REBATES_2026, MEDICAL_CREDITS_2026, TAX_THRESHOLDS_2026 constants
    - Add getTaxYear() helper function to determine tax year from date
    - Add getTaxYearTables() function to return correct tables
    - Update PayeService to accept payPeriodDate parameter
    - Update PayeService to use dynamic tax table selection
    - Add tests for tax year boundary dates
    - Add tests for both tax years
    - Update CalculatePayeDto to include optional payPeriodDate
  </in_scope>
  <out_of_scope>
    - Database storage of tax tables (future TASK-STAFF-005)
    - Admin UI for managing tax tables
    - Historical tax years before 2024/2025
    - UIF calculations (separate service)
  </out_of_scope>
</scope>

<sars_2026_tax_tables>
## 2025/2026 Tax Tables (Use Official SARS Values When Available)

### Tax Brackets (Placeholder - Update with Official SARS Gazette)
| Taxable Income | Rate | Base Tax |
|----------------|------|----------|
| R0 - R237,100 | 18% | R0 |
| R237,101 - R370,500 | 26% | R42,678 |
| R370,501 - R512,800 | 31% | R77,362 |
| R512,801 - R673,000 | 36% | R121,475 |
| R673,001 - R857,900 | 39% | R179,147 |
| R857,901 - R1,817,000 | 41% | R251,258 |
| R1,817,001+ | 45% | R644,489 |

### Rebates (Placeholder)
| Type | Amount |
|------|--------|
| Primary | R17,235 |
| Secondary (65+) | R9,444 |
| Tertiary (75+) | R3,145 |

### Tax Thresholds (Placeholder)
| Age | Threshold |
|-----|-----------|
| Under 65 | R95,750 |
| 65-74 | R148,217 |
| 75+ | R165,689 |

### Medical Credits
| Members | Monthly Credit |
|---------|----------------|
| Main member | R364 |
| First dependant | R364 |
| Additional dependants | R246 each |
</sars_2026_tax_tables>

<verification_commands>
## Execution Order

```bash
# 1. Update constants file
# Edit apps/api/src/database/constants/paye.constants.ts

# 2. Update DTO
# Edit apps/api/src/database/dto/paye.dto.ts

# 3. Update service
# Edit apps/api/src/database/services/paye.service.ts

# 4. Update tests
# Edit apps/api/tests/database/services/paye.service.spec.ts

# 5. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing

# 6. Run specific tests
pnpm test -- paye.service --runInBand
```
</verification_commands>

<definition_of_done>
  <constraints>
    - All monetary values in CENTS (integers)
    - Use Decimal.js with banker's rounding (ROUND_HALF_EVEN)
    - Tax year determined by pay period date, not current date
    - Default to current date if payPeriodDate not provided
    - Backwards compatible - existing calls without payPeriodDate still work
    - Clear TODO comments if using placeholder values
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: 2024/2025 calculation (date in March 2024)
    - Test: 2025/2026 calculation (date in March 2025)
    - Test: Tax year boundary (Feb 28 vs March 1)
    - Test: Default to current date when payPeriodDate missing
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Store monetary values as floats (use cents as integers)
  - Use JavaScript Math.round (use Decimal.js)
  - Hardcode current date - use payPeriodDate parameter
  - Break backwards compatibility
  - Skip updating tests for both tax years
</anti_patterns>

</task_spec>
