<task_spec id="TASK-SEC-104" version="1.0">

<metadata>
  <title>Error Handling Standardization</title>
  <status>ready</status>
  <phase>usacf-sprint-3</phase>
  <layer>quality</layer>
  <sequence>209</sequence>
  <priority>P1-HIGH</priority>
  <sprint>3</sprint>
  <estimated_effort>5 days (40 hours)</estimated_effort>
  <implements>
    <opportunity_ref>OP014</opportunity_ref>
    <gap_ref>Q003</gap_ref>
    <gap_ref>S007</gap_ref>
    <vulnerability_ref>V005</vulnerability_ref>
  </implements>
  <depends_on>
    <!-- No strict dependencies -->
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <confidence>85%</confidence>
  <cvss_score>4.0</cvss_score>
  <usacf_analysis>docs/usacf-analysis/04-synthesis.md#OP014</usacf_analysis>
</metadata>

<project_context>
  <overview>
    CrecheBooks is a South African childcare center management SaaS platform.
    Multi-tenant architecture - errors must never leak data between tenants.
    Financial data (invoices, payments) requires extra care in error messages.
  </overview>

  <tech_stack>
    <backend>NestJS 10.x with TypeScript strict mode</backend>
    <orm>Prisma 5.x with PostgreSQL 15</orm>
    <logging>Winston or Pino for structured logging</logging>
    <testing>Jest for unit/integration, no mock data - test real error scenarios</testing>
  </tech_stack>

  <monorepo_structure>
    apps/api/        - NestJS API (this task's primary target)
    apps/web/        - React frontend
    packages/shared/ - Shared types and utilities
  </monorepo_structure>

  <critical_rules>
    <rule id="1">NO BACKWARDS COMPATIBILITY - replace old error handling immediately</rule>
    <rule id="2">NO STACK TRACES IN PRODUCTION - strip all internal details</rule>
    <rule id="3">CORRELATION IDs ON EVERY ERROR - link user-facing to internal logs</rule>
    <rule id="4">SANITIZE PII - remove emails, names, IDs from user-facing errors</rule>
    <rule id="5">LOG FULL DETAILS INTERNALLY - full context in server logs only</rule>
  </critical_rules>

  <coding_patterns>
    <pattern name="filters">Exception filters in apps/api/src/common/filters/</pattern>
    <pattern name="exceptions">Custom exceptions in apps/api/src/shared/exceptions/</pattern>
    <pattern name="utils">Sanitization utils in apps/api/src/common/utils/</pattern>
  </coding_patterns>

  <existing_error_structure>
    - Base exception at apps/api/src/shared/exceptions/base.exception.ts
    - Currently INCONSISTENT error handling across controllers
    - Some expose stack traces, others too generic (this task standardizes)
  </existing_error_structure>

  <sensitive_data_patterns>
    - Email addresses (parent emails, staff emails)
    - ID numbers (South African ID format: \d{13})
    - Bank account numbers
    - API keys and tokens
    - Child names and parent details
  </sensitive_data_patterns>
</project_context>

<executive_summary>
Standardize error handling across all controllers to prevent information disclosure and
provide consistent error responses. Currently, verbose error messages in production expose
stack traces and internal details, aiding attackers. Implementation includes error filter,
response standardization, and sensitive data removal.
</executive_summary>

<business_case>
  <problem>Verbose error messages expose internal details (CVSS 4.0)</problem>
  <solution>Standardized error responses with environment-aware detail levels</solution>
  <benefit>Prevent information disclosure, consistent API error format</benefit>
  <roi>Security hardening, better developer experience</roi>
</business_case>

<context>
GAP Q003: Inconsistent error handling across controllers.
GAP S007: Verbose error messages in production.
Vulnerability V005: Information disclosure through errors.

Current State (various controllers):
```typescript
// INCONSISTENT - some return detailed errors
catch (error) {
  throw new InternalServerErrorException(error.message); // Exposes internals
}

// Others return generic
catch (error) {
  throw new InternalServerErrorException('An error occurred'); // No useful info
}
```

Production Error (CURRENT):
```json
{
  "statusCode": 500,
  "message": "Cannot read property 'id' of undefined",
  "stack": "TypeError: Cannot read property 'id'...\n    at InvoiceService.create..."
}
```
</context>

<input_context_files>
  <file purpose="base_exception">apps/api/src/shared/exceptions/base.exception.ts</file>
  <file purpose="example_controller">apps/api/src/api/billing/invoice.controller.ts</file>
  <file purpose="usacf_gap_analysis">docs/usacf-analysis/02-gap-analysis.md</file>
</input_context_files>

<scope>
  <in_scope>
    - Global exception filter
    - Standard error response format
    - Environment-aware error details
    - Error code enumeration
    - Sensitive data removal from errors
    - Error logging with correlation IDs
    - Validation error formatting
    - Business logic error classes
  </in_scope>
  <out_of_scope>
    - Error monitoring dashboard (separate tool)
    - Client-side error handling
    - Error recovery strategies
    - Retry logic
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/common/filters/global-exception.filter.ts">
      @Catch()
      export class GlobalExceptionFilter implements ExceptionFilter {
        catch(exception: unknown, host: ArgumentsHost): void {
          // Transform all exceptions to standard format
          // Strip sensitive data in production
          // Log with correlation ID
        }
      }

      interface StandardErrorResponse {
        success: false;
        error: {
          code: string;
          message: string;
          details?: unknown;  // Only in development
          correlationId: string;
          timestamp: string;
        };
      }
    </signature>
    <signature file="apps/api/src/shared/exceptions/app.exceptions.ts">
      export enum ErrorCode {
        VALIDATION_ERROR = 'VALIDATION_ERROR',
        NOT_FOUND = 'NOT_FOUND',
        UNAUTHORIZED = 'UNAUTHORIZED',
        FORBIDDEN = 'FORBIDDEN',
        CONFLICT = 'CONFLICT',
        RATE_LIMITED = 'RATE_LIMITED',
        EXTERNAL_SERVICE_ERROR = 'EXTERNAL_SERVICE_ERROR',
        INTERNAL_ERROR = 'INTERNAL_ERROR',
      }

      export class AppException extends HttpException {
        constructor(
          code: ErrorCode,
          message: string,
          statusCode: number,
          details?: unknown
        );
      }

      export class ValidationException extends AppException { ... }
      export class NotFoundException extends AppException { ... }
      export class ConflictException extends AppException { ... }
      export class ExternalServiceException extends AppException { ... }
    </signature>
  </signatures>

  <constraints>
    - Stack traces NEVER exposed in production
    - Correlation ID on every error
    - Consistent JSON structure across all errors
    - Validation errors include field-level details
    - External service errors sanitized
    - Logging includes full details (internal only)
  </constraints>

  <verification>
    - Production errors have no stack traces
    - Development errors include debug details
    - All errors have correlation IDs
    - Validation errors show field details
    - Sensitive data removed from responses
    - All existing tests pass
  </verification>
</definition_of_done>

<error_response_format>
  <development>
    ```json
    {
      "success": false,
      "error": {
        "code": "VALIDATION_ERROR",
        "message": "Invalid invoice data",
        "details": {
          "fields": [
            { "field": "amount", "message": "Must be positive" }
          ],
          "stack": "Error: Invalid invoice data\n    at..."
        },
        "correlationId": "abc-123-def",
        "timestamp": "2026-01-20T10:30:00Z"
      }
    }
    ```
  </development>
  <production>
    ```json
    {
      "success": false,
      "error": {
        "code": "VALIDATION_ERROR",
        "message": "Invalid invoice data",
        "details": {
          "fields": [
            { "field": "amount", "message": "Must be positive" }
          ]
        },
        "correlationId": "abc-123-def",
        "timestamp": "2026-01-20T10:30:00Z"
      }
    }
    ```
  </production>
</error_response_format>

<implementation_approach>
  <step order="1">
    Create ErrorCode enumeration
  </step>
  <step order="2">
    Create AppException base class and specific exceptions
  </step>
  <step order="3">
    Create GlobalExceptionFilter with environment awareness
  </step>
  <step order="4">
    Implement correlation ID generation and propagation
  </step>
  <step order="5">
    Create sensitive data sanitizer
  </step>
  <step order="6">
    Apply filter globally in main.ts
  </step>
  <step order="7">
    Refactor existing controllers to use new exceptions
  </step>
  <step order="8">
    Update all tests
  </step>
</implementation_approach>

<files_to_create>
  <file path="apps/api/src/common/filters/global-exception.filter.ts">
    Global exception filter
  </file>
  <file path="apps/api/src/shared/exceptions/error-codes.ts">
    Error code enumeration
  </file>
  <file path="apps/api/src/shared/exceptions/app.exceptions.ts">
    Application exception classes
  </file>
  <file path="apps/api/src/common/utils/correlation-id.ts">
    Correlation ID generation
  </file>
  <file path="apps/api/src/common/utils/sanitizer.ts">
    Sensitive data sanitizer
  </file>
  <file path="apps/api/src/common/filters/__tests__/global-exception.filter.spec.ts">
    Filter tests
  </file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/main.ts">
    Apply global exception filter
  </file>
  <file path="apps/api/src/api/billing/invoice.controller.ts">
    Use standardized exceptions
  </file>
  <file path="apps/api/src/api/auth/auth.controller.ts">
    Use standardized exceptions
  </file>
  <file path="apps/api/src/api/reconciliation/reconciliation.controller.ts">
    Use standardized exceptions
  </file>
  <file path="apps/api/src/shared/exceptions/base.exception.ts">
    Update to use new format
  </file>
</files_to_modify>

<validation_criteria>
  <criterion>No stack traces in production responses</criterion>
  <criterion>All errors have correlation IDs</criterion>
  <criterion>Consistent error format across all endpoints</criterion>
  <criterion>Validation errors include field details</criterion>
  <criterion>Internal details logged, not exposed</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test -- --testPathPattern="exception" --verbose</command>
  <command>NODE_ENV=production npm run test:e2e -- error-handling</command>
</test_commands>

<success_metrics>
  <metric name="info_disclosure">0 incidents</metric>
  <metric name="error_consistency">100%</metric>
  <metric name="correlation_coverage">100%</metric>
</success_metrics>

<rollback_plan>
  - Old exception handling still works
  - Gradual migration controller by controller
  - Feature flag: STANDARDIZED_ERRORS (default: true)
</rollback_plan>

</task_spec>
