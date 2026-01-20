<task_spec id="TASK-SEC-101" version="1.0">

<metadata>
  <title>Rate Limiting on Authentication Endpoints</title>
  <status>ready</status>
  <phase>usacf-sprint-1</phase>
  <layer>security</layer>
  <sequence>202</sequence>
  <priority>P0-CRITICAL</priority>
  <sprint>1</sprint>
  <estimated_effort>3 days (24 hours)</estimated_effort>
  <implements>
    <opportunity_ref>OP003</opportunity_ref>
    <gap_ref>S001</gap_ref>
    <vulnerability_ref>V001</vulnerability_ref>
  </implements>
  <depends_on>
    <!-- No dependencies - security foundation -->
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <confidence>95%</confidence>
  <cvss_score>7.5</cvss_score>
  <usacf_analysis>docs/usacf-analysis/02-gap-analysis.md#S001</usacf_analysis>
</metadata>

<project_context>
  <overview>
    CrecheBooks is a South African childcare center management SaaS platform.
    Multi-tenant architecture where every database query MUST include tenantId filter.
  </overview>

  <tech_stack>
    <backend>NestJS 10.x with TypeScript strict mode</backend>
    <orm>Prisma 5.x with PostgreSQL 15</orm>
    <cache>Redis 7.x for rate limiting and session storage</cache>
    <testing>Jest for unit/integration, no mock data - use real test database</testing>
  </tech_stack>

  <monorepo_structure>
    apps/api/        - NestJS API (this task's primary target)
    apps/web/        - React frontend
    packages/shared/ - Shared types and utilities
  </monorepo_structure>

  <critical_rules>
    <rule id="1">NO BACKWARDS COMPATIBILITY - fail fast, remove dead code immediately</rule>
    <rule id="2">NO MOCK DATA in tests - use real Redis instance for rate limit tests</rule>
    <rule id="3">ROBUST ERROR LOGGING - log all rate limit violations with IP, user agent, endpoint</rule>
    <rule id="4">SECURITY FIRST - use constant-time comparison, no timing leaks</rule>
    <rule id="5">TYPE SAFETY - strict TypeScript, no 'any' types, explicit return types</rule>
  </critical_rules>

  <coding_patterns>
    <pattern name="guards">Security guards in apps/api/src/common/guards/</pattern>
    <pattern name="filters">Exception filters in apps/api/src/common/filters/</pattern>
    <pattern name="config">Environment config via @nestjs/config in apps/api/src/config/</pattern>
  </coding_patterns>

  <existing_auth_structure>
    - JWT authentication via apps/api/src/api/auth/
    - Guards at apps/api/src/common/guards/jwt-auth.guard.ts
    - No existing rate limiting (this task adds it)
  </existing_auth_structure>
</project_context>

<executive_summary>
Implement rate limiting on authentication endpoints to prevent brute force attacks and
credential stuffing. Currently, auth endpoints have no throttling, making the system
vulnerable to automated attacks. Implementation uses @nestjs/throttler with Redis backing
for distributed rate limiting.
</executive_summary>

<business_case>
  <problem>Authentication endpoints vulnerable to brute force attacks (CVSS 7.5)</problem>
  <solution>Implement rate limiting: 5 attempts per minute per IP/user</solution>
  <benefit>Block 100% of brute force attacks, prevent credential stuffing</benefit>
  <roi>8x return (R1,500 cost, R12,000 incident avoidance)</roi>
  <compliance>OWASP A07:2021 - Identification and Authentication Failures</compliance>
</business_case>

<context>
GAP S001: Authentication endpoints lack rate limiting, making the system vulnerable to
brute force attacks and credential stuffing.

Current State (auth.controller.ts):
```typescript
// NO RATE LIMITING - VULNERABLE
@Post('/login')
async login(@Body() dto: LoginDto) {
  return this.authService.login(dto);
}
```

Security Impact:
- Attack vector: Network (remote)
- Attack complexity: Low
- Privileges required: None
- User interaction: None
- Confidentiality impact: High (account compromise)
</context>

<input_context_files>
  <file purpose="auth_controller">apps/api/src/api/auth/auth.controller.ts</file>
  <file purpose="auth_service">apps/api/src/api/auth/auth.service.ts</file>
  <file purpose="auth_module">apps/api/src/api/auth/auth.module.ts</file>
  <file purpose="app_module">apps/api/src/app.module.ts</file>
  <file purpose="usacf_gap_analysis">docs/usacf-analysis/02-gap-analysis.md</file>
</input_context_files>

<scope>
  <in_scope>
    - Install and configure @nestjs/throttler
    - Configure Redis backing for distributed rate limiting
    - Apply rate limiting to login endpoint (5/min)
    - Apply rate limiting to password reset endpoint (3/min)
    - Apply rate limiting to registration endpoint (5/min)
    - Custom rate limit exceeded response
    - Logging of rate limit violations
    - Bypass for internal/health endpoints
  </in_scope>
  <out_of_scope>
    - IP reputation/blacklisting (future enhancement)
    - CAPTCHA integration (separate task)
    - Account lockout after N failures (separate task)
    - Geographic rate limiting
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/app.module.ts">
      @Module({
        imports: [
          ThrottlerModule.forRootAsync({
            imports: [ConfigModule],
            inject: [ConfigService],
            useFactory: (config: ConfigService) => ({
              throttlers: [
                { name: 'short', ttl: 1000, limit: 3 },
                { name: 'medium', ttl: 10000, limit: 20 },
                { name: 'long', ttl: 60000, limit: 100 },
              ],
              storage: new ThrottlerStorageRedisService(config.get('redis')),
            }),
          }),
        ],
      })
    </signature>
    <signature file="apps/api/src/api/auth/auth.controller.ts">
      @UseGuards(ThrottlerGuard)
      @Throttle({ short: { ttl: 60000, limit: 5 } }) // 5 per minute
      @Post('/login')
      async login(@Body() dto: LoginDto): Promise&lt;AuthResponseDto&gt;

      @Throttle({ short: { ttl: 60000, limit: 3 } }) // 3 per minute
      @Post('/forgot-password')
      async forgotPassword(@Body() dto: ForgotPasswordDto): Promise&lt;void&gt;

      @Throttle({ short: { ttl: 60000, limit: 5 } }) // 5 per minute
      @Post('/register')
      async register(@Body() dto: RegisterDto): Promise&lt;AuthResponseDto&gt;
    </signature>
    <signature file="apps/api/src/common/filters/throttler-exception.filter.ts">
      @Catch(ThrottlerException)
      export class ThrottlerExceptionFilter implements ExceptionFilter {
        catch(exception: ThrottlerException, host: ArgumentsHost): void
      }
    </signature>
  </signatures>

  <constraints>
    - Rate limits must be configurable via environment variables
    - Must work in distributed environment (multiple API instances)
    - Must use Redis for rate limit state storage
    - Must not rate limit health check endpoints
    - Must log all rate limit violations with IP and attempt details
    - Response must use standard 429 Too Many Requests status
  </constraints>

  <verification>
    - 6th login attempt within 60 seconds returns 429
    - Rate limit resets after TTL expires
    - Rate limiting works across multiple API instances
    - Rate limit violations are logged
    - Health endpoints bypass rate limiting
    - Load test passes: 100 concurrent users, valid behavior
  </verification>
</definition_of_done>

<implementation_approach>
  <step order="1">
    Install dependencies:
    ```bash
    pnpm add @nestjs/throttler throttler-storage-redis
    ```
  </step>
  <step order="2">
    Configure ThrottlerModule in app.module.ts with Redis storage
  </step>
  <step order="3">
    Create custom ThrottlerExceptionFilter for consistent error responses
  </step>
  <step order="4">
    Apply @Throttle decorators to auth endpoints with appropriate limits
  </step>
  <step order="5">
    Add rate limit violation logging
  </step>
  <step order="6">
    Create bypass for health/internal endpoints using @SkipThrottle()
  </step>
  <step order="7">
    Add configuration for environment-based rate limits
  </step>
</implementation_approach>

<rate_limit_configuration>
  <endpoint path="/auth/login" limit="5" ttl="60000" description="5 attempts per minute"/>
  <endpoint path="/auth/forgot-password" limit="3" ttl="60000" description="3 attempts per minute"/>
  <endpoint path="/auth/register" limit="5" ttl="60000" description="5 attempts per minute"/>
  <endpoint path="/auth/refresh" limit="20" ttl="60000" description="20 refreshes per minute"/>
  <endpoint path="/health" skip="true" description="No rate limiting"/>
</rate_limit_configuration>

<files_to_create>
  <file path="apps/api/src/common/filters/throttler-exception.filter.ts">
    Custom exception filter for rate limit responses
  </file>
  <file path="apps/api/src/common/guards/custom-throttler.guard.ts">
    Extended throttler guard with logging
  </file>
  <file path="apps/api/src/api/auth/__tests__/auth.rate-limit.spec.ts">
    Rate limiting integration tests
  </file>
  <file path="apps/api/tests/load/auth-rate-limit.load.ts">
    Load test for rate limiting behavior
  </file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/app.module.ts">
    Add ThrottlerModule configuration
  </file>
  <file path="apps/api/src/api/auth/auth.controller.ts">
    Add @Throttle decorators to endpoints
  </file>
  <file path="apps/api/src/api/auth/auth.module.ts">
    Import ThrottlerGuard
  </file>
  <file path="apps/api/src/config/configuration.ts">
    Add rate limit configuration
  </file>
  <file path="apps/api/src/health/health.controller.ts">
    Add @SkipThrottle() decorator
  </file>
  <file path="package.json">
    Add throttler dependencies
  </file>
</files_to_modify>

<validation_criteria>
  <criterion>6th login attempt within 60s returns HTTP 429</criterion>
  <criterion>Rate limit state persists across API restarts (Redis)</criterion>
  <criterion>Rate limiting works with multiple API instances</criterion>
  <criterion>All rate limit violations logged with IP/details</criterion>
  <criterion>Health endpoints return 200 regardless of rate</criterion>
  <criterion>Configuration via environment variables works</criterion>
  <criterion>All existing auth tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test -- --testPathPattern="auth.rate-limit" --verbose</command>
  <command>npm run test -- --testPathPattern="auth" --verbose</command>
  <command>npm run test:load -- auth-rate-limit</command>
</test_commands>

<success_metrics>
  <metric name="brute_force_blocked">100%</metric>
  <metric name="false_positive_rate">&lt;0.1%</metric>
  <metric name="test_coverage">90%+ on changed code</metric>
</success_metrics>

<security_testing>
  <test name="brute_force_simulation">
    Send 10 rapid login attempts, verify 6th+ blocked
  </test>
  <test name="distributed_attack_simulation">
    Test rate limiting works across multiple API instances
  </test>
  <test name="bypass_attempt">
    Verify headers/methods cannot bypass rate limiting
  </test>
</security_testing>

<rollback_plan>
  - Feature flag: RATE_LIMITING_ENABLED (default: true)
  - Disable by removing ThrottlerGuard from providers
  - No data migration required
</rollback_plan>

</task_spec>
