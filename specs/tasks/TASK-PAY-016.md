<task_spec id="TASK-PAY-016" version="1.0">

<metadata>
  <title>Invoke PaymentMatcherAgent in PaymentMatchingService</title>
  <status>pending</status>
  <layer>logic</layer>
  <sequence>103</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-PAY-002</requirement_ref>
    <critical_issue_ref>CRIT-012</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-PAY-002</task_ref>
    <task_ref status="COMPLETE">TASK-PAY-004</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use AI integration thinking.
This task involves:
1. Importing PaymentMatcherAgent
2. Invoking makeMatchDecision for ambiguous matches
3. Using confidence thresholds for auto-apply
4. Logging agent decisions
5. Fallback for agent failures
</reasoning_mode>

<context>
CRITICAL GAP: PaymentMatcherAgent exists but is NEVER invoked by PaymentMatchingService.

Evidence: `PaymentMatchingService` does not import or call `PaymentMatcherAgent.makeMatchDecision()`.

This task integrates the existing AI agent to improve payment matching accuracy for ambiguous cases.
</context>

<current_state>
## Codebase State
- PaymentMatcherAgent exists at apps/api/src/agents/payment-matcher.agent.ts
- PaymentMatchingService exists at apps/api/src/database/services/payment-matching.service.ts
- No integration between them
- Rule-based matching only

## What Exists
- PaymentMatcherAgent.makeMatchDecision(payment, candidates)
- PaymentMatchingService.findMatches(transactionId)
- MatchCandidate interface
</current_state>

<input_context_files>
  <file purpose="agent">apps/api/src/agents/payment-matcher.agent.ts</file>
  <file purpose="matching_service">apps/api/src/database/services/payment-matching.service.ts</file>
  <file purpose="match_types">apps/api/src/database/types/payment-matching.types.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Import PaymentMatcherAgent in PaymentMatchingService
    - Call agent for ambiguous matches (multiple candidates)
    - Apply confidence thresholds
    - Log agent decisions for audit
    - Fallback to rule-based on agent failure
  </in_scope>
  <out_of_scope>
    - Agent retraining (separate task)
    - UI for agent decisions review
    - Agent performance metrics
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/payment-matching.service.ts">
      @Injectable()
      export class PaymentMatchingService {
        constructor(
          private readonly paymentAgent: PaymentMatcherAgent,
          // ... existing dependencies
        ) {}

        async findMatches(transactionId: string): Promise<MatchResult>;

        private async resolveAmbiguousMatch(
          payment: Transaction,
          candidates: MatchCandidate[]
        ): Promise<MatchDecision>;

        private async applyMatchDecision(
          payment: Transaction,
          decision: MatchDecision
        ): Promise<void>;
      }
    </signature>
  </signatures>

  <constraints>
    - Agent invoked ONLY for ambiguous matches (2+ candidates)
    - Confidence > 85: auto-apply match
    - Confidence 60-85: suggest to user
    - Confidence < 60: flag for manual review
    - Max 3 retries on agent failure
    - Fallback to first rule-based match on complete failure
    - All agent decisions logged
  </constraints>

  <verification>
    - PaymentMatcherAgent imported and injected
    - makeMatchDecision() called for ambiguous cases
    - High confidence matches auto-applied
    - Low confidence flagged for review
    - Agent decisions logged to audit
    - Fallback works when agent unavailable
    - Tests pass
  </verification>
</definition_of_done>

<files_to_modify>
  <file path="apps/api/src/database/services/payment-matching.service.ts">Add agent integration</file>
  <file path="apps/api/src/database/database.module.ts">Ensure agent is provided</file>
</files_to_modify>

<files_to_create>
  <file path="apps/api/src/database/services/__tests__/payment-matching-agent.spec.ts">Agent integration tests</file>
</files_to_create>

<validation_criteria>
  <criterion>Agent injected in constructor</criterion>
  <criterion>Agent called for ambiguous matches</criterion>
  <criterion>Confidence thresholds applied</criterion>
  <criterion>Decisions logged</criterion>
  <criterion>Fallback on failure</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="payment-matching" --verbose</command>
</test_commands>

</task_spec>
