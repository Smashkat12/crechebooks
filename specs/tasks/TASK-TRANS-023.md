<task_spec id="TASK-TRANS-023" version="1.0">

<metadata>
  <title>Learning Mode Indicator for New Tenants</title>
  <status>complete</status>
  <phase>8</phase>
  <layer>surface</layer>
  <sequence>129</sequence>
  <priority>P3-MEDIUM</priority>
  <implements>
    <edge_case_ref>EC-TRANS-007</edge_case_ref>
    <requirement_ref>REQ-TRANS-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-TRANS-017</task_ref>
    <task_ref status="COMPLETE">TASK-WEB-017</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
  <estimated_effort>3 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use user onboarding and expectation management UX patterns.
This task involves:
1. Detecting "learning mode" (first 3 months or <100 corrections)
2. Displaying learning mode indicator on dashboard
3. Setting appropriate expectations about accuracy
4. Encouraging corrections to improve accuracy
5. Celebrating milestones (50 corrections, 95% accuracy, etc.)
</reasoning_mode>

<context>
EDGE CASE EC-TRANS-007: "During first month of usage, all transactions have low confidence scores."

Expected behavior:
- Display "learning mode" indicator on dashboard
- Explain that accuracy improves with corrections
- Prioritize showing transactions for review
- Do not count toward accuracy metrics (first 3 months)

This manages user expectations and encourages the feedback loop that improves the AI.
</context>

<current_state>
## Codebase State
- AccuracyTrackingService exists (TASK-TRANS-017)
- Dashboard exists at apps/web/src/app/(dashboard)/page.tsx
- No learning mode detection
- No learning mode UI indicator

## Accuracy Service (from TASK-TRANS-017)
```typescript
// Accuracy tracking exists but doesn't expose learning mode
interface TenantAccuracy {
  totalCategorized: number;
  totalCorrections: number;
  accuracyRate: number;
  firstTransactionDate: Date;
}
```
</current_state>

<input_context_files>
  <file purpose="accuracy_service">apps/api/src/database/services/accuracy-tracking.service.ts</file>
  <file purpose="dashboard_page">apps/web/src/app/(dashboard)/page.tsx</file>
  <file purpose="transaction_list">apps/web/src/app/(dashboard)/transactions/page.tsx</file>
</input_context_files>

<scope>
  <in_scope>
    - Learning mode detection logic
    - LearningModeIndicator component
    - Dashboard integration
    - Milestone celebrations
    - Accuracy exclusion during learning period
    - API endpoint for learning mode status
  </in_scope>
  <out_of_scope>
    - Accuracy algorithm changes
    - Notification system for milestones
    - Admin override of learning mode
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/accuracy-tracking.service.ts">
      // Add to existing service
      async isInLearningMode(tenantId: string): Promise<boolean>;
      async getLearningModeProgress(tenantId: string): Promise<{
        isLearningMode: boolean;
        daysRemaining: number;
        correctionsCount: number;
        correctionsTarget: number;
        progressPercent: number;
        currentAccuracy: number;
        excludeFromMetrics: boolean;
      }>;
    </signature>
    <signature file="apps/web/src/components/dashboard/LearningModeIndicator.tsx">
      export interface LearningModeIndicatorProps {
        progress: LearningModeProgress;
        onDismiss?: () => void;
      }

      export function LearningModeIndicator({
        progress,
        onDismiss,
      }: LearningModeIndicatorProps): JSX.Element | null;
    </signature>
    <signature file="apps/web/src/components/dashboard/AccuracyMilestone.tsx">
      export interface AccuracyMilestoneProps {
        milestone: 'first_correction' | 'fifty_corrections' | 'high_accuracy' | 'learning_complete';
        onDismiss: () => void;
      }

      export function AccuracyMilestone({
        milestone,
        onDismiss,
      }: AccuracyMilestoneProps): JSX.Element;
    </signature>
  </signatures>

  <constraints>
    - Learning mode: first 90 days OR <100 corrections
    - Exit learning mode when BOTH: 90+ days AND 100+ corrections
    - Progress bar shows completion percentage
    - Friendly, encouraging tone in messages
    - Dismissible but returns if still in learning mode
    - Milestones stored per tenant (don't repeat)
    - Dashboard shows indicator prominently
  </constraints>

  <verification>
    - New tenant shows learning mode indicator
    - Progress updates with corrections
    - Indicator dismissible
    - Milestones celebrated once
    - Indicator disappears after learning complete
    - Accuracy metrics exclude learning period
    - API returns correct status
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/dashboard/LearningModeIndicator.tsx">Main indicator</file>
  <file path="apps/web/src/components/dashboard/AccuracyMilestone.tsx">Celebration modal</file>
  <file path="apps/web/src/hooks/useLearningMode.ts">Hook for learning mode state</file>
  <file path="apps/api/src/accuracy/accuracy.controller.ts">API endpoint</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/services/accuracy-tracking.service.ts">Add learning mode methods</file>
  <file path="apps/web/src/app/(dashboard)/page.tsx">Add indicator to dashboard</file>
</files_to_modify>

<validation_criteria>
  <criterion>Learning mode detected for new tenants</criterion>
  <criterion>Indicator displays on dashboard</criterion>
  <criterion>Progress bar shows percentage</criterion>
  <criterion>Milestones celebrated</criterion>
  <criterion>Indicator disappears after completion</criterion>
  <criterion>API endpoint works</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="learning-mode|accuracy" --verbose</command>
</test_commands>

</task_spec>
