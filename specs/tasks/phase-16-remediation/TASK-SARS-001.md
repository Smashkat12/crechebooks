<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-SARS-001</task_id>
    <title>Use Typed NestJS Exceptions</title>
    <priority>MEDIUM</priority>
    <severity>MEDIUM</severity>
    <category>code-quality</category>
    <estimated_effort>2-3 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>phase-16-remediation</phase>
    <status>DONE</status>
    <tags>
      <tag>sars</tag>
      <tag>error-handling</tag>
      <tag>nestjs</tag>
      <tag>exceptions</tag>
    </tags>
  </metadata>

  <context>
    <issue_description>
      The SARS module uses generic JavaScript Error classes instead of typed NestJS exceptions.
      This leads to inconsistent error responses, poor error categorization, and makes it
      difficult for clients to handle specific error cases appropriately.
    </issue_description>

    <current_behavior>
      Services throw generic `new Error('message')` which results in 500 Internal Server Error
      responses regardless of the actual error type (validation, not found, bad request, etc.).
    </current_behavior>

    <expected_behavior>
      Services should throw typed NestJS exceptions (HttpException, BadRequestException,
      NotFoundException, etc.) that map to appropriate HTTP status codes and provide
      structured error responses.
    </expected_behavior>

    <affected_files>
      <file>apps/api/src/sars/*.ts</file>
      <file>apps/api/src/sars/vat201.service.ts</file>
      <file>apps/api/src/sars/emp201.service.ts</file>
      <file>apps/api/src/sars/deadline.service.ts</file>
      <file>apps/api/src/sars/submission.service.ts</file>
    </affected_files>

    <related_issues>
      <issue>Generic error responses make debugging difficult</issue>
      <issue>API consumers cannot differentiate error types</issue>
      <issue>No structured error format for validation failures</issue>
    </related_issues>
  </context>

  <scope>
    <in_scope>
      <item>Replace all `throw new Error()` with typed NestJS exceptions</item>
      <item>Map error types to appropriate HTTP status codes</item>
      <item>Add structured error payloads with error codes</item>
      <item>Update existing error handling patterns</item>
    </in_scope>

    <out_of_scope>
      <item>Global exception filter implementation (separate task)</item>
      <item>Error logging infrastructure changes</item>
      <item>Frontend error handling updates</item>
    </out_of_scope>
  </scope>

  <implementation>
    <approach>
      Systematically audit all SARS service files and replace generic Error throws with
      appropriate typed NestJS exceptions based on the error context.
    </approach>

    <steps>
      <step order="1">
        <description>Audit all SARS service files for Error usage</description>
        <details>
          Search for `throw new Error` patterns in apps/api/src/sars/*.ts files
          and categorize each error by type (validation, not found, business logic, etc.)
        </details>
      </step>

      <step order="2">
        <description>Create custom exception classes if needed</description>
        <details>
          Define SARS-specific exception classes that extend NestJS HttpException
          for domain-specific errors (e.g., SarsSubmissionException, VatCalculationException)
        </details>
        <code_example>
// apps/api/src/sars/exceptions/sars.exceptions.ts
import { HttpException, HttpStatus } from '@nestjs/common';

export class SarsValidationException extends HttpException {
  constructor(field: string, message: string) {
    super(
      {
        statusCode: HttpStatus.BAD_REQUEST,
        error: 'SARS_VALIDATION_ERROR',
        field,
        message,
      },
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class SarsSubmissionException extends HttpException {
  constructor(submissionType: string, reason: string) {
    super(
      {
        statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
        error: 'SARS_SUBMISSION_ERROR',
        submissionType,
        reason,
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}
        </code_example>
      </step>

      <step order="3">
        <description>Replace generic errors with typed exceptions</description>
        <details>
          Update each service file to use appropriate exception types
        </details>
        <code_example>
// Before
if (!taxPeriod) {
  throw new Error('Tax period is required');
}

// After
import { BadRequestException } from '@nestjs/common';

if (!taxPeriod) {
  throw new BadRequestException({
    error: 'MISSING_TAX_PERIOD',
    message: 'Tax period is required',
    field: 'taxPeriod',
  });
}
        </code_example>
      </step>

      <step order="4">
        <description>Update error handling in controllers</description>
        <details>
          Ensure controllers properly propagate typed exceptions without wrapping
        </details>
      </step>

      <step order="5">
        <description>Add unit tests for exception scenarios</description>
        <details>
          Write tests verifying correct exception types are thrown for each error case
        </details>
      </step>
    </steps>

    <exception_mapping>
      <mapping>
        <error_type>Missing required field</error_type>
        <exception>BadRequestException</exception>
        <status_code>400</status_code>
      </mapping>
      <mapping>
        <error_type>Invalid format/value</error_type>
        <exception>BadRequestException</exception>
        <status_code>400</status_code>
      </mapping>
      <mapping>
        <error_type>Record not found</error_type>
        <exception>NotFoundException</exception>
        <status_code>404</status_code>
      </mapping>
      <mapping>
        <error_type>Business rule violation</error_type>
        <exception>UnprocessableEntityException</exception>
        <status_code>422</status_code>
      </mapping>
      <mapping>
        <error_type>External service failure</error_type>
        <exception>ServiceUnavailableException</exception>
        <status_code>503</status_code>
      </mapping>
    </exception_mapping>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <name>Should throw BadRequestException for missing tax period</name>
        <type>unit</type>
        <expected_result>400 status with MISSING_TAX_PERIOD error code</expected_result>
      </test_case>
      <test_case>
        <name>Should throw BadRequestException for invalid period format</name>
        <type>unit</type>
        <expected_result>400 status with INVALID_PERIOD_FORMAT error code</expected_result>
      </test_case>
      <test_case>
        <name>Should throw NotFoundException for unknown submission</name>
        <type>unit</type>
        <expected_result>404 status with SUBMISSION_NOT_FOUND error code</expected_result>
      </test_case>
      <test_case>
        <name>Should throw UnprocessableEntityException for business rule violation</name>
        <type>unit</type>
        <expected_result>422 status with appropriate error code</expected_result>
      </test_case>
    </test_cases>

    <manual_verification>
      <step>Call API endpoints with invalid data and verify structured error responses</step>
      <step>Verify HTTP status codes match error types</step>
      <step>Check error response contains error code, message, and field info</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criterion>All generic Error throws replaced with typed NestJS exceptions</criterion>
    <criterion>Custom SARS exception classes created and documented</criterion>
    <criterion>HTTP status codes correctly mapped to error types</criterion>
    <criterion>Error responses include structured payload (code, message, field)</criterion>
    <criterion>Unit tests cover all exception scenarios</criterion>
    <criterion>No regression in existing functionality</criterion>
    <criterion>Code review approved</criterion>
  </definition_of_done>
</task_specification>
