<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-INFRA-006</task_id>
    <title>Add Webhook Idempotency Deduplication</title>
    <priority>HIGH</priority>
    <severity>HIGH</severity>
    <category>Infrastructure</category>
    <subcategory>Reliability</subcategory>
    <estimated_effort>4 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <phase>16-remediation</phase>
    <status>DONE</status>
  </metadata>

  <context>
    <issue_description>
      Webhook handlers do not implement idempotency key deduplication. When
      webhook providers retry failed deliveries or network issues cause
      duplicate submissions, the same webhook can be processed multiple times
      leading to duplicate actions.
    </issue_description>
    <impact>
      - Duplicate payments processed
      - Duplicate notifications sent
      - Data inconsistency from repeated operations
      - Customer complaints from duplicate charges
      - Difficulty debugging webhook issues
      - Potential financial discrepancies
    </impact>
    <root_cause>
      Webhook handlers process every incoming request without checking if
      the idempotency key has been previously processed.
    </root_cause>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/api/src/webhooks/*.ts" action="modify">
        Add idempotency check to all webhook handlers
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/api/src/common/services/idempotency.service.ts" action="create">
        Create centralized idempotency service
      </file>
      <file path="apps/api/src/common/decorators/idempotent.decorator.ts" action="create">
        Create decorator for idempotent endpoints
      </file>
      <file path="apps/api/src/common/guards/idempotency.guard.ts" action="create">
        Create guard for automatic idempotency checking
      </file>
    </files_to_create>
    <dependencies>
      <dependency>Redis for idempotency key storage</dependency>
      <dependency>ioredis or redis client library</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Implement an idempotency service that stores processed webhook idempotency
      keys in Redis with configurable TTL. Use a guard or decorator pattern
      to automatically check and record idempotency keys for webhook endpoints.
    </approach>
    <steps>
      <step order="1">
        Create IdempotencyService with Redis storage
      </step>
      <step order="2">
        Implement check-and-set logic for idempotency keys
      </step>
      <step order="3">
        Create @Idempotent() decorator for webhook handlers
      </step>
      <step order="4">
        Create IdempotencyGuard for automatic checking
      </step>
      <step order="5">
        Configure TTL based on webhook provider retry windows
      </step>
      <step order="6">
        Add idempotency checking to all webhook handlers
      </step>
      <step order="7">
        Log duplicate detection for monitoring
      </step>
    </steps>
    <code_example>
```typescript
// idempotency.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class IdempotencyService {
  private readonly KEY_PREFIX = 'idempotency:';
  private readonly DEFAULT_TTL = 86400; // 24 hours

  constructor(@InjectRedis() private readonly redis: Redis) {}

  async checkAndSet(key: string, ttl?: number): Promise<boolean> {
    const fullKey = `${this.KEY_PREFIX}${key}`;
    const result = await this.redis.set(
      fullKey,
      Date.now().toString(),
      'EX',
      ttl || this.DEFAULT_TTL,
      'NX'
    );
    return result === 'OK'; // true if new, false if exists
  }

  async isProcessed(key: string): Promise<boolean> {
    const fullKey = `${this.KEY_PREFIX}${key}`;
    const exists = await this.redis.exists(fullKey);
    return exists === 1;
  }

  async markProcessed(key: string, result?: any, ttl?: number): Promise<void> {
    const fullKey = `${this.KEY_PREFIX}${key}`;
    const value = result ? JSON.stringify(result) : Date.now().toString();
    await this.redis.set(fullKey, value, 'EX', ttl || this.DEFAULT_TTL);
  }

  async getStoredResult(key: string): Promise<any | null> {
    const fullKey = `${this.KEY_PREFIX}${key}`;
    const value = await this.redis.get(fullKey);
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}

// idempotent.decorator.ts
import { SetMetadata } from '@nestjs/common';

export const IDEMPOTENCY_KEY = 'idempotency';

export interface IdempotencyOptions {
  keyExtractor?: (req: any) => string;
  ttl?: number;
  headerName?: string;
}

export const Idempotent = (options?: IdempotencyOptions) =>
  SetMetadata(IDEMPOTENCY_KEY, options || {});

// idempotency.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdempotencyService } from '../services/idempotency.service';
import { IDEMPOTENCY_KEY, IdempotencyOptions } from '../decorators/idempotent.decorator';

@Injectable()
export class IdempotencyGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private idempotencyService: IdempotencyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<IdempotencyOptions>(
      IDEMPOTENCY_KEY,
      context.getHandler(),
    );

    if (!options) return true;

    const request = context.switchToHttp().getRequest();
    const headerName = options.headerName || 'x-idempotency-key';
    const idempotencyKey = options.keyExtractor
      ? options.keyExtractor(request)
      : request.headers[headerName] || request.body?.idempotencyKey;

    if (!idempotencyKey) return true; // No key, proceed normally

    const isNew = await this.idempotencyService.checkAndSet(
      idempotencyKey,
      options.ttl,
    );

    if (!isNew) {
      // Return cached result for duplicate request
      const storedResult = await this.idempotencyService.getStoredResult(idempotencyKey);
      request.idempotencyResult = storedResult;
      request.isDuplicate = true;
    }

    return true;
  }
}

// webhook.controller.ts
@Controller('webhooks')
export class WebhookController {
  @Post('stripe')
  @Idempotent({
    keyExtractor: (req) => req.headers['stripe-signature'] + req.body?.id,
    ttl: 172800, // 48 hours for Stripe retries
  })
  async handleStripeWebhook(@Req() req: any, @Body() body: any) {
    if (req.isDuplicate) {
      return req.idempotencyResult || { status: 'already_processed' };
    }

    // Process webhook
    const result = await this.processStripeEvent(body);

    // Store result for potential duplicates
    await this.idempotencyService.markProcessed(
      req.headers['stripe-signature'] + body.id,
      result,
    );

    return result;
  }
}
```
    </code_example>
    <configuration>
      <env_vars>
        <var name="IDEMPOTENCY_TTL" default="86400">Default TTL in seconds</var>
        <var name="IDEMPOTENCY_PREFIX" default="idempotency:">Redis key prefix</var>
      </env_vars>
    </configuration>
  </implementation>

  <verification>
    <test_cases>
      <test name="First request processes successfully">
        Send webhook and verify it processes normally
      </test>
      <test name="Duplicate request returns cached result">
        Send same webhook twice and verify second returns cached result
      </test>
      <test name="Different idempotency keys process separately">
        Send webhooks with different keys and verify both process
      </test>
      <test name="TTL expiry allows reprocessing">
        Wait for TTL and verify webhook can be processed again
      </test>
      <test name="Missing idempotency key still processes">
        Send webhook without key and verify it processes
      </test>
      <test name="Duplicate detection logged">
        Verify duplicate requests are logged for monitoring
      </test>
    </test_cases>
    <manual_verification>
      <step>Send webhook to endpoint</step>
      <step>Verify Redis stores idempotency key</step>
      <step>Send same webhook again</step>
      <step>Verify duplicate detected and cached result returned</step>
      <step>Check logs for duplicate detection</step>
    </manual_verification>
  </verification>

  <definition_of_done>
    <criteria>
      <criterion>IdempotencyService implemented with Redis storage</criterion>
      <criterion>@Idempotent decorator available for endpoints</criterion>
      <criterion>All webhook handlers use idempotency checking</criterion>
      <criterion>Duplicate requests return cached results</criterion>
      <criterion>TTL configurable per endpoint</criterion>
      <criterion>Duplicate detection logged for monitoring</criterion>
      <criterion>Unit tests cover all idempotency scenarios</criterion>
      <criterion>Integration test verifies Redis storage</criterion>
      <criterion>Documentation for idempotency usage</criterion>
    </criteria>
    <acceptance>
      All criteria must be met and verified by code review before task
      can be marked complete.
    </acceptance>
  </definition_of_done>
</task_specification>
