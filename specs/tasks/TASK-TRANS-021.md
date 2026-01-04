<task_spec id="TASK-TRANS-021" version="1.0">

<metadata>
  <title>Categorization Explainability Display</title>
  <status>pending</status>
  <phase>8</phase>
  <layer>surface</layer>
  <sequence>127</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-TRANS-007</requirement_ref>
    <user_story_ref>US-TRANS-003</user_story_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-AGENT-002</task_ref>
    <task_ref status="COMPLETE">TASK-WEB-011</task_ref>
    <task_ref status="COMPLETE">TASK-TRANS-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use explainable AI (XAI) UI design patterns.
This task involves:
1. Displaying confidence score prominently
2. Showing reasoning text explaining the decision
3. Visual confidence indicator (progress bar or gauge)
4. Highlighting key matching factors
5. Integration with transaction list and detail views
</reasoning_mode>

<context>
GAP: REQ-TRANS-007 specifies "Each categorization displays confidence score and reasoning explanation." The CategorizationAgent (TASK-AGENT-002) returns confidence and reasoning but the UI does NOT display this information.

Acceptance Criteria (from US-TRANS-003):
- AC-TRANS-003a: User sees confidence score (0-100%) and reasoning text when viewing categorization
- AC-TRANS-003b: Transactions below 80% confidence show "needs review" indicator

This builds user trust by showing WHY the AI made its decision.
</context>

<current_state>
## Codebase State
- CategorizationAgent returns: { category, confidence, reasoning, alternatives }
- Transaction entity stores: categorizationConfidence, categorizationReason
- Transaction list shows category but NOT confidence/reasoning
- Transaction detail shows category but NOT confidence/reasoning

## Backend Response Shape
```typescript
interface CategorizationResult {
  category: string;
  categoryId: string;
  confidence: number;  // 0-100
  reasoning: string;   // "Matched payee pattern: WOOLWORTHS -> Food and Provisions"
  alternatives: Array<{ category: string; confidence: number }>;
}
```
</current_state>

<input_context_files>
  <file purpose="categorization_agent">apps/api/src/agents/categorization.agent.ts</file>
  <file purpose="transaction_entity">apps/api/src/database/entities/transaction.entity.ts</file>
  <file purpose="transactions_page">apps/web/src/app/(dashboard)/transactions/page.tsx</file>
  <file purpose="transaction_detail">apps/web/src/app/(dashboard)/transactions/[id]/page.tsx</file>
</input_context_files>

<scope>
  <in_scope>
    - ConfidenceIndicator component (visual gauge/bar)
    - ReasoningTooltip/Popover component
    - "Needs Review" badge for low confidence
    - Integration in transaction list (compact view)
    - Integration in transaction detail (full view)
    - Alternative suggestions display
  </in_scope>
  <out_of_scope>
    - Changes to categorization logic
    - Confidence threshold configuration (use 80%)
    - Retraining from UI feedback (separate task)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/web/src/components/transactions/ConfidenceIndicator.tsx">
      export interface ConfidenceIndicatorProps {
        confidence: number;
        size?: 'sm' | 'md' | 'lg';
        showLabel?: boolean;
        showNeedsReview?: boolean;
        threshold?: number;
      }

      export function ConfidenceIndicator({
        confidence,
        size = 'md',
        showLabel = true,
        showNeedsReview = true,
        threshold = 80,
      }: ConfidenceIndicatorProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/components/transactions/CategorizationReasoning.tsx">
      export interface CategorizationReasoningProps {
        reasoning: string;
        confidence: number;
        alternatives?: Array<{ category: string; confidence: number }>;
        matchedPatterns?: string[];
      }

      export function CategorizationReasoning({
        reasoning,
        confidence,
        alternatives,
        matchedPatterns,
      }: CategorizationReasoningProps): JSX.Element;
    </signature>
    <signature file="apps/web/src/components/transactions/NeedsReviewBadge.tsx">
      export interface NeedsReviewBadgeProps {
        confidence: number;
        threshold?: number;
      }

      export function NeedsReviewBadge({
        confidence,
        threshold = 80,
      }: NeedsReviewBadgeProps): JSX.Element | null;
    </signature>
  </signatures>

  <constraints>
    - Confidence below 80% shows orange/red indicator
    - Confidence 80%+ shows green indicator
    - Reasoning displayed in expandable tooltip/popover
    - Compact mode for list view (icon + tooltip)
    - Full mode for detail view (inline display)
    - Color-blind accessible (use patterns not just colors)
    - ARIA labels for screen readers
  </constraints>

  <verification>
    - Confidence indicator shows correct percentage
    - Color changes at 80% threshold
    - "Needs Review" badge appears below 80%
    - Reasoning text displays correctly
    - Alternative categories shown
    - Compact mode works in list
    - Full mode works in detail
    - Accessible
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/web/src/components/transactions/ConfidenceIndicator.tsx">Visual confidence gauge</file>
  <file path="apps/web/src/components/transactions/CategorizationReasoning.tsx">Reasoning display</file>
  <file path="apps/web/src/components/transactions/NeedsReviewBadge.tsx">Low confidence badge</file>
  <file path="apps/web/src/components/transactions/AlternativeSuggestions.tsx">Alternative categories</file>
</files_to_create>

<files_to_modify>
  <file path="apps/web/src/app/(dashboard)/transactions/page.tsx">Add confidence column</file>
  <file path="apps/web/src/app/(dashboard)/transactions/[id]/page.tsx">Add full reasoning display</file>
</files_to_modify>

<validation_criteria>
  <criterion>ConfidenceIndicator displays 0-100%</criterion>
  <criterion>Visual indicator changes color at threshold</criterion>
  <criterion>NeedsReviewBadge appears for low confidence</criterion>
  <criterion>Reasoning text visible and readable</criterion>
  <criterion>Alternatives displayed if available</criterion>
  <criterion>Accessible with screen readers</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build --filter=web</command>
  <command>npm run test --filter=web -- --testPathPattern="Confidence|Reasoning" --verbose</command>
</test_commands>

</task_spec>
