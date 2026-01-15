# TASK-SEC-004: Implement Auth Rate Limiting

```xml
<task_spec id="TASK-SEC-004" version="1.0">
  <metadata>
    <title>Implement Auth Rate Limiting</title>
    <priority>CRITICAL</priority>
    <estimated_tokens>5000</estimated_tokens>
    <domain>security</domain>
    <phase>16</phase>
    <status>DONE</status>
    <depends_on>TASK-SEC-003</depends_on>
  </metadata>

  <context>
    <background>
      Authentication endpoints without rate limiting are vulnerable to brute force
      attacks, credential stuffing, and denial of service. Attackers can make
      unlimited login attempts to guess passwords or use stolen credential lists.
      This is a critical vulnerability that enables account takeover attacks.
    </background>
    <current_state>
      No rate limiting on authentication endpoints:
      - Unlimited login attempts allowed
      - No protection against brute force attacks
      - No account lockout mechanism
      - No exponential backoff for failed attempts
      - Vulnerable to credential stuffing attacks
    </current_state>
    <target_state>
      Comprehensive rate limiting on all auth endpoints:
      - 5 login attempts per 15 minutes per IP/user
      - Exponential backoff after failures (1s, 2s, 4s, 8s...)
      - Account lockout after 10 failed attempts
      - Distributed rate limiting via Redis
      - Clear user feedback on remaining attempts
      - Admin notification for suspected attacks
    </target_state>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/api/src/auth/auth.controller.ts" action="modify">
        Apply rate limiting decorators to login/register endpoints
      </file>
      <file path="apps/api/src/auth/auth.service.ts" action="modify">
        Add failed attempt tracking and lockout logic
      </file>
      <file path="apps/api/src/auth/auth.module.ts" action="modify">
        Import rate limiting module and configure providers
      </file>
      <file path="apps/api/src/app.module.ts" action="modify">
        Configure global rate limiting module
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/api/src/common/guards/rate-limit.guard.ts">
        Custom rate limiting guard with Redis backend
      </file>
      <file path="apps/api/src/common/decorators/rate-limit.decorator.ts">
        Decorator for applying rate limits to endpoints
      </file>
      <file path="apps/api/src/auth/failed-attempts.service.ts">
        Service to track and manage failed login attempts
      </file>
      <file path="apps/api/src/common/filters/rate-limit-exception.filter.ts">
        Exception filter for rate limit exceeded responses
      </file>
    </files_to_create>
  </scope>

  <implementation>
    <step order="1">
      Install and configure rate limiting package:
      - Install @nestjs/throttler or implement custom solution
      - Configure Redis storage for distributed rate limiting
      - Set up environment variables for rate limit configuration
    </step>
    <step order="2">
      Create rate limit decorator:
      - Support per-endpoint configuration (limit, ttl, keyPrefix)
      - Allow IP-based and user-based rate limiting
      - Include skip conditions for whitelisted IPs
    </step>
    <step order="3">
      Implement rate limit guard:
      - Check Redis for current attempt count
      - Implement sliding window algorithm
      - Return standardized rate limit headers (X-RateLimit-*)
      - Throw ThrottlerException when limit exceeded
    </step>
    <step order="4">
      Create failed attempts tracking service:
      - Track failures by IP address and username separately
      - Implement exponential backoff calculation
      - Support account lockout after threshold
      - Provide unlock mechanism for support team
    </step>
    <step order="5">
      Apply rate limiting to auth endpoints:
      - POST /auth/login: 5 attempts per 15 minutes
      - POST /auth/register: 3 attempts per hour
      - POST /auth/forgot-password: 3 attempts per hour
      - POST /auth/reset-password: 5 attempts per hour
    </step>
    <step order="6">
      Implement exponential backoff:
      - After 3 failures: 1 second delay
      - After 4 failures: 2 second delay
      - After 5 failures: 4 second delay
      - Maximum delay: 30 seconds
      - Delay applies before response, not just in headers
    </step>
    <step order="7">
      Implement account lockout:
      - Lock account after 10 failed attempts
      - Lockout duration: 30 minutes (configurable)
      - Send notification email to user
      - Provide admin unlock capability
    </step>
    <step order="8">
      Create exception filter for rate limit responses:
      - Return 429 Too Many Requests status
      - Include Retry-After header
      - Provide user-friendly error message
      - Log rate limit violations for security monitoring
    </step>
    <step order="9">
      Add monitoring and alerting:
      - Log all rate limit hits
      - Alert on unusual patterns (potential attack)
      - Create dashboard metrics for rate limiting
    </step>
  </implementation>

  <verification>
    <test_command>npm run test -- --grep "rate-limit" && npm run test:e2e -- --grep "auth"</test_command>
    <acceptance_criteria>
      <criterion>Login endpoint limited to 5 attempts per 15 minutes</criterion>
      <criterion>Rate limit applies across multiple API instances</criterion>
      <criterion>Exponential backoff delays enforced after failures</criterion>
      <criterion>Account locks after 10 failed attempts</criterion>
      <criterion>Proper 429 response with Retry-After header</criterion>
      <criterion>Rate limit headers present in responses</criterion>
      <criterion>Legitimate users not impacted by rate limits</criterion>
      <criterion>Admin can unlock locked accounts</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <item>Rate limiting guard implemented with Redis backend</item>
    <item>All auth endpoints protected with appropriate limits</item>
    <item>Exponential backoff implemented for failed attempts</item>
    <item>Account lockout mechanism working</item>
    <item>Rate limit exception filter returning proper responses</item>
    <item>Unit tests for rate limiting logic passing</item>
    <item>Integration tests confirming distributed rate limiting</item>
    <item>Load tests confirming rate limits enforced</item>
    <item>Monitoring and alerting configured</item>
    <item>Documentation for rate limit configuration</item>
  </definition_of_done>
</task_spec>
```
