<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-INFRA-003</task_id>
    <title>Add Global Rate Limiting</title>
    <priority>HIGH</priority>
    <severity>HIGH</severity>
    <category>Infrastructure</category>
    <subcategory>Security</subcategory>
    <estimated_effort>4 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>16-remediation</phase>
    <status>DONE</status>
  </metadata>

  <context>
    <issue_description>
      The API does not have global rate limiting configured. Without rate
      limiting, the application is vulnerable to denial-of-service attacks,
      brute force attempts, and resource exhaustion from misbehaving clients.
    </issue_description>
    <impact>
      - DoS attacks can overwhelm the API
      - Brute force attacks on authentication endpoints
      - Single client can consume all resources
      - No protection against API abuse
      - Potential for cascading failures under load
    </impact>
    <root_cause>
      No rate limiting middleware or guard configured in the NestJS
      application bootstrap or global guards.
    </root_cause>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/api/src/main.ts" action="modify">
        Register global throttler guard
      </file>
      <file path="apps/api/src/app.module.ts" action="modify">
        Import and configure ThrottlerModule
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/api/src/common/guards/throttle.guard.ts" action="create">
        Create custom throttle guard with Redis storage support
      </file>
      <file path="apps/api/src/common/decorators/throttle.decorator.ts" action="create">
        Create decorators for custom rate limits per endpoint
      </file>
    </files_to_create>
    <dependencies>
      <dependency>@nestjs/throttler for rate limiting infrastructure</dependency>
      <dependency>@nestjs/throttler-storage-redis for distributed rate limiting</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Implement global rate limiting using @nestjs/throttler with Redis storage
      for distributed rate limiting across multiple API instances. Configure
      sensible defaults with ability to customize per-endpoint limits.
    </approach>
    <steps>
      <step order="1">
        Install throttler packages:
        npm install @nestjs/throttler @nestjs/throttler-storage-redis
      </step>
      <step order="2">
        Configure ThrottlerModule with Redis storage in AppModule
      </step>
      <step order="3">
        Create custom ThrottlerGuard that extracts client identifier
        from IP, API key, or user ID
      </step>
      <step order="4">
        Register throttler guard globally in main.ts
      </step>
      <step order="5">
        Add @SkipThrottle() decorator to health endpoints
      </step>
      <step order="6">
        Configure stricter limits for sensitive endpoints (auth, webhooks)
      </step>
    </steps>
    <code_example>
```typescript
// app.module.ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nestjs/throttler-storage-redis';

@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            name: 'short',
            ttl: 1000, // 1 second
            limit: 10, // 10 requests per second
          },
          {
            name: 'medium',
            ttl: 60000, // 1 minute
            limit: 100, // 100 requests per minute
          },
          {
            name: 'long',
            ttl: 3600000, // 1 hour
            limit: 1000, // 1000 requests per hour
          },
        ],
        storage: new ThrottlerStorageRedisService({
          host: config.get('REDIS_HOST'),
          port: config.get('REDIS_PORT'),
        }),
      }),
    }),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}

// throttle.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    // Prioritize: API Key > User ID > IP
    return req.headers['x-api-key']
      || req.user?.id
      || req.ip;
  }

  protected async throwThrottlingException(): Promise<void> {
    throw new ThrottlerException('Rate limit exceeded. Please try again later.');
  }
}

// Usage on specific endpoints
@Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 per minute
@Post('auth/login')
async login() {}

@SkipThrottle()
@Get('health')
async health() {}
```
    </code_example>
    <configuration>
      <env_vars>
        <var name="THROTTLE_TTL" default="60000">Time window in milliseconds</var>
        <var name="THROTTLE_LIMIT" default="100">Requests per time window</var>
        <var name="THROTTLE_REDIS_ENABLED" default="true">Use Redis for distributed limiting</var>
      </env_vars>
    </configuration>
  </implementation>

  <verification>
    <test_cases>
      <test name="Rate limit enforced after threshold exceeded">
        Send requests exceeding limit and verify 429 response
      </test>
      <test name="Rate limit resets after TTL window">
        Wait for TTL and verify requests allowed again
      </test>
      <test name="Different clients have separate rate limits">
        Verify different IPs/API keys have independent limits
      </test>
      <test name="Health endpoint excluded from rate limiting">
        Verify health endpoint always accessible
      </test>
      <test name="Custom limits on auth endpoints work">
        Verify stricter limits on login/register endpoints
      </test>
    </test_cases>
    <manual_verification>
      <step>Start API and make rapid requests to any endpoint</step>
      <step>Verify 429 response after exceeding limit</step>
      <step>Check response includes Retry-After header</step>
      <step>Verify Redis stores rate limit counters</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>Global rate limiting active on all endpoints</criterion>
      <criterion>Redis storage configured for distributed limiting</criterion>
      <criterion>429 response returned when limit exceeded</criterion>
      <criterion>Retry-After header included in 429 responses</criterion>
      <criterion>Health endpoints excluded from rate limiting</criterion>
      <criterion>Auth endpoints have stricter rate limits</criterion>
      <criterion>Rate limits configurable via environment variables</criterion>
      <criterion>Unit tests verify rate limiting behavior</criterion>
      <criterion>Load test confirms rate limiting under stress</criterion>
    </criteria>
    <acceptance>
      All criteria must be met and verified by code review before task
      can be marked complete.
    </acceptance>
  </definition_of_done>
</task_specification>
