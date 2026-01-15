<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-STAFF-001</task_id>
    <title>Implement Xero Journal Posting</title>
    <priority>CRITICAL</priority>
    <status>DONE</status>
    <phase>16-remediation</phase>
    <category>integration</category>
    <estimated_effort>8 hours</estimated_effort>
    <assignee>unassigned</assignee>
    <created_date>2026-01-15</created_date>
    <due_date>2026-01-22</due_date>
    <tags>xero, integration, journal, accounting, critical-fix</tags>
  </metadata>

  <context>
    <problem_statement>
      The Xero journal posting functionality is currently mocked and does not actually post
      journal entries to the Xero accounting system. This means financial data is not being
      synchronized with the accounting platform, creating data integrity issues and manual
      reconciliation requirements.
    </problem_statement>

    <business_impact>
      - Financial records in Xero are incomplete/missing journal entries
      - Manual intervention required to post journals
      - Audit trail gaps between CrecheBooks and Xero
      - Potential compliance issues with financial reporting
      - Staff unable to rely on automated accounting integration
    </business_impact>

    <technical_background>
      The xero-journal.service.ts file contains placeholder/mock implementations that
      simulate success responses without making actual API calls to Xero. The Xero API
      requires OAuth2 authentication, proper tenant handling, and specific payload
      formatting for journal entries.
    </technical_background>

    <dependencies>
      - Xero OAuth2 credentials configured
      - Xero tenant ID available
      - Valid chart of accounts mapping
    </dependencies>
  </context>

  <scope>
    <in_scope>
      <item>Implement actual Xero API journal posting via xero-node SDK</item>
      <item>Add proper OAuth2 token refresh handling</item>
      <item>Implement error handling for Xero API errors</item>
      <item>Add retry logic for transient failures</item>
      <item>Create audit logging for posted journals</item>
      <item>Add validation for journal entry data before posting</item>
    </in_scope>

    <out_of_scope>
      <item>Chart of accounts synchronization (separate task)</item>
      <item>Xero OAuth2 initial setup flow</item>
      <item>Bulk journal import functionality</item>
    </out_of_scope>

    <affected_files>
      <file action="modify">apps/api/src/integrations/xero/xero-journal.service.ts</file>
      <file action="modify">apps/api/src/integrations/xero/xero-client.service.ts</file>
      <file action="create">apps/api/src/integrations/xero/dto/xero-journal.dto.ts</file>
      <file action="create">apps/api/src/integrations/xero/xero-journal.errors.ts</file>
    </affected_files>
  </scope>

  <implementation>
    <approach>
      Replace mock implementations with actual Xero API calls using the xero-node SDK.
      Implement proper error handling, token management, and audit logging.
    </approach>

    <steps>
      <step order="1">
        <description>Review current mock implementation and identify all methods needing real implementation</description>
        <details>
          Document all mocked methods in xero-journal.service.ts and their expected inputs/outputs.
        </details>
      </step>

      <step order="2">
        <description>Create DTOs for Xero journal requests and responses</description>
        <details>
          Create xero-journal.dto.ts with proper validation decorators for:
          - JournalLineDto (account code, description, debit/credit amounts)
          - CreateJournalDto (date, narration, lines array)
          - JournalResponseDto (Xero response mapping)
        </details>
      </step>

      <step order="3">
        <description>Implement Xero API client token refresh</description>
        <details>
          Ensure xero-client.service.ts properly handles OAuth2 token refresh before API calls.
          Add token expiry checking and automatic refresh logic.
        </details>
      </step>

      <step order="4">
        <description>Implement createJournal method</description>
        <details>
          ```typescript
          async createJournal(tenantId: string, journal: CreateJournalDto): Promise<JournalResponseDto> {
            await this.xeroClient.refreshTokenIfNeeded();

            const journalEntry: ManualJournal = {
              narration: journal.narration,
              date: journal.date,
              journalLines: journal.lines.map(line => ({
                accountCode: line.accountCode,
                description: line.description,
                lineAmount: line.isDebit ? line.amount : -line.amount,
                taxType: line.taxType || 'NONE'
              }))
            };

            const response = await this.xeroClient.accountingApi.createManualJournals(
              tenantId,
              { manualJournals: [journalEntry] }
            );

            return this.mapToResponseDto(response.body.manualJournals[0]);
          }
          ```
        </details>
      </step>

      <step order="5">
        <description>Add comprehensive error handling</description>
        <details>
          Create custom error classes for different Xero API error scenarios:
          - XeroAuthenticationError (401/403)
          - XeroValidationError (400)
          - XeroRateLimitError (429)
          - XeroServerError (5xx)
        </details>
      </step>

      <step order="6">
        <description>Implement retry logic with exponential backoff</description>
        <details>
          Add retry mechanism for transient failures (network errors, 429, 5xx).
          Use exponential backoff: 1s, 2s, 4s, max 3 retries.
        </details>
      </step>

      <step order="7">
        <description>Add audit logging for all journal operations</description>
        <details>
          Log successful posts with Xero journal ID, timestamp, and amounts.
          Log failures with error details for troubleshooting.
        </details>
      </step>
    </steps>

    <code_patterns>
      <pattern name="Error Handling">
        ```typescript
        try {
          const response = await this.xeroClient.accountingApi.createManualJournals(...);
          this.logger.log(`Journal posted successfully: ${response.body.manualJournals[0].manualJournalID}`);
          return response;
        } catch (error) {
          if (error.response?.statusCode === 401) {
            throw new XeroAuthenticationError('Xero authentication failed - token may be expired');
          }
          if (error.response?.statusCode === 400) {
            throw new XeroValidationError('Invalid journal data', error.response.body);
          }
          throw new XeroServerError('Xero API error', error);
        }
        ```
      </pattern>
    </code_patterns>
  </implementation>

  <verification>
    <test_requirements>
      <test type="unit">
        <description>Test journal DTO validation</description>
        <file>apps/api/src/integrations/xero/__tests__/xero-journal.service.spec.ts</file>
      </test>

      <test type="unit">
        <description>Test error handling for various Xero API error codes</description>
        <file>apps/api/src/integrations/xero/__tests__/xero-journal.service.spec.ts</file>
      </test>

      <test type="integration">
        <description>Test actual Xero API journal posting with sandbox</description>
        <file>apps/api/src/integrations/xero/__tests__/xero-journal.integration.spec.ts</file>
      </test>

      <test type="e2e">
        <description>Test full payroll to Xero journal flow</description>
        <file>apps/api/test/e2e/payroll-xero-journal.e2e-spec.ts</file>
      </test>
    </test_requirements>

    <acceptance_criteria>
      <criterion>Journal entries successfully post to Xero when payroll is finalized</criterion>
      <criterion>OAuth2 token automatically refreshes when expired</criterion>
      <criterion>API errors are properly caught and logged with meaningful messages</criterion>
      <criterion>Transient failures are retried up to 3 times with exponential backoff</criterion>
      <criterion>All journal postings are logged with Xero journal IDs for audit trail</criterion>
      <criterion>Invalid journal data is rejected with validation errors before API call</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item>All mock implementations replaced with actual Xero API calls</item>
      <item>OAuth2 token refresh implemented and tested</item>
      <item>Error handling covers all common Xero API error scenarios</item>
      <item>Retry logic implemented with exponential backoff</item>
      <item>Audit logging in place for all journal operations</item>
      <item>Unit tests achieve 90%+ coverage</item>
      <item>Integration tests pass against Xero sandbox</item>
      <item>Code reviewed and approved</item>
      <item>Documentation updated for Xero integration</item>
      <item>No TypeScript errors or lint warnings</item>
    </checklist>
  </definition_of_done>

  <references>
    <reference type="api">https://developer.xero.com/documentation/api/accounting/manualjournals</reference>
    <reference type="sdk">https://github.com/XeroAPI/xero-node</reference>
    <reference type="related_task">TASK-STAFF-003 (SimplePay Sync - similar retry pattern)</reference>
  </references>
</task_specification>
