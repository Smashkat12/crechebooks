<task_spec id="TASK-SARS-018" version="1.0">

<metadata>
  <title>SARS eFiling Submission Error Handling and Retry</title>
  <status>pending</status>
  <layer>logic</layer>
  <sequence>114</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-SARS-012</requirement_ref>
    <critical_issue_ref>HIGH-007</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-SARS-014</task_ref>
    <task_ref status="COMPLETE">TASK-SARS-015</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>1 day</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use resilience and error handling thinking.
This task involves:
1. Retry logic for failed submissions
2. Submission state persistence
3. Admin alerts on failures
4. SARS API response logging
5. Dead-letter queue for manual review
</reasoning_mode>

<context>
ISSUE: No error handling for SARS eFiling API failures. If submission fails, user has no visibility into what happened or how to retry.

REQ-SARS-012 specifies: "Track submission status (Draft, Submitted, Accepted, Rejected)."

This task adds robust error handling with retry capability.
</context>

<current_state>
## Codebase State
- VAT201GenerationService exists (TASK-SARS-014)
- EMP201GenerationService exists (TASK-SARS-015)
- SarsSubmission entity tracks status
- No retry logic on failure

## What's Missing
- Automatic retry mechanism
- Submission state machine
- Error classification
- Admin notification
</current_state>

<input_context_files>
  <file purpose="vat201_service">apps/api/src/database/services/vat201-generation.service.ts</file>
  <file purpose="emp201_service">apps/api/src/database/services/emp201-generation.service.ts</file>
  <file purpose="submission_entity">apps/api/src/database/entities/sars-submission.entity.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - Retry failed submissions 3 times with exponential backoff
    - Store submission state for resume
    - Classify errors (transient vs permanent)
    - Alert admin on persistent failures
    - Log all SARS API responses
    - Dead-letter queue after max retries
  </in_scope>
  <out_of_scope>
    - SARS API credential management
    - New submission types
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/database/services/sars-submission-retry.service.ts">
      @Injectable()
      export class SarsSubmissionRetryService {
        async submitWithRetry(submissionId: string): Promise<SubmissionResult>;
        async retryFailed(submissionId: string): Promise<SubmissionResult>;
        async getSubmissionState(submissionId: string): Promise<SubmissionState>;
        async moveToDlq(submissionId: string, reason: string): Promise<void>;
        private async classifyError(error: SarsApiError): Promise<ErrorType>;
        private async notifyAdmin(submission: SarsSubmission, error: SarsApiError): Promise<void>;
      }
    </signature>
  </signatures>

  <constraints>
    - Max 3 retries per submission
    - Exponential backoff: 1min, 5min, 15min
    - Transient errors: timeout, 503, rate limit
    - Permanent errors: validation, 4xx
    - All API responses logged with correlation ID
  </constraints>

  <verification>
    - Retries triggered automatically
    - State preserved across retries
    - Errors classified correctly
    - Admin notified after max retries
    - DLQ contains failed submissions
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/database/services/sars-submission-retry.service.ts">Retry service</file>
  <file path="apps/api/src/database/types/sars-submission.types.ts">Types for submission states</file>
  <file path="apps/api/src/database/services/__tests__/sars-submission-retry.service.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/services/vat201-generation.service.ts">Use retry service</file>
  <file path="apps/api/src/database/services/emp201-generation.service.ts">Use retry service</file>
</files_to_modify>

<validation_criteria>
  <criterion>Retry service created</criterion>
  <criterion>Exponential backoff works</criterion>
  <criterion>Errors classified correctly</criterion>
  <criterion>Admin notified on failure</criterion>
  <criterion>DLQ populated after max retries</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="sars-submission-retry" --verbose</command>
</test_commands>

</task_spec>
