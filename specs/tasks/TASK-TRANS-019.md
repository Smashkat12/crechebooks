<task_spec id="TASK-TRANS-019" version="1.0">

<metadata>
  <title>Recurring Transaction Detection Integration</title>
  <status>pending</status>
  <layer>logic</layer>
  <sequence>107</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-TRANS-006</requirement_ref>
    <critical_issue_ref>HIGH-001</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-013</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>2 days</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use pattern recognition and integration thinking.
This task involves:
1. Integrating existing RecurringDetectionService
2. Auto-detecting monthly/weekly patterns
3. Pre-categorizing recurring transactions
4. UI for recurring transaction management
5. Pattern confidence scoring
</reasoning_mode>

<context>
ISSUE: Recurring detection logic exists in PatternLearningService but is NOT integrated into the main categorization flow. Users cannot benefit from automatic recurring transaction detection.

REQ-TRANS-006 specifies: "System detects recurring transactions and applies patterns."

This task integrates the existing detection logic into the main transaction processing flow.
</context>

<current_state>
## Codebase State
- PatternLearningService exists (TASK-TRANS-013)
- TransactionCategorizationService exists (TASK-TRANS-012)
- RecurringPattern entity exists
- Detection logic NOT called during categorization

## What Exists
- learnFromRecurring() method
- Pattern matching by interval
- Confidence scoring
</current_state>

<input_context_files>
  <file purpose="categorization_service">apps/api/src/database/services/transaction-categorization.service.ts</file>
  <file purpose="pattern_service">apps/api/src/database/services/pattern-learning.service.ts</file>
  <file purpose="recurring_entity">apps/api/src/database/entities/recurring-pattern.entity.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Integrate RecurringDetectionService into categorization
    - Auto-detect monthly, weekly, bi-weekly patterns
    - Pre-categorize matching recurring transactions
    - Confidence threshold for auto-apply
    - API endpoint for recurring management
  </in_scope>
  <out_of_scope>
    - UI components (separate WEB task)
    - Custom interval patterns beyond monthly/weekly
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/recurring-detection.service.ts">
      @Injectable()
      export class RecurringDetectionService {
        async detectRecurring(tenantId: string, transaction: Transaction): Promise<RecurringMatch | null>;
        async getRecurringPatterns(tenantId: string): Promise<RecurringPattern[]>;
        async createPattern(tenantId: string, dto: CreateRecurringPatternDto): Promise<RecurringPattern>;
        async applyRecurringCategory(tenantId: string, transactionId: string): Promise<void>;
      }
    </signature>
  </signatures>

  <constraints>
    - Minimum 3 occurrences to detect pattern
    - Interval variance: +/- 3 days for monthly, +/- 1 day for weekly
    - Confidence > 80% for auto-apply
    - Tenant-isolated patterns
  </constraints>

  <verification>
    - Recurring patterns detected automatically
    - Matching transactions pre-categorized
    - Manual override supported
    - Patterns tenant-isolated
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/database/services/recurring-detection.service.ts">Detection service</file>
  <file path="apps/api/src/database/dto/recurring-pattern.dto.ts">DTOs</file>
  <file path="apps/api/src/database/services/__tests__/recurring-detection.service.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/services/transaction-categorization.service.ts">Integrate recurring detection</file>
</files_to_modify>

<validation_criteria>
  <criterion>RecurringDetectionService created</criterion>
  <criterion>Integrated into categorization flow</criterion>
  <criterion>Patterns detected with min 3 occurrences</criterion>
  <criterion>Auto-apply at 80%+ confidence</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="recurring-detection" --verbose</command>
</test_commands>

</task_spec>
