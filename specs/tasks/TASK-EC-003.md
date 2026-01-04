<task_spec id="TASK-EC-003" version="1.0">

<metadata>
  <title>Recurring Amount Variation Threshold Configuration</title>
  <status>complete</status>
  <phase>8</phase>
  <layer>logic</layer>
  <sequence>138</sequence>
  <priority>P3-MEDIUM</priority>
  <implements>
    <edge_case_ref>EC-TRANS-003</edge_case_ref>
    <requirement_ref>REQ-TRANS-006</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-019</task_ref>
    <task_ref status="COMPLETE">TASK-TRANS-013</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use statistical analysis and configuration management patterns.
This task involves:
1. Configurable variation threshold for recurring transactions
2. Statistical analysis of amount variations
3. Flagging when variation exceeds threshold
4. Per-payee threshold configuration
5. Default threshold with override capability
</reasoning_mode>

<context>
EDGE CASE EC-TRANS-003: "Recurring transaction amount changes by more than 50% from historical average."

Expected behavior:
- Flag for review even if payee matches
- Do not auto-categorize
- Alert may indicate pricing change or error

The current implementation in TASK-TRANS-019 uses a fixed 30% threshold. This task makes it configurable and handles edge cases better.
</context>

<current_state>
## Codebase State
- RecurringDetectionService exists (TASK-TRANS-019)
- Fixed variation threshold (30%) hardcoded
- No per-payee configuration
- No flagging of exceeded thresholds

## Current Implementation
```typescript
// In recurring-detection.service.ts
const VARIATION_THRESHOLD = 0.30;  // Hardcoded!

if (Math.abs(current - average) / average > VARIATION_THRESHOLD) {
  // Currently just marks as non-recurring
}
```
</current_state>

<input_context_files>
  <file purpose="recurring_service">apps/api/src/database/services/recurring-detection.service.ts</file>
  <file purpose="pattern_entity">apps/api/src/database/entities/payee-pattern.entity.ts</file>
  <file purpose="tenant_entity">apps/api/src/database/entities/tenant.entity.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Configurable default threshold per tenant
    - Per-payee threshold override
    - Statistical analysis (mean, std dev)
    - Z-score based anomaly detection
    - Flagging service for exceeded thresholds
    - Configuration API endpoints
  </in_scope>
  <out_of_scope>
    - UI for threshold configuration (surface layer)
    - Machine learning for threshold prediction
    - Cross-tenant threshold sharing
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/entities/amount-threshold-config.entity.ts">
      @Entity('amount_threshold_configs')
      export class AmountThresholdConfig {
        @PrimaryGeneratedColumn('uuid')
        id: string;

        @Column()
        tenantId: string;

        @Column({ nullable: true })
        payeePattern?: string;  // null = default for tenant

        @Column({ type: 'decimal', precision: 5, scale: 2, default: 30.00 })
        percentageThreshold: Decimal;  // e.g., 30.00 = 30%

        @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true })
        absoluteThreshold?: Decimal;  // e.g., R100 max variation

        @Column({ default: true })
        flagOnExceed: boolean;

        @Column({ default: false })
        blockAutoCategorizationOnExceed: boolean;
      }
    </signature>
    <signature file="apps/api/src/database/services/amount-variation.service.ts">
      export interface VariationAnalysis {
        currentAmount: Decimal;
        historicalMean: Decimal;
        historicalStdDev: Decimal;
        percentageVariation: number;
        absoluteVariation: Decimal;
        zScore: number;
        exceedsThreshold: boolean;
        thresholdType: 'percentage' | 'absolute' | 'z_score';
        recommendedAction: 'auto_categorize' | 'flag_review' | 'block';
      }

      @Injectable()
      export class AmountVariationService {
        async analyzeVariation(
          tenantId: string,
          payee: string,
          amount: Decimal
        ): Promise<VariationAnalysis>;

        async getThresholdConfig(
          tenantId: string,
          payee?: string
        ): Promise<AmountThresholdConfig>;

        async setThresholdConfig(
          tenantId: string,
          config: Partial<AmountThresholdConfig>,
          payee?: string
        ): Promise<AmountThresholdConfig>;

        async getPayeeStatistics(
          tenantId: string,
          payee: string
        ): Promise<{
          mean: Decimal;
          stdDev: Decimal;
          min: Decimal;
          max: Decimal;
          count: number;
        }>;
      }
    </signature>
  </signatures>

  <constraints>
    - Default threshold: 30% variation
    - Z-score threshold: 2.5 (for statistical anomaly)
    - Per-payee config overrides tenant default
    - Minimum 3 historical transactions for statistics
    - Flag creates review item (not just warning)
    - Block prevents auto-categorization
    - Audit log for threshold changes
  </constraints>

  <verification>
    - Default threshold works
    - Per-payee override works
    - Statistical analysis accurate
    - Exceeding threshold flags transaction
    - Block option prevents auto-categorization
    - API endpoints work
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/database/entities/amount-threshold-config.entity.ts">Config entity</file>
  <file path="apps/api/src/database/services/amount-variation.service.ts">Analysis service</file>
  <file path="apps/api/src/database/services/__tests__/amount-variation.service.spec.ts">Tests</file>
  <file path="apps/api/src/config/config.controller.ts">Config API endpoints</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/services/recurring-detection.service.ts">Use AmountVariationService</file>
  <file path="apps/api/src/database/services/transaction-categorization.service.ts">Check variation before auto-categorize</file>
  <file path="apps/api/prisma/schema.prisma">Add AmountThresholdConfig model</file>
</files_to_modify>

<validation_criteria>
  <criterion>AmountThresholdConfig entity created</criterion>
  <criterion>AmountVariationService created</criterion>
  <criterion>Statistical analysis works</criterion>
  <criterion>Default threshold applied</criterion>
  <criterion>Per-payee override works</criterion>
  <criterion>Flagging on exceed works</criterion>
  <criterion>API endpoints work</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev --name add_amount_threshold_config</command>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="amount-variation" --verbose</command>
</test_commands>

</task_spec>
