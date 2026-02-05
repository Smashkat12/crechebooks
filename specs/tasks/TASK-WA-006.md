<task_spec id="TASK-WA-006" version="2.0">

<metadata>
  <title>WhatsApp Message Retry Service</title>
  <status>complete</status>
  <layer>logic</layer>
  <sequence>265</sequence>
  <implements>
    <requirement_ref>REQ-WA-RETRY-001</requirement_ref>
    <requirement_ref>REQ-RELIABILITY-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-INT-005</task_ref>
    <task_ref status="pending">TASK-WA-001</task_ref>
    <task_ref status="pending">TASK-WA-002</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
  <last_updated>2026-01-20</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/api/src/integrations/whatsapp/whatsapp-retry.service.ts` (NEW)
  - `apps/api/src/integrations/whatsapp/whatsapp-retry.job.ts` (NEW)
  - `apps/api/src/integrations/whatsapp/types/retry.types.ts` (NEW)
  - `apps/api/tests/integrations/whatsapp/whatsapp-retry.service.spec.ts` (NEW)

  **Files to Modify:**
  - `apps/api/src/integrations/whatsapp/whatsapp.module.ts` (add retry service)
  - `apps/api/src/integrations/whatsapp/whatsapp.service.ts` (use retry for failures)
  - `apps/api/src/scheduler/scheduler.module.ts` (add retry job)

  **Current Problem:**
  - Failed WhatsApp messages are not retried
  - No dead letter queue for permanently failed messages
  - No exponential backoff for rate limit handling
  - No alerting for repeated failures
  - Transient failures cause message loss

  **Existing Rate Limiting:**
  - WhatsAppService has 80 msg/sec rate limit
  - No retry logic when rate limited
  - No queue for delayed messages

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Retry Service Pattern
  ```typescript
  @Injectable()
  export class WhatsAppRetryService {
    private readonly logger = new Logger(WhatsAppRetryService.name);
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAYS = [60000, 300000, 900000]; // 1min, 5min, 15min

    constructor(
      private readonly prisma: PrismaService,
      private readonly whatsAppService: WhatsAppService,
      @InjectQueue('whatsapp-retry') private retryQueue: Queue,
    ) {}

    /**
     * Queue a failed message for retry
     */
    async queueForRetry(
      messageId: string,
      retryCount: number = 0,
    ): Promise<void> {
      if (retryCount >= this.MAX_RETRIES) {
        await this.moveToDeadLetter(messageId);
        return;
      }

      const delay = this.RETRY_DELAYS[retryCount] || this.RETRY_DELAYS[2];

      await this.retryQueue.add(
        'retry-message',
        { messageId, retryCount: retryCount + 1 },
        {
          delay,
          attempts: 1, // BullMQ handles this attempt, we track retryCount
          backoff: { type: 'exponential', delay: 60000 },
          removeOnComplete: true,
          removeOnFail: false,
        },
      );

      await this.prisma.whatsAppMessage.update({
        where: { id: messageId },
        data: {
          status: 'pending_retry',
          retryCount: retryCount + 1,
          nextRetryAt: new Date(Date.now() + delay),
        },
      });

      this.logger.log(`Message ${messageId} queued for retry #${retryCount + 1}`);
    }

    /**
     * Process retry attempt
     */
    async processRetry(messageId: string, retryCount: number): Promise<void> {
      const message = await this.prisma.whatsAppMessage.findUnique({
        where: { id: messageId },
        include: { parent: true },
      });

      if (!message) {
        this.logger.warn(`Message ${messageId} not found for retry`);
        return;
      }

      if (message.status === 'delivered' || message.status === 'read') {
        this.logger.log(`Message ${messageId} already delivered, skipping retry`);
        return;
      }

      try {
        const result = await this.whatsAppService.resendMessage(
          message.tenantId,
          messageId,
        );

        if (result.success) {
          await this.prisma.whatsAppMessage.update({
            where: { id: messageId },
            data: {
              status: 'sent',
              wamid: result.wamid,
              sentAt: new Date(),
              errorCode: null,
              errorMessage: null,
            },
          });
          this.logger.log(`Message ${messageId} retry successful`);
        } else {
          await this.handleRetryFailure(messageId, retryCount, result.error);
        }
      } catch (error) {
        await this.handleRetryFailure(messageId, retryCount, error.message);
      }
    }

    /**
     * Handle retry failure - queue for next retry or move to DLQ
     */
    private async handleRetryFailure(
      messageId: string,
      retryCount: number,
      error: string,
    ): Promise<void> {
      await this.prisma.whatsAppMessage.update({
        where: { id: messageId },
        data: {
          errorMessage: error,
          lastRetryAt: new Date(),
        },
      });

      if (retryCount >= this.MAX_RETRIES) {
        await this.moveToDeadLetter(messageId);
      } else {
        await this.queueForRetry(messageId, retryCount);
      }
    }

    /**
     * Move permanently failed message to dead letter queue
     */
    private async moveToDeadLetter(messageId: string): Promise<void> {
      await this.prisma.whatsAppMessage.update({
        where: { id: messageId },
        data: {
          status: 'failed',
          movedToDeadLetterAt: new Date(),
        },
      });

      this.logger.error(`Message ${messageId} moved to dead letter queue after ${this.MAX_RETRIES} retries`);

      // TODO: Alert/notify admin of permanent failure
    }

    /**
     * Get failed messages for monitoring
     */
    async getFailedMessages(
      tenantId: string,
      options?: { limit?: number; includeRetrying?: boolean },
    ): Promise<WhatsAppMessage[]> {
      return this.prisma.whatsAppMessage.findMany({
        where: {
          tenantId,
          status: {
            in: options?.includeRetrying
              ? ['failed', 'pending_retry']
              : ['failed'],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: options?.limit ?? 50,
      });
    }

    /**
     * Manually retry a failed message
     */
    async manualRetry(messageId: string): Promise<void> {
      const message = await this.prisma.whatsAppMessage.findUnique({
        where: { id: messageId },
      });

      if (!message || message.status !== 'failed') {
        throw new BusinessException(
          'Message not found or not in failed state',
          'INVALID_MESSAGE_STATE',
        );
      }

      await this.queueForRetry(messageId, 0);
    }
  }
  ```

  ### 3. Retry Job Pattern
  ```typescript
  @Processor('whatsapp-retry')
  export class WhatsAppRetryProcessor {
    private readonly logger = new Logger(WhatsAppRetryProcessor.name);

    constructor(private readonly retryService: WhatsAppRetryService) {}

    @Process('retry-message')
    async handleRetry(job: Job<{ messageId: string; retryCount: number }>) {
      this.logger.log(`Processing retry job for message ${job.data.messageId}`);

      try {
        await this.retryService.processRetry(
          job.data.messageId,
          job.data.retryCount,
        );
      } catch (error) {
        this.logger.error(`Retry job failed: ${error.message}`);
        throw error; // Let BullMQ handle the failure
      }
    }

    @OnQueueFailed()
    async onFailed(job: Job, error: Error) {
      this.logger.error(
        `Job ${job.id} failed for message ${job.data.messageId}: ${error.message}`,
      );
    }
  }
  ```

  ### 4. Schema Update
  ```prisma
  // Add to WhatsAppMessage model
  retryCount       Int       @default(0) @map("retry_count")
  nextRetryAt      DateTime? @map("next_retry_at")
  lastRetryAt      DateTime? @map("last_retry_at")
  movedToDeadLetterAt DateTime? @map("moved_to_dead_letter_at")

  @@index([status, nextRetryAt])
  ```

  ### 5. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task implements retry logic for failed WhatsApp messages.

**Retry Strategy:**
1. Exponential backoff: 1 min, 5 min, 15 min
2. Maximum 3 retry attempts
3. Dead letter queue for permanent failures
4. Manual retry capability for staff

**Meta API Error Codes:**
- 130429: Rate limit exceeded (retry after delay)
- 131026: Message undeliverable (don't retry)
- 131047: Re-engagement required (don't retry)
- 131053: Invalid phone number (don't retry)
- 131031: Business account locked (alert admin)

**South African Context:**
- Network issues common in some areas
- Retry during off-peak hours may help
- Consider SMS fallback for critical messages
</context>

<scope>
  <in_scope>
    - Create WhatsAppRetryService
    - Create BullMQ retry job processor
    - Implement exponential backoff
    - Implement dead letter queue
    - Add retry fields to message entity
    - Classify retryable vs permanent errors
    - Manual retry API endpoint
    - Unit tests for retry logic
  </in_scope>
  <out_of_scope>
    - SMS fallback channel
    - Admin alerting/notifications
    - Retry dashboard UI
    - Rate limit quota monitoring
    - Message priority queue
  </out_of_scope>
</scope>

<error_classification>
## Error Types and Retry Behavior

| Error Code | Description | Retryable | Action |
|------------|-------------|-----------|--------|
| 130429 | Rate limit exceeded | Yes | Retry with backoff |
| 131000 | Technical error | Yes | Retry with backoff |
| 131026 | Undeliverable | No | Move to DLQ |
| 131047 | Re-engagement required | No | Move to DLQ |
| 131053 | Invalid phone | No | Move to DLQ |
| 131031 | Account locked | No | Alert admin |
| Network error | Connection failed | Yes | Retry immediately |
| Timeout | Request timeout | Yes | Retry with backoff |
</error_classification>

<verification_commands>
## Execution Order

```bash
# 1. Update Prisma schema
# Add retry fields to WhatsAppMessage model

# 2. Create migration
cd apps/api
npx prisma migrate dev --name add_whatsapp_retry_fields

# 3. Create types
# Create apps/api/src/integrations/whatsapp/types/retry.types.ts

# 4. Create retry service
# Create apps/api/src/integrations/whatsapp/whatsapp-retry.service.ts

# 5. Create retry job
# Create apps/api/src/integrations/whatsapp/whatsapp-retry.job.ts

# 6. Update module
# Edit apps/api/src/integrations/whatsapp/whatsapp.module.ts

# 7. Update scheduler module
# Edit apps/api/src/scheduler/scheduler.module.ts

# 8. Update WhatsApp service
# Edit apps/api/src/integrations/whatsapp/whatsapp.service.ts

# 9. Create tests
# Create apps/api/tests/integrations/whatsapp/whatsapp-retry.service.spec.ts

# 10. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - BullMQ for queue management
    - Redis for queue persistence
    - Exponential backoff strategy
    - Error code classification
    - Idempotent retry processing
    - Dead letter queue tracking
    - Audit trail for all retry attempts
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Queue message for retry
    - Test: Process retry successfully
    - Test: Move to DLQ after max retries
    - Test: Classify retryable errors
    - Test: Exponential backoff delays
    - Test: Manual retry endpoint
    - Test: Idempotent processing
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Retry non-retryable errors
  - Retry indefinitely
  - Skip error classification
  - Process retries synchronously
  - Lose message state on failure
  - Ignore DLQ for monitoring
</anti_patterns>

</task_spec>
