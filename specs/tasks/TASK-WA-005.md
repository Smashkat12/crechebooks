<task_spec id="TASK-WA-005" version="2.0">

<metadata>
  <title>WhatsApp Channel Adapter Tests</title>
  <status>ready</status>
  <layer>testing</layer>
  <sequence>264</sequence>
  <implements>
    <requirement_ref>REQ-TEST-COVERAGE-001</requirement_ref>
    <requirement_ref>REQ-WA-QUALITY-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-INT-005</task_ref>
    <task_ref status="complete">TASK-NOTIF-001</task_ref>
    <task_ref status="pending">TASK-WA-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-01-20</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/api/tests/notifications/adapters/whatsapp-channel.adapter.spec.ts` (NEW)
  - `apps/api/tests/integrations/whatsapp/whatsapp-webhook.spec.ts` (NEW)

  **Files to Reference:**
  - `apps/api/src/notifications/adapters/whatsapp-channel.adapter.ts` (212 lines)
  - `apps/api/src/integrations/whatsapp/whatsapp.service.ts` (813 lines)
  - `apps/api/src/webhooks/webhook.controller.ts` (357 lines)
  - `apps/api/tests/integrations/whatsapp/whatsapp.service.spec.ts` (existing tests)

  **Current Problem:**
  - WhatsApp channel adapter has no dedicated tests
  - Webhook handler tested only via integration, no unit tests
  - Phone number validator has limited edge case coverage
  - No E2E tests for WhatsApp delivery flow
  - Code coverage unknown for WhatsApp module

  **Existing Test Coverage:**
  - `whatsapp.service.spec.ts` - Basic service tests
  - `phone-number.validator.spec.ts` - Validator tests
  - No adapter tests
  - No webhook unit tests

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Channel Adapter Test Pattern
  ```typescript
  import { Test, TestingModule } from '@nestjs/testing';
  import { WhatsAppChannelAdapter } from '../../../src/notifications/adapters/whatsapp-channel.adapter';
  import { WhatsAppService } from '../../../src/integrations/whatsapp/whatsapp.service';
  import { PrismaService } from '../../../src/database/prisma.service';
  import { NotificationPayload, NotificationType } from '../../../src/notifications/types';

  describe('WhatsAppChannelAdapter', () => {
    let adapter: WhatsAppChannelAdapter;
    let whatsAppService: jest.Mocked<WhatsAppService>;
    let prisma: jest.Mocked<PrismaService>;

    const mockTenantId = 'tenant-123';
    const mockParentId = 'parent-456';
    const mockPhone = '+27821234567';

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WhatsAppChannelAdapter,
          {
            provide: WhatsAppService,
            useValue: {
              sendInvoice: jest.fn(),
              sendReminder: jest.fn(),
              checkOptIn: jest.fn(),
            },
          },
          {
            provide: PrismaService,
            useValue: {
              parent: {
                findUnique: jest.fn(),
              },
            },
          },
        ],
      }).compile();

      adapter = module.get<WhatsAppChannelAdapter>(WhatsAppChannelAdapter);
      whatsAppService = module.get(WhatsAppService);
      prisma = module.get(PrismaService);
    });

    describe('isAvailable', () => {
      it('should return true when parent is opted in and has valid phone', async () => {
        prisma.parent.findUnique.mockResolvedValue({
          id: mockParentId,
          phone: mockPhone,
          whatsappOptedIn: true,
        });

        const result = await adapter.isAvailable(mockTenantId, mockParentId);

        expect(result).toBe(true);
      });

      it('should return false when parent is not opted in', async () => {
        prisma.parent.findUnique.mockResolvedValue({
          id: mockParentId,
          phone: mockPhone,
          whatsappOptedIn: false,
        });

        const result = await adapter.isAvailable(mockTenantId, mockParentId);

        expect(result).toBe(false);
      });

      it('should return false when parent has no phone', async () => {
        prisma.parent.findUnique.mockResolvedValue({
          id: mockParentId,
          phone: null,
          whatsappOptedIn: true,
        });

        const result = await adapter.isAvailable(mockTenantId, mockParentId);

        expect(result).toBe(false);
      });

      it('should return false when parent has invalid phone format', async () => {
        prisma.parent.findUnique.mockResolvedValue({
          id: mockParentId,
          phone: '0821234567', // Missing country code
          whatsappOptedIn: true,
        });

        const result = await adapter.isAvailable(mockTenantId, mockParentId);

        expect(result).toBe(false);
      });
    });

    describe('send', () => {
      const invoicePayload: NotificationPayload = {
        type: NotificationType.INVOICE,
        tenantId: mockTenantId,
        parentId: mockParentId,
        data: {
          invoiceId: 'inv-123',
          amount: 150000,
          dueDate: new Date('2026-02-15'),
        },
      };

      it('should send invoice notification via WhatsApp', async () => {
        whatsAppService.sendInvoice.mockResolvedValue({
          success: true,
          wamid: 'wamid_123',
        });

        const result = await adapter.send(invoicePayload);

        expect(result.success).toBe(true);
        expect(whatsAppService.sendInvoice).toHaveBeenCalledWith(
          mockTenantId,
          mockParentId,
          expect.objectContaining({
            invoiceId: 'inv-123',
          }),
        );
      });

      it('should handle send failure gracefully', async () => {
        whatsAppService.sendInvoice.mockResolvedValue({
          success: false,
          error: 'Rate limit exceeded',
        });

        const result = await adapter.send(invoicePayload);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Rate limit exceeded');
      });

      it('should throw error for unsupported notification type', async () => {
        const unsupportedPayload = {
          ...invoicePayload,
          type: 'UNKNOWN' as NotificationType,
        };

        await expect(adapter.send(unsupportedPayload)).rejects.toThrow(
          'Unsupported notification type',
        );
      });
    });
  });
  ```

  ### 3. Webhook Handler Test Pattern
  ```typescript
  import { Test, TestingModule } from '@nestjs/testing';
  import { WebhookController } from '../../../src/webhooks/webhook.controller';
  import { WebhookService } from '../../../src/webhooks/webhook.service';
  import { IdempotencyService } from '../../../src/common/services/idempotency.service';
  import { WhatsAppWebhookPayload } from '../../../src/webhooks/types/webhook.types';

  describe('WebhookController - WhatsApp', () => {
    let controller: WebhookController;
    let webhookService: jest.Mocked<WebhookService>;
    let idempotencyService: jest.Mocked<IdempotencyService>;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        controllers: [WebhookController],
        providers: [
          {
            provide: WebhookService,
            useValue: {
              verifyWhatsAppSignature: jest.fn(),
              verifyWhatsAppSubscription: jest.fn(),
              processWhatsAppEvent: jest.fn(),
            },
          },
          {
            provide: IdempotencyService,
            useValue: {
              checkDuplicate: jest.fn(),
              markProcessed: jest.fn(),
            },
          },
        ],
      }).compile();

      controller = module.get<WebhookController>(WebhookController);
      webhookService = module.get(WebhookService);
      idempotencyService = module.get(IdempotencyService);
    });

    describe('handleWhatsAppWebhook', () => {
      const mockPayload: WhatsAppWebhookPayload = {
        object: 'whatsapp_business_account',
        entry: [
          {
            id: 'entry-123',
            changes: [
              {
                value: {
                  messaging_product: 'whatsapp',
                  metadata: {
                    display_phone_number: '27821234567',
                    phone_number_id: 'phone-123',
                  },
                  statuses: [
                    {
                      id: 'wamid_123',
                      status: 'delivered',
                      timestamp: '1705755600',
                      recipient_id: '27829876543',
                    },
                  ],
                },
                field: 'messages',
              },
            ],
          },
        ],
      };

      it('should process valid webhook with correct signature', async () => {
        webhookService.verifyWhatsAppSignature.mockReturnValue(true);
        webhookService.processWhatsAppEvent.mockResolvedValue({
          processed: 1,
          skipped: 0,
          errors: [],
        });

        const mockReq = {
          rawBody: Buffer.from(JSON.stringify(mockPayload)),
          body: mockPayload,
          isDuplicate: false,
          idempotencyKey: 'whatsapp:entry-123:wamid_123:delivered',
        };

        const result = await controller.handleWhatsAppWebhook(
          mockReq as any,
          mockPayload,
          'sha256=valid_signature',
        );

        expect(result.processed).toBe(1);
        expect(webhookService.verifyWhatsAppSignature).toHaveBeenCalled();
        expect(webhookService.processWhatsAppEvent).toHaveBeenCalledWith(mockPayload);
      });

      it('should reject webhook with invalid signature', async () => {
        webhookService.verifyWhatsAppSignature.mockReturnValue(false);

        const mockReq = {
          rawBody: Buffer.from(JSON.stringify(mockPayload)),
          body: mockPayload,
          isDuplicate: false,
        };

        await expect(
          controller.handleWhatsAppWebhook(
            mockReq as any,
            mockPayload,
            'sha256=invalid_signature',
          ),
        ).rejects.toThrow('Invalid webhook signature');
      });

      it('should return cached result for duplicate request', async () => {
        const cachedResult = { processed: 1, skipped: 0, errors: [] };

        const mockReq = {
          rawBody: Buffer.from(JSON.stringify(mockPayload)),
          body: mockPayload,
          isDuplicate: true,
          idempotencyResult: cachedResult,
          idempotencyKey: 'whatsapp:entry-123:wamid_123:delivered',
        };

        const result = await controller.handleWhatsAppWebhook(
          mockReq as any,
          mockPayload,
          'sha256=valid_signature',
        );

        expect(result).toEqual(cachedResult);
        expect(webhookService.processWhatsAppEvent).not.toHaveBeenCalled();
      });
    });

    describe('handleWhatsAppVerification', () => {
      it('should return challenge for valid verify request', () => {
        webhookService.verifyWhatsAppSubscription.mockReturnValue('challenge_123');

        const result = controller.handleWhatsAppVerification(
          'subscribe',
          'verify_token',
          'challenge_123',
        );

        expect(result).toBe('challenge_123');
      });

      it('should throw error for invalid verify token', () => {
        webhookService.verifyWhatsAppSubscription.mockImplementation(() => {
          throw new Error('Invalid verify token');
        });

        expect(() =>
          controller.handleWhatsAppVerification(
            'subscribe',
            'wrong_token',
            'challenge_123',
          ),
        ).toThrow('Invalid verify token');
      });
    });
  });
  ```

  ### 4. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  pnpm test:cov           # Coverage report
  ```
</critical_patterns>

<context>
This task creates comprehensive tests for the WhatsApp integration.

**Testing Goals:**
1. Unit tests for WhatsApp channel adapter
2. Unit tests for webhook handler
3. Edge case coverage for phone validation
4. Signature verification testing
5. Idempotency testing

**Test Categories:**
- Happy path: successful sends, valid webhooks
- Error handling: failures, invalid signatures
- Edge cases: missing data, invalid formats
- Security: signature verification, injection attempts
</context>

<scope>
  <in_scope>
    - WhatsApp channel adapter unit tests
    - Webhook controller unit tests
    - Webhook service unit tests
    - Phone number validator edge cases
    - Mock Meta API responses
    - Signature verification tests
    - Idempotency behavior tests
  </in_scope>
  <out_of_scope>
    - E2E tests with real Meta API
    - Load/stress testing
    - UI component tests (TASK-WA-004)
    - Performance benchmarks
  </out_of_scope>
</scope>

<test_coverage_targets>
## Target Coverage

| Module | Current | Target |
|--------|---------|--------|
| whatsapp-channel.adapter.ts | 0% | 90% |
| webhook.controller.ts (WhatsApp) | 40% | 85% |
| whatsapp.service.ts | 60% | 85% |
| phone-number.validator.ts | 70% | 95% |
</test_coverage_targets>

<verification_commands>
## Execution Order

```bash
# 1. Create channel adapter tests
# Create apps/api/tests/notifications/adapters/whatsapp-channel.adapter.spec.ts

# 2. Create webhook tests
# Create apps/api/tests/integrations/whatsapp/whatsapp-webhook.spec.ts

# 3. Add phone validator edge cases
# Edit apps/api/tests/integrations/whatsapp/phone-number.validator.spec.ts

# 4. Run tests
pnpm test --runInBand

# 5. Check coverage
pnpm test:cov --collectCoverageFrom="**/whatsapp/**/*.ts"

# 6. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Jest with NestJS testing module
    - Mock all external dependencies
    - No real API calls in tests
    - Test both success and failure paths
    - Test idempotency behavior
    - Test signature verification
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Channel adapter coverage > 90%
    - Webhook handler coverage > 85%
    - All edge cases documented
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Make real API calls in unit tests
  - Skip error path testing
  - Use flaky async timing
  - Test implementation details
  - Skip mock type safety
</anti_patterns>

</task_spec>
