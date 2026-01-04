<task_spec id="TASK-TRANS-017" version="1.0">

<metadata>
  <title>Transaction Categorization Accuracy Tracking Service</title>
  <status>complete</status>
  <layer>logic</layer>
  <sequence>98</sequence>
  <priority>P0-BLOCKER</priority>
  <implements>
    <requirement_ref>REQ-TRANS-003</requirement_ref>
    <critical_issue_ref>CRIT-008</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>3 days</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use analytical reasoning with metrics focus.
This task involves:
1. Metrics collection on every categorization
2. Correction tracking
3. Accuracy calculation (rolling 30-day)
4. Trend analysis over time
5. Alert thresholds
</reasoning_mode>

<context>
CRITICAL GAP: Cannot measure or report AI categorization accuracy. REQ-TRANS-003 requires "95% accuracy after 3 months of training" but there's no way to track this.

This task creates AccuracyMetricsService to:
- Track every auto-categorization
- Track every user correction
- Calculate accuracy percentage
- Provide accuracy reports and trends
- Alert when accuracy drops below threshold
</context>

<current_state>
## Codebase State
- TransactionCategorizationService exists (TASK-TRANS-012)
- PatternLearningService.learnFromCorrection() exists (TASK-TRANS-013)
- No metrics tracking infrastructure

## What's Missing
- CategorizationMetric entity
- AccuracyMetricsService
- API endpoint for accuracy reports
- Dashboard widget data
</current_state>

<input_context_files>
  <file purpose="categorization_service">apps/api/src/database/services/transaction-categorization.service.ts</file>
  <file purpose="pattern_service">apps/api/src/database/services/pattern-learning.service.ts</file>
  <file purpose="prisma_schema">apps/api/prisma/schema.prisma</file>
</input_context_files>

<scope>
  <in_scope>
    - CategorizationMetric entity and migration
    - AccuracyMetricsService for tracking and reporting
    - Integration with TransactionCategorizationService
    - Integration with PatternLearningService
    - Rolling 30-day accuracy calculation
    - Accuracy trend by week/month
    - Alert threshold configuration
  </in_scope>
  <out_of_scope>
    - UI components (surface layer)
    - Email notifications for alerts (separate task)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/accuracy-metrics.service.ts">
      @Injectable()
      export class AccuracyMetricsService {
        async recordCategorization(tenantId: string, transactionId: string, confidence: number, isAutoApplied: boolean): Promise<void>;
        async recordCorrection(tenantId: string, transactionId: string, originalCategory: string, correctedCategory: string): Promise<void>;
        async getAccuracy(tenantId: string, options?: AccuracyOptions): Promise<AccuracyReport>;
        async getTrend(tenantId: string, periodDays: number): Promise<AccuracyTrend[]>;
        async checkThreshold(tenantId: string): Promise<ThresholdCheckResult>;
      }
    </signature>
    <signature file="apps/api/src/database/entities/categorization-metric.entity.ts">
      export interface CategorizationMetric {
        id: string;
        tenantId: string;
        transactionId: string;
        date: Date;
        eventType: 'CATEGORIZED' | 'CORRECTED';
        confidence: number;
        isAutoApplied: boolean;
        originalCategory?: string;
        correctedCategory?: string;
        createdAt: Date;
      }
    </signature>
    <signature file="apps/api/src/database/dto/accuracy.dto.ts">
      export interface AccuracyReport {
        tenantId: string;
        periodStart: Date;
        periodEnd: Date;
        totalCategorized: number;
        totalCorrected: number;
        accuracyPercentage: number;
        averageConfidence: number;
        autoApplyRate: number;
      }

      export interface AccuracyTrend {
        period: string;
        accuracyPercentage: number;
        totalTransactions: number;
      }
    </signature>
  </signatures>

  <constraints>
    - Accuracy = (totalCategorized - totalCorrected) / totalCategorized * 100
    - Default rolling window: 30 days
    - Alert threshold: < 90% accuracy
    - Metrics stored per tenant
    - No personally identifiable data in metrics
  </constraints>

  <verification>
    - Categorization events recorded
    - Correction events recorded
    - Accuracy calculated correctly
    - Trend data aggregates properly
    - Threshold alerts triggered
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/database/services/accuracy-metrics.service.ts">Accuracy tracking service</file>
  <file path="apps/api/src/database/entities/categorization-metric.entity.ts">Metric entity</file>
  <file path="apps/api/src/database/dto/accuracy.dto.ts">DTOs</file>
  <file path="apps/api/prisma/migrations/YYYYMMDD_add_categorization_metrics/migration.sql">Migration</file>
  <file path="apps/api/src/database/services/__tests__/accuracy-metrics.service.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/prisma/schema.prisma">Add CategorizationMetric model</file>
  <file path="apps/api/src/database/services/transaction-categorization.service.ts">Call recordCategorization</file>
  <file path="apps/api/src/database/services/pattern-learning.service.ts">Call recordCorrection</file>
</files_to_modify>

<validation_criteria>
  <criterion>CategorizationMetric entity created</criterion>
  <criterion>Categorizations tracked automatically</criterion>
  <criterion>Corrections tracked automatically</criterion>
  <criterion>Accuracy calculation is correct</criterion>
  <criterion>Trend data aggregates properly</criterion>
  <criterion>Alert threshold works</criterion>
</validation_criteria>

<test_commands>
  <command>npx prisma migrate dev</command>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="accuracy-metrics" --verbose</command>
</test_commands>

</task_spec>
