<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-INFRA-001</task_id>
    <title>Add Database Health Check</title>
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
      The current health endpoint does not include a database connectivity check.
      Without database health monitoring, the system cannot detect database connection
      failures, leading to potential service degradation without proper alerting or
      load balancer awareness.
    </issue_description>
    <impact>
      - Load balancers cannot detect database connectivity issues
      - Kubernetes probes may report healthy when database is unreachable
      - Silent failures in production without proper alerting
      - Delayed incident detection and response
    </impact>
    <root_cause>
      Health controller only returns static response without verifying actual
      database connectivity through Prisma client.
    </root_cause>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/api/src/health/health.controller.ts" action="modify">
        Add Prisma database connectivity check to health endpoint
      </file>
      <file path="apps/api/src/health/health.module.ts" action="modify">
        Inject PrismaService into health module if not already present
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/api/src/health/indicators/database.health.ts" action="create">
        Create dedicated database health indicator class
      </file>
    </files_to_create>
    <dependencies>
      <dependency>@nestjs/terminus for health check infrastructure</dependency>
      <dependency>PrismaService for database connectivity</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Implement a database health indicator using NestJS Terminus that performs
      a simple query to verify Prisma database connectivity. The check should
      have a configurable timeout and return detailed status information.
    </approach>
    <steps>
      <step order="1">
        Install @nestjs/terminus if not already installed:
        npm install @nestjs/terminus
      </step>
      <step order="2">
        Create DatabaseHealthIndicator class that extends HealthIndicator
        and performs a simple SELECT 1 query via Prisma
      </step>
      <step order="3">
        Update HealthController to use HealthCheckService and include
        the database health indicator
      </step>
      <step order="4">
        Configure appropriate timeout (e.g., 3 seconds) for database check
      </step>
      <step order="5">
        Add error handling to return degraded status on connection failure
      </step>
    </steps>
    <code_example>
```typescript
// database.health.ts
import { Injectable } from '@nestjs/common';
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return this.getStatus(key, true, { status: 'connected' });
    } catch (error) {
      throw new HealthCheckError(
        'Database check failed',
        this.getStatus(key, false, {
          status: 'disconnected',
          error: error.message
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
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.isHealthy('database'),
    ]);
  }
}
```
    </code_example>
  </implementation>

  <verification>
    <test_cases>
      <test name="Database health returns healthy when connected">
        Verify health endpoint returns status: 'up' when database is reachable
      </test>
      <test name="Database health returns unhealthy on connection failure">
        Mock Prisma to throw connection error and verify status: 'down'
      </test>
      <test name="Health check timeout is respected">
        Verify check fails gracefully if database query exceeds timeout
      </test>
      <test name="Health endpoint includes database status in response">
        Verify response body contains database health indicator details
      </test>
    </test_cases>
    <manual_verification>
      <step>Start API server and call GET /health</step>
      <step>Verify response includes database status object</step>
      <step>Stop database container and verify health returns unhealthy</step>
      <step>Restart database and verify health recovers</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>Health endpoint performs actual database connectivity check</criterion>
      <criterion>Check has configurable timeout (default 3 seconds)</criterion>
      <criterion>Unhealthy database returns HTTP 503 status code</criterion>
      <criterion>Response body includes detailed database status</criterion>
      <criterion>Unit tests cover healthy and unhealthy scenarios</criterion>
      <criterion>Integration test verifies actual database connectivity</criterion>
      <criterion>Documentation updated with new health check details</criterion>
    </criteria>
    <acceptance>
      All criteria must be met and verified by code review before task
      can be marked complete.
    </acceptance>
  </definition_of_done>
</task_specification>
