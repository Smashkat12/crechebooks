# TASK-SEC-005: Configure Restrictive CORS

```xml
<task_spec id="TASK-SEC-005" version="1.0">
  <metadata>
    <title>Configure Restrictive CORS</title>
    <priority>CRITICAL</priority>
    <estimated_tokens>3000</estimated_tokens>
    <domain>security</domain>
    <phase>16</phase>
    <status>DONE</status>
    <depends_on>none</depends_on>
  </metadata>

  <context>
    <background>
      Using app.enableCors() without configuration allows any origin to make
      cross-origin requests to the API. This enables attackers to create malicious
      websites that can make authenticated requests on behalf of logged-in users,
      leading to data theft, unauthorized actions, and CSRF-like attacks.
    </background>
    <current_state>
      CORS is enabled with default/permissive settings:
      - Any origin can make cross-origin requests
      - All HTTP methods allowed
      - All headers allowed
      - Credentials may be sent cross-origin
      - No origin validation performed
    </current_state>
    <target_state>
      Strict CORS configuration:
      - Only explicitly allowed origins accepted
      - Origins configured via environment variable
      - Specific allowed methods (GET, POST, PUT, DELETE, PATCH)
      - Specific allowed headers (Content-Type, Authorization, X-CSRF-Token)
      - Credentials only with trusted origins
      - Preflight caching configured
    </target_state>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/api/src/main.ts" action="modify">
        Replace app.enableCors() with explicit CORS configuration
      </file>
      <file path="apps/api/src/app.module.ts" action="modify">
        Add CORS configuration service if using module-based config
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/api/src/common/config/cors.config.ts">
        CORS configuration factory with environment-based origins
      </file>
      <file path="apps/api/src/common/middleware/cors-validation.middleware.ts">
        Optional middleware for additional origin validation logging
      </file>
    </files_to_create>
  </scope>

  <implementation>
    <step order="1">
      Define CORS environment variables:
      - CORS_ALLOWED_ORIGINS: Comma-separated list of allowed origins
      - CORS_ALLOWED_METHODS: Allowed HTTP methods (default: GET,POST,PUT,DELETE,PATCH)
      - CORS_ALLOWED_HEADERS: Allowed headers
      - CORS_CREDENTIALS: Whether to allow credentials (default: true)
      - CORS_MAX_AGE: Preflight cache duration in seconds
    </step>
    <step order="2">
      Create CORS configuration factory:
      - Parse CORS_ALLOWED_ORIGINS from environment
      - Validate origin format (must be valid URLs)
      - Support wildcard subdomains for staging (*.example.com)
      - Throw error if no origins configured in production
    </step>
    <step order="3">
      Implement origin validation function:
      - Check request origin against allowed list
      - Support regex patterns for dynamic origins
      - Log rejected origins for security monitoring
      - Return false for non-matching origins
    </step>
    <step order="4">
      Update main.ts with explicit CORS config:
      ```typescript
      app.enableCors({
        origin: corsConfig.validateOrigin,
        methods: corsConfig.allowedMethods,
        allowedHeaders: corsConfig.allowedHeaders,
        credentials: corsConfig.credentials,
        maxAge: corsConfig.maxAge,
      });
      ```
    </step>
    <step order="5">
      Configure environment-specific origins:
      - Development: http://localhost:3000, http://localhost:3001
      - Staging: https://staging.example.com
      - Production: https://app.example.com, https://www.example.com
    </step>
    <step order="6">
      Add startup validation:
      - Verify CORS_ALLOWED_ORIGINS is set in production
      - Warn if wildcard (*) is used (should never be in production)
      - Log configured origins on startup (not in production logs)
    </step>
    <step order="7">
      Implement CORS rejection logging:
      - Log blocked cross-origin requests
      - Include origin, path, and timestamp
      - Alert on repeated rejections from same origin (potential attack)
    </step>
  </implementation>

  <verification>
    <test_command>npm run test -- --grep "cors" && npm run test:e2e -- --grep "cors"</test_command>
    <acceptance_criteria>
      <criterion>Only configured origins can make cross-origin requests</criterion>
      <criterion>Requests from non-allowed origins receive CORS error</criterion>
      <criterion>Preflight requests handled correctly</criterion>
      <criterion>Credentials work with allowed origins</criterion>
      <criterion>Application fails to start without CORS config in production</criterion>
      <criterion>CORS headers present in responses for allowed origins</criterion>
      <criterion>No CORS headers for disallowed origins</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <item>CORS configuration factory created</item>
    <item>main.ts updated with explicit CORS settings</item>
    <item>Environment variables defined for CORS configuration</item>
    <item>Origin validation function implemented</item>
    <item>Startup validation for production environment</item>
    <item>CORS rejection logging implemented</item>
    <item>Unit tests for CORS configuration passing</item>
    <item>E2E tests confirming CORS enforcement</item>
    <item>Documentation for CORS configuration</item>
    <item>.env.example updated with CORS variables</item>
  </definition_of_done>
</task_spec>
```
