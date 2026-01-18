<task_spec id="TASK-RECON-036" version="2.0">

<metadata>
  <title>Complete Balance Sheet Implementation</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>194</sequence>
  <implements>
    <requirement_ref>REQ-RECON-BALANCE-001</requirement_ref>
    <requirement_ref>REQ-IFRS-SME-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-RECON-033</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>10 hours</estimated_effort>
  <last_updated>2026-01-17</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Modify:**
  - `apps/api/src/database/services/balance-sheet.service.ts`
  - `apps/api/src/database/dto/balance-sheet.dto.ts`
  - `apps/api/src/database/constants/chart-of-accounts.constants.ts`
  - `apps/api/src/api/reconciliation/reconciliation.controller.ts`

  **Files to Create:**
  - `apps/api/src/database/services/comparative-balance-sheet.service.ts` (NEW)
  - `apps/api/src/database/dto/comparative-balance-sheet.dto.ts` (NEW)

  **Current Implementation:**
  BalanceSheetService exists with:
  - Basic asset/liability/equity calculation
  - PDF and Excel export
  - Retained earnings calculation
  - Current/non-current classification

  **Missing Features:**
  1. Comparative balance sheet (current vs prior period)
  2. Proper opening balances handling
  3. Prior period adjustments
  4. Inter-company eliminations (for groups - placeholder)
  5. IFRS for SMEs Section 4 compliance validation
  6. Materiality threshold for line item aggregation

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Comparative Balance Sheet DTO
  ```typescript
  export interface ComparativeBalanceSheet {
    currentPeriod: BalanceSheet;
    priorPeriod: BalanceSheet;
    variances: BalanceSheetVariances;
    notes: BalanceSheetNote[];
    complianceStatus: IFRSComplianceStatus;
  }

  export interface BalanceSheetVariances {
    assets: {
      current: VarianceItem[];
      nonCurrent: VarianceItem[];
      totalVarianceCents: number;
      totalVariancePercent: number;
    };
    liabilities: {
      current: VarianceItem[];
      nonCurrent: VarianceItem[];
      totalVarianceCents: number;
      totalVariancePercent: number;
    };
    equity: {
      items: VarianceItem[];
      retainedEarningsVarianceCents: number;
      totalVarianceCents: number;
      totalVariancePercent: number;
    };
  }

  export interface VarianceItem {
    account: string;
    description: string;
    currentAmountCents: number;
    priorAmountCents: number;
    varianceCents: number;
    variancePercent: number;
  }

  export interface IFRSComplianceStatus {
    isCompliant: boolean;
    checkedSections: IFRSCheckResult[];
    warnings: string[];
    errors: string[];
  }

  export interface IFRSCheckResult {
    section: string;
    description: string;
    passed: boolean;
    details?: string;
  }
  ```

  ### 3. Comparative Service Pattern
  ```typescript
  import { Injectable, Logger } from '@nestjs/common';
  import Decimal from 'decimal.js';

  @Injectable()
  export class ComparativeBalanceSheetService {
    private readonly logger = new Logger(ComparativeBalanceSheetService.name);

    constructor(
      private readonly balanceSheetService: BalanceSheetService,
      private readonly prisma: PrismaService,
    ) {}

    /**
     * Generate comparative balance sheet (current vs prior period)
     */
    async generateComparative(
      tenantId: string,
      currentDate: Date,
      priorDate: Date,
    ): Promise<ComparativeBalanceSheet> {
      const [currentPeriod, priorPeriod] = await Promise.all([
        this.balanceSheetService.generate(tenantId, currentDate),
        this.balanceSheetService.generate(tenantId, priorDate),
      ]);

      const variances = this.calculateVariances(currentPeriod, priorPeriod);
      const notes = await this.generateNotes(tenantId, currentDate, priorDate);
      const complianceStatus = this.checkIFRSCompliance(currentPeriod);

      return {
        currentPeriod,
        priorPeriod,
        variances,
        notes,
        complianceStatus,
      };
    }

    /**
     * Calculate variances between periods
     */
    private calculateVariances(
      current: BalanceSheet,
      prior: BalanceSheet,
    ): BalanceSheetVariances {
      // Implementation using Decimal.js for precision
    }

    /**
     * Check IFRS for SMEs Section 4 compliance
     */
    private checkIFRSCompliance(balanceSheet: BalanceSheet): IFRSComplianceStatus {
      const checks: IFRSCheckResult[] = [];

      // Section 4.2 - Classification of assets/liabilities
      checks.push(this.checkClassification(balanceSheet));

      // Section 4.3 - Current/Non-current distinction
      checks.push(this.checkCurrentNonCurrentDistinction(balanceSheet));

      // Section 4.5 - Minimum line items
      checks.push(this.checkMinimumLineItems(balanceSheet));

      // Section 4.11 - Additional line items
      checks.push(this.checkMateriality(balanceSheet));

      return {
        isCompliant: checks.every(c => c.passed),
        checkedSections: checks,
        warnings: checks.filter(c => !c.passed).map(c => c.details || c.description),
        errors: [],
      };
    }
  }
  ```

  ### 4. Opening Balance Handling
  ```typescript
  /**
   * Get opening balances for a period
   * Opening balance = Closing balance of prior period
   */
  async getOpeningBalances(
    tenantId: string,
    periodStartDate: Date,
  ): Promise<OpeningBalances> {
    const priorPeriodEnd = new Date(periodStartDate);
    priorPeriodEnd.setDate(priorPeriodEnd.getDate() - 1);

    const priorBalanceSheet = await this.balanceSheetService.generate(
      tenantId,
      priorPeriodEnd,
    );

    return {
      asAtDate: periodStartDate,
      assets: priorBalanceSheet.assets,
      liabilities: priorBalanceSheet.liabilities,
      equity: priorBalanceSheet.equity,
    };
  }

  /**
   * Record prior period adjustment
   * IFRS for SMEs Section 10.19-10.22
   */
  async recordPriorPeriodAdjustment(
    tenantId: string,
    dto: PriorPeriodAdjustmentDto,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // Create adjustment journal entry
      // Update retained earnings opening balance
      // Record in disclosure notes
    });
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
This task completes the balance sheet implementation to meet IFRS for SMEs requirements. The current implementation handles basic calculations, but lacks comparative reporting and compliance validation.

**IFRS for SMEs Section 4 Requirements:**
1. Classification as current/non-current (Section 4.4-4.8)
2. Minimum line items presented (Section 4.2)
3. Additional items when material (Section 4.11)
4. Comparative information (Section 3.14)
5. Consistent presentation (Section 3.11)

**South African Context:**
- Companies Act 2008 requires IFRS-compliant statements
- Small companies may use IFRS for SMEs
- Creches often structured as NPOs (different requirements)
</context>

<scope>
  <in_scope>
    - Create ComparativeBalanceSheetService
    - Add variance calculation (amount and percentage)
    - Implement IFRS for SMEs Section 4 compliance checks
    - Handle opening balances correctly
    - Support prior period adjustments
    - Add materiality threshold configuration
    - Generate disclosure notes automatically
    - Export comparative balance sheet to PDF/Excel
    - Add balance sheet validation rules
  </in_scope>
  <out_of_scope>
    - Full IFRS disclosure requirements (simplified for SMEs)
    - Inter-company eliminations (future feature)
    - Consolidated balance sheets
    - Foreign currency translation
    - NPO-specific reporting (GRAP)
  </out_of_scope>
</scope>

<ifrs_requirements>
## IFRS for SMEs Section 4 - Statement of Financial Position

### 4.2 Minimum Line Items
- Cash and cash equivalents
- Trade and other receivables
- Financial assets
- Inventories
- Property, plant and equipment
- Investment property
- Intangible assets
- Biological assets
- Trade and other payables
- Tax liabilities/assets
- Financial liabilities
- Provisions
- Equity

### 4.4-4.8 Current vs Non-Current Classification
**Current Asset if:**
- Expected to be realised in normal operating cycle
- Held primarily for trading
- Expected to be realised within 12 months
- Cash (unless restricted)

**Current Liability if:**
- Expected to be settled in normal operating cycle
- Held primarily for trading
- Due within 12 months
- No unconditional right to defer settlement

### 4.11 Additional Line Items
Present additional line items, headings and subtotals when:
- Relevant to understanding financial position
- Required by section or standard
- Nature, function or amount warrants separate presentation
</ifrs_requirements>

<verification_commands>
## Execution Order

```bash
# 1. Create comparative DTOs
# Create apps/api/src/database/dto/comparative-balance-sheet.dto.ts

# 2. Create comparative service
# Create apps/api/src/database/services/comparative-balance-sheet.service.ts

# 3. Update balance sheet service
# Edit apps/api/src/database/services/balance-sheet.service.ts

# 4. Update controller
# Edit apps/api/src/api/reconciliation/reconciliation.controller.ts

# 5. Update module
# Edit apps/api/src/api/reconciliation/reconciliation.module.ts

# 6. Create tests
# Create apps/api/tests/database/services/comparative-balance-sheet.service.spec.ts

# 7. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - All monetary values in cents (integer)
    - Use Decimal.js for variance calculations
    - IFRS for SMEs Section 4 compliance required
    - Comparative must show at least one prior period
    - Variance percentage uses prior period as base
    - Materiality threshold: 5% of total assets (configurable)
    - Prior period adjustments require audit trail
    - Export formats: PDF, Excel, JSON
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Generate comparative balance sheet
    - Test: Variance calculation accuracy
    - Test: IFRS compliance check passes for valid data
    - Test: IFRS compliance check fails for invalid classification
    - Test: Opening balance equals prior closing
    - Test: Prior period adjustment recorded correctly
    - Test: Materiality aggregation working
    - Test: Export comparative to PDF
    - Test: Export comparative to Excel
    - Test: Notes generated automatically
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Use floating point for money calculations
  - Skip IFRS compliance validation
  - Ignore prior period adjustments
  - Calculate variance on aggregated totals only
  - Hardcode materiality thresholds
  - Mix current and non-current items
</anti_patterns>

</task_spec>
