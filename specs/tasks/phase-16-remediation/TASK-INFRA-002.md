<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-INFRA-002</task_id>
    <title>Add Redis Health Check</title>
    <priority>HIGH</priority>
    <severity>HIGH</severity>
    <category>Infrastructure</category>
    <subcategory>Health Monitoring</subcategory>
    <estimated_effort>2 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>16-remediation</phase>
    <status>DONE</status>
  </metadata>

  <context>
    <issue_description>
      The health endpoint does not include Redis connectivity verification.
      When Redis is enabled for caching, sessions, or queue management, its
      availability is critical to application functionality. Without health
      checks, Redis failures go undetected by monitoring systems.
    </issue_description>
    <impact>
      - Cache failures cause silent performance degradation
      - Session store unavailability leads to authentication issues
      - Queue processing halts without alerting
      - Load balancers continue routing to instances with broken Redis
    </impact>
    <root_cause>
      Health controller does not verify Redis connectivity even when Redis
      is configured and required for application features.
    </root_cause>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/api/src/health/health.controller.ts" action="modify">
        Add conditional Redis health check to health endpoint
      </file>
      <file path="apps/api/src/health/health.module.ts" action="modify">
        Inject Redis client and configuration service
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/api/src/health/indicators/redis.health.ts" action="create">
        Create dedicated Redis health indicator class
      </file>
    </files_to_create>
    <dependencies>
      <dependency>@nestjs/terminus for health check infrastructure</dependency>
      <dependency>ioredis or redis client library</dependency>
      <dependency>ConfigService for Redis enabled check</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Create a Redis health indicator that performs a PING command to verify
      connectivity. The check should only be included when Redis is enabled
      in the configuration, allowing the application to run without Redis
      in development environments.
    </approach>
    <steps>
      <step order="1">
        Create RedisHealthIndicator class extending HealthIndicator
      </step>
      <step order="2">
        Implement PING command check with configurable timeout
      </step>
      <step order="3">
        Add conditional inclusion based on REDIS_ENABLED config flag
      </step>
      <step order="4">
        Include Redis connection details (host/port) in health response
      </step>
      <step order="5">
        Handle connection timeout and error scenarios gracefully
      </step>
    </steps>
    <code_example>
```typescript
// redis.health.ts
import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(@InjectRedis() private readonly redis: Redis) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const result = await Promise.race([
        this.redis.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Redis ping timeout')), 3000)
        ),
      ]);

      return this.getStatus(key, true, {
        status: 'connected',
        response: result,
      });
    } catch (error) {
      throw new HealthCheckError(
        'Redis check failed',
        this.getStatus(key, false, {
          status: 'disconnected',
          error: error.message,
        }),
      );
    }
  }
}

// health.controller.ts
@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: DatabaseHealthIndicator,
    private redis: RedisHealthIndicator,
    private config: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    const checks = [
      () => this.db.isHealthy('database'),
    ];

    if (this.config.get('REDIS_ENABLED') === 'true') {
      checks.push(() => this.redis.isHealthy('redis'));
    }

    return this.health.check(checks);
  }
}
```
    </code_example>
  </implementation>

  <verification>
    <test_cases>
      <test name="Redis health returns healthy when connected">
        Verify health endpoint returns redis status: 'up' when Redis is reachable
      </test>
      <test name="Redis health returns unhealthy on connection failure">
        Mock Redis to throw connection error and verify status: 'down'
      </test>
      <test name="Redis check excluded when REDIS_ENABLED is false">
        Set REDIS_ENABLED=false and verify Redis check is not in response
      </test>
      <test name="Redis check timeout is handled gracefully">
        Simulate slow Redis and verify timeout error is returned
      </test>
    </test_cases>
    <manual_verification>
      <step>Start API with REDIS_ENABLED=true and call GET /health</step>
      <step>Verify response includes redis status object</step>
      <step>Stop Redis container and verify health returns unhealthy</step>
      <step>Set REDIS_ENABLED=false and verify Redis not in response</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>Health endpoint performs Redis PING when Redis enabled</criterion>
      <criterion>Redis check has configurable timeout (default 3 seconds)</criterion>
      <criterion>Redis check conditionally included based on configuration</criterion>
      <criterion>Unhealthy Redis returns HTTP 503 status code</criterion>
      <criterion>Response includes Redis connection status details</criterion>
      <criterion>Unit tests cover enabled/disabled and healthy/unhealthy</criterion>
      <criterion>Integration test verifies actual Redis connectivity</criterion>
    </criteria>
    <acceptance>
      All criteria must be met and verified by code review before task
      can be marked complete.
    </acceptance>
  </definition_of_done>
</task_specification>
