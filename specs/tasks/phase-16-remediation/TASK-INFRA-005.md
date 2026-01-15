<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-INFRA-005</task_id>
    <title>Implement Structured JSON Logging</title>
    <priority>HIGH</priority>
    <severity>HIGH</severity>
    <category>Infrastructure</category>
    <subcategory>Observability</subcategory>
    <estimated_effort>6 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>16-remediation</phase>
    <status>DONE</status>
  </metadata>

  <context>
    <issue_description>
      The application uses console-only logging without structured format.
      This makes log aggregation, searching, and analysis extremely difficult
      in production environments. Logs lack correlation IDs, making request
      tracing impossible.
    </issue_description>
    <impact>
      - Cannot aggregate logs in centralized systems (ELK, CloudWatch)
      - No request correlation across services
      - Difficult to search and filter logs
      - Missing context in error investigations
      - Non-compliant with production logging standards
      - Increased debugging time in production incidents
    </impact>
    <root_cause>
      Default NestJS logger uses console output without JSON formatting
      or correlation ID injection.
    </root_cause>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/api/src/main.ts" action="modify">
        Replace default logger with structured logger
      </file>
      <file path="apps/api/src/app.module.ts" action="modify">
        Configure logger module globally
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/api/src/common/logger/logger.service.ts" action="create">
        Create custom structured logger service
      </file>
      <file path="apps/api/src/common/logger/logger.module.ts" action="create">
        Create logger module with configuration
      </file>
      <file path="apps/api/src/common/middleware/correlation-id.middleware.ts" action="create">
        Create middleware to inject correlation IDs
      </file>
      <file path="apps/api/src/common/logger/logger.config.ts" action="create">
        Create logger configuration
      </file>
    </files_to_create>
    <dependencies>
      <dependency>winston or pino for structured logging</dependency>
      <dependency>uuid for correlation ID generation</dependency>
      <dependency>nest-winston or nestjs-pino for NestJS integration</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Implement structured JSON logging using Pino (for performance) or
      Winston (for flexibility) with correlation ID tracking. Use AsyncLocalStorage
      for request-scoped correlation ID propagation.
    </approach>
    <steps>
      <step order="1">
        Install logging packages:
        npm install pino pino-http nestjs-pino uuid
      </step>
      <step order="2">
        Create correlation ID middleware using AsyncLocalStorage
      </step>
      <step order="3">
        Create custom logger service wrapping Pino
      </step>
      <step order="4">
        Configure JSON format with timestamp, level, correlation ID
      </step>
      <step order="5">
        Replace NestJS default logger in bootstrap
      </step>
      <step order="6">
        Add request/response logging middleware
      </step>
      <step order="7">
        Configure log levels per environment
      </step>
    </steps>
    <code_example>
```typescript
// correlation-id.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';

export const correlationStorage = new AsyncLocalStorage<{ correlationId: string }>();

@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    const correlationId = req.headers['x-correlation-id'] || uuidv4();
    req.correlationId = correlationId;
    res.setHeader('x-correlation-id', correlationId);

    correlationStorage.run({ correlationId }, () => {
      next();
    });
  }
}

// logger.service.ts
import { Injectable, LoggerService } from '@nestjs/common';
import pino from 'pino';
import { correlationStorage } from '../middleware/correlation-id.middleware';

@Injectable()
export class StructuredLoggerService implements LoggerService {
  private logger: pino.Logger;

  constructor() {
    this.logger = pino({
      level: process.env.LOG_LEVEL || 'info',
      formatters: {
        level: (label) => ({ level: label }),
      },
      timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
      base: {
        service: process.env.SERVICE_NAME || 'api',
        environment: process.env.NODE_ENV || 'development',
      },
    });
  }

  private getCorrelationId(): string | undefined {
    return correlationStorage.getStore()?.correlationId;
  }

  log(message: string, context?: string) {
    this.logger.info({ correlationId: this.getCorrelationId(), context }, message);
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error({ correlationId: this.getCorrelationId(), context, trace }, message);
  }

  warn(message: string, context?: string) {
    this.logger.warn({ correlationId: this.getCorrelationId(), context }, message);
  }

  debug(message: string, context?: string) {
    this.logger.debug({ correlationId: this.getCorrelationId(), context }, message);
  }

  verbose(message: string, context?: string) {
    this.logger.trace({ correlationId: this.getCorrelationId(), context }, message);
  }
}

// main.ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
  });

  app.useLogger(app.get(StructuredLoggerService));
  app.use(new CorrelationIdMiddleware().use);

  await app.listen(3000);
}

// Sample log output
{
  "level": "info",
  "timestamp": "2026-01-15T10:30:00.000Z",
  "service": "api",
  "environment": "production",
  "correlationId": "abc123-def456",
  "context": "UserController",
  "message": "User created successfully",
  "userId": "user-789"
}
```
    </code_example>
    <configuration>
      <env_vars>
        <var name="LOG_LEVEL" default="info">Logging level (trace, debug, info, warn, error)</var>
        <var name="LOG_FORMAT" default="json">Log format (json, pretty)</var>
        <var name="SERVICE_NAME" default="api">Service name for log identification</var>
      </env_vars>
    </configuration>
  </implementation>

  <verification>
    <test_cases>
      <test name="Logs output in JSON format">
        Verify log output is valid JSON with expected fields
      </test>
      <test name="Correlation ID propagated through request">
        Verify all logs for a request have same correlation ID
      </test>
      <test name="Correlation ID returned in response header">
        Verify X-Correlation-ID header in response
      </test>
      <test name="Log levels configurable via environment">
        Verify LOG_LEVEL env var controls output
      </test>
      <test name="Error logs include stack trace">
        Verify error logs contain trace field
      </test>
      <test name="Request/response logging works">
        Verify HTTP requests are logged with timing
      </test>
    </test_cases>
    <manual_verification>
      <step>Start API and make HTTP request</step>
      <step>Verify logs output in JSON format</step>
      <step>Verify correlation ID in logs matches response header</step>
      <step>Test log aggregation in ELK/CloudWatch</step>
      <step>Verify logs searchable by correlation ID</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>All logs output in structured JSON format</criterion>
      <criterion>Correlation ID injected into all request logs</criterion>
      <criterion>Correlation ID returned in response headers</criterion>
      <criterion>Log levels configurable via environment</criterion>
      <criterion>Service name and environment in all logs</criterion>
      <criterion>Timestamps in ISO 8601 format</criterion>
      <criterion>Error logs include stack traces</criterion>
      <criterion>Request/response logging with timing</criterion>
      <criterion>Unit tests verify log format and correlation</criterion>
      <criterion>Documentation for log format and fields</criterion>
    </criteria>
    <acceptance>
      All criteria must be met and verified by code review before task
      can be marked complete.
    </acceptance>
  </definition_of_done>
</task_specification>
