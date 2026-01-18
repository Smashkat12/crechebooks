<task_spec id="TASK-SPAY-009" version="2.0">

<metadata>
  <title>Add SimplePay Webhook Handler</title>
  <status>ready</status>
  <layer>integration</layer>
  <sequence>192</sequence>
  <implements>
    <requirement_ref>REQ-SIMPLEPAY-WEBHOOK-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-SPAY-001</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
  <last_updated>2026-01-17</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/api/src/integrations/simplepay/simplepay-webhook.controller.ts` (NEW)
  - `apps/api/src/integrations/simplepay/simplepay-webhook.service.ts` (NEW)
  - `apps/api/src/integrations/simplepay/dto/simplepay-webhook.dto.ts` (NEW)

  **Files to Modify:**
  - `apps/api/src/integrations/simplepay/simplepay.module.ts`
  - `apps/api/prisma/schema.prisma` (add WebhookLog model)

  **Current Problem:**
  SimplePay changes (payslips processed, employee updates, pay runs completed) are not pushed to CrecheBooks. Currently relies on manual polling which is:
  1. Delayed (polling interval)
  2. Resource intensive (constant API calls)
  3. Rate limited (60 req/min)

  **SimplePay Webhook Events:**
  - `payrun.completed` - Pay run has been finalized
  - `payslip.created` - New payslip generated
  - `employee.updated` - Employee details changed
  - `employee.terminated` - Employee termination processed

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Webhook Controller Pattern
  ```typescript
  import { Controller, Post, Body, Headers, HttpCode, Logger, RawBodyRequest, Req } from '@nestjs/common';
  import { Request } from 'express';

  @Controller('webhooks/simplepay')
  export class SimplePayWebhookController {
    private readonly logger = new Logger(SimplePayWebhookController.name);

    constructor(private readonly webhookService: SimplePayWebhookService) {}

    @Post()
    @HttpCode(200)
    async handleWebhook(
      @Req() req: RawBodyRequest<Request>,
      @Headers('x-simplepay-signature') signature: string,
      @Body() payload: SimplePayWebhookPayload,
    ): Promise<{ received: boolean }> {
      // Verify signature FIRST
      const isValid = await this.webhookService.verifySignature(
        req.rawBody,
        signature,
      );
      if (!isValid) {
        this.logger.warn('Invalid webhook signature received');
        throw new UnauthorizedException('Invalid signature');
      }

      // Log webhook for debugging/replay
      await this.webhookService.logWebhook(payload);

      // Process asynchronously (don't block response)
      this.webhookService.processWebhook(payload).catch(err => {
        this.logger.error(`Webhook processing failed: ${err.message}`, err.stack);
      });

      return { received: true };
    }
  }
  ```

  ### 3. Webhook Service Pattern
  ```typescript
  @Injectable()
  export class SimplePayWebhookService {
    private readonly logger = new Logger(SimplePayWebhookService.name);

    constructor(
      private readonly prisma: PrismaService,
      private readonly configService: ConfigService,
      private readonly payslipService: SimplePayPayslipService,
    ) {}

    async verifySignature(rawBody: Buffer, signature: string): Promise<boolean> {
      const secret = this.configService.get<string>('SIMPLEPAY_WEBHOOK_SECRET');
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

      return crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature),
      );
    }

    async processWebhook(payload: SimplePayWebhookPayload): Promise<void> {
      switch (payload.event) {
        case 'payrun.completed':
          await this.handlePayRunCompleted(payload.data);
          break;
        case 'payslip.created':
          await this.handlePayslipCreated(payload.data);
          break;
        case 'employee.updated':
          await this.handleEmployeeUpdated(payload.data);
          break;
        case 'employee.terminated':
          await this.handleEmployeeTerminated(payload.data);
          break;
        default:
          this.logger.warn(`Unknown webhook event: ${payload.event}`);
      }
    }
  }
  ```

  ### 4. Webhook Log Model
  ```prisma
  model WebhookLog {
    id          String   @id @default(uuid())
    tenantId    String?  @map("tenant_id")
    source      String   // SIMPLEPAY, XERO, etc.
    eventType   String   @map("event_type")
    payload     Json
    processed   Boolean  @default(false)
    processedAt DateTime? @map("processed_at")
    error       String?
    createdAt   DateTime @default(now()) @map("created_at")

    tenant Tenant? @relation(fields: [tenantId], references: [id])

    @@index([source, eventType])
    @@index([processed])
    @@map("webhook_logs")
  }
  ```

  ### 5. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task implements webhook handling for SimplePay events. Instead of polling SimplePay for changes, SimplePay will push events to CrecheBooks when things change.

**Webhook Flow:**
1. SimplePay event occurs (payslip created, etc.)
2. SimplePay POSTs to CrecheBooks webhook endpoint
3. CrecheBooks verifies signature
4. CrecheBooks acknowledges receipt (200 response)
5. CrecheBooks processes event asynchronously
6. CrecheBooks updates local data

**Security:**
- HMAC-SHA256 signature verification
- Webhook secret stored in environment
- Request logging for debugging
- Idempotency handling (duplicate webhook detection)
</context>

<scope>
  <in_scope>
    - Create SimplePayWebhookController
    - Create SimplePayWebhookService
    - Add WebhookLog model for audit/debugging
    - Implement signature verification (HMAC-SHA256)
    - Handle payrun.completed event
    - Handle payslip.created event
    - Handle employee.updated event
    - Handle employee.terminated event
    - Async processing with error handling
    - Idempotency via webhook ID tracking
  </in_scope>
  <out_of_scope>
    - Webhook retry mechanism (SimplePay handles this)
    - Webhook configuration UI
    - Custom webhook events
    - Real-time UI updates via WebSocket
  </out_of_scope>
</scope>

<simplepay_webhook_format>
## SimplePay Webhook Payload Format

### Headers
- `x-simplepay-signature`: HMAC-SHA256 signature
- `x-simplepay-delivery-id`: Unique delivery ID (for idempotency)
- `Content-Type`: application/json

### Payload Structure
```json
{
  "event": "payrun.completed",
  "delivery_id": "del_abc123",
  "timestamp": "2026-01-15T10:30:00Z",
  "client_id": "client_xyz789",
  "data": {
    "payrun_id": "pr_123",
    "pay_period_start": "2026-01-01",
    "pay_period_end": "2026-01-31",
    "employee_count": 25,
    "total_gross": 375000.00,
    "total_net": 285000.00
  }
}
```

### Event Types
| Event | Description |
|-------|-------------|
| `payrun.completed` | Pay run finalized and payslips generated |
| `payslip.created` | Individual payslip created |
| `employee.updated` | Employee details changed |
| `employee.terminated` | Employee termination processed |
</simplepay_webhook_format>

<verification_commands>
## Execution Order

```bash
# 1. Update Prisma schema
# Add WebhookLog model

# 2. Run migration
npx prisma migrate dev --name add_webhook_log

# 3. Create DTOs
# Create apps/api/src/integrations/simplepay/dto/simplepay-webhook.dto.ts

# 4. Create service
# Create apps/api/src/integrations/simplepay/simplepay-webhook.service.ts

# 5. Create controller
# Create apps/api/src/integrations/simplepay/simplepay-webhook.controller.ts

# 6. Update module
# Edit apps/api/src/integrations/simplepay/simplepay.module.ts

# 7. Create tests
# Create apps/api/tests/integrations/simplepay/simplepay-webhook.service.spec.ts
# Create apps/api/tests/integrations/simplepay/simplepay-webhook.controller.spec.ts

# 8. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Signature verification MUST happen before any processing
    - Response MUST be returned quickly (< 500ms)
    - Processing MUST be asynchronous (don't block response)
    - Webhooks MUST be logged for debugging
    - Duplicate webhooks MUST be detected (idempotency)
    - Failed processing MUST be logged but not fail response
    - Raw body MUST be available for signature verification
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Valid signature accepted
    - Test: Invalid signature rejected (401)
    - Test: Webhook logged to database
    - Test: payrun.completed event processed
    - Test: payslip.created event processed
    - Test: employee.updated event processed
    - Test: employee.terminated event processed
    - Test: Duplicate webhook detected
    - Test: Unknown event type logged but not error
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Process webhook synchronously (blocking response)
  - Skip signature verification
  - Use string comparison for signature (timing attack)
  - Return error status for processing failures
  - Parse body before signature verification
  - Store webhook secret in code
</anti_patterns>

</task_spec>
