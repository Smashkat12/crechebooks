<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-INFRA-008</task_id>
    <title>Add Request Payload Size Limit</title>
    <priority>MEDIUM</priority>
    <severity>MEDIUM</severity>
    <category>Infrastructure</category>
    <subcategory>Security</subcategory>
    <estimated_effort>1 hour</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>16-remediation</phase>
    <status>DONE</status>
  </metadata>

  <context>
    <issue_description>
      The API does not configure request payload size limits. Without limits,
      malicious clients can send extremely large payloads to exhaust server
      memory, cause denial of service, or exploit parsing vulnerabilities.
    </issue_description>
    <impact>
      - Memory exhaustion from large payloads
      - Denial of service attacks
      - Slow processing of oversized requests
      - Potential buffer overflow exploits
      - Server instability under attack
    </impact>
    <root_cause>
      NestJS/Express body-parser default limits are either too high or
      not explicitly configured, leaving the API vulnerable.
    </root_cause>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/api/src/main.ts" action="modify">
        Configure body-parser limits for JSON and URL-encoded payloads
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/api/src/common/config/body-parser.config.ts" action="create">
        Create centralized body parser configuration
      </file>
    </files_to_create>
    <dependencies>
      <dependency>body-parser (included with Express)</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Configure body-parser middleware with appropriate size limits for
      different content types. Set sensible defaults (e.g., 10MB for JSON)
      with environment variable overrides. Add specific higher limits for
      file upload endpoints if needed.
    </approach>
    <steps>
      <step order="1">
        Configure JSON body parser with size limit
      </step>
      <step order="2">
        Configure URL-encoded body parser with size limit
      </step>
      <step order="3">
        Configure raw body parser for webhook signatures
      </step>
      <step order="4">
        Add environment variable configuration
      </step>
      <step order="5">
        Create decorator for custom limits on specific endpoints
      </step>
      <step order="6">
        Add appropriate error response for oversized payloads
      </step>
    </steps>
    <code_example>
```typescript
// main.ts
import { json, urlencoded, raw } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false, // Disable default to use custom config
  });

  const jsonLimit = process.env.BODY_LIMIT_JSON || '10mb';
  const urlencodedLimit = process.env.BODY_LIMIT_URLENCODED || '10mb';
  const rawLimit = process.env.BODY_LIMIT_RAW || '5mb';

  // JSON body parser with limit
  app.use(json({
    limit: jsonLimit,
    verify: (req: any, res, buf) => {
      // Store raw body for webhook signature verification
      if (req.headers['stripe-signature']) {
        req.rawBody = buf;
      }
    },
  }));

  // URL-encoded body parser with limit
  app.use(urlencoded({
    limit: urlencodedLimit,
    extended: true,
  }));

  // Raw body parser for specific routes (webhooks)
  app.use('/webhooks/*', raw({
    limit: rawLimit,
    type: 'application/json',
  }));

  await app.listen(3000);
}

// body-parser.config.ts
export const bodyParserConfig = {
  json: {
    limit: process.env.BODY_LIMIT_JSON || '10mb',
  },
  urlencoded: {
    limit: process.env.BODY_LIMIT_URLENCODED || '10mb',
    extended: true,
  },
  raw: {
    limit: process.env.BODY_LIMIT_RAW || '5mb',
  },
};

// Custom decorator for specific endpoints needing larger limits
import { SetMetadata } from '@nestjs/common';

export const BODY_SIZE_KEY = 'bodySize';
export const BodySize = (limit: string) => SetMetadata(BODY_SIZE_KEY, limit);

// Usage on controller
@Post('upload')
@BodySize('50mb') // Allow larger uploads for this endpoint
async uploadFile(@Body() body: any) {
  // Handle large file upload
}

// Exception filter for payload too large
import { ExceptionFilter, Catch, ArgumentsHost, PayloadTooLargeException } from '@nestjs/common';

@Catch(PayloadTooLargeException)
export class PayloadTooLargeFilter implements ExceptionFilter {
  catch(exception: PayloadTooLargeException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    response.status(413).json({
      statusCode: 413,
      error: 'Payload Too Large',
      message: 'Request body exceeds size limit',
      limit: process.env.BODY_LIMIT_JSON || '10mb',
    });
  }
}
```
    </code_example>
    <configuration>
      <env_vars>
        <var name="BODY_LIMIT_JSON" default="10mb">JSON payload size limit</var>
        <var name="BODY_LIMIT_URLENCODED" default="10mb">URL-encoded payload limit</var>
        <var name="BODY_LIMIT_RAW" default="5mb">Raw body limit for webhooks</var>
      </env_vars>
    </configuration>
    <size_recommendations>
      <recommendation type="Standard API">10mb - sufficient for most JSON payloads</recommendation>
      <recommendation type="File uploads">50-100mb - for file upload endpoints</recommendation>
      <recommendation type="Webhooks">5mb - webhook payloads are typically small</recommendation>
      <recommendation type="High security">1mb - minimize attack surface</recommendation>
    </size_recommendations>
  </implementation>

  <verification>
    <test_cases>
      <test name="Normal payload accepted">
        Send request within limit and verify success
      </test>
      <test name="Oversized payload rejected">
        Send request exceeding limit and verify 413 response
      </test>
      <test name="Different content types have appropriate limits">
        Verify JSON and URL-encoded have separate limits
      </test>
      <test name="Error response is informative">
        Verify 413 response includes limit information
      </test>
      <test name="Webhook raw body preserved">
        Verify raw body available for signature verification
      </test>
    </test_cases>
    <manual_verification>
      <step>Start API with default limits</step>
      <step>Send 5MB JSON payload - verify accepted</step>
      <step>Send 15MB JSON payload - verify 413 response</step>
      <step>Check error response format</step>
      <step>Verify webhook signature verification still works</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>JSON body parser limited to 10MB by default</criterion>
      <criterion>URL-encoded body parser limited to 10MB by default</criterion>
      <criterion>Raw body parser limited to 5MB for webhooks</criterion>
      <criterion>Limits configurable via environment variables</criterion>
      <criterion>Oversized requests return 413 with informative message</criterion>
      <criterion>Raw body preserved for webhook signature verification</criterion>
      <criterion>Unit tests verify limit enforcement</criterion>
      <criterion>Documentation includes size limit information</criterion>
    </criteria>
    <acceptance>
      All criteria must be met and verified by code review before task
      can be marked complete.
    </acceptance>
  </definition_of_done>
</task_specification>
