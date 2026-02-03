<task_spec id="TASK-FIX-001" version="2.0">

<metadata>
  <title>SARS Submission Failure Notifications</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>301</sequence>
  <implements>
    <requirement_ref>REQ-SARS-NOTIFY-001</requirement_ref>
    <requirement_ref>REQ-SARS-NOTIFY-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-SARS-018</task_ref>
    <task_ref status="complete">TASK-INFRA-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-02-03</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Modify:**
  - `apps/api/src/database/services/sars-submission-retry.service.ts` (add notification logic)
  - `apps/api/src/database/types/sars-submission.types.ts` (add webhook config type if needed)

  **Files to Create:**
  - `apps/api/src/database/entities/sars-notification.entity.ts` (NEW - notification record entity)
  - `apps/api/tests/database/services/sars-submission-retry.service.spec.ts` (update tests)

  **Current Problem:**
  The `notifyAdmin()` method in `SarsSubmissionRetryService` contains TODO comments:
  ```typescript
  notifyAdmin(submission: any, error: SarsApiError): void {
    // ... builds AdminNotification object ...

    // Log for now - TODO: Integrate with email/notification service
    this.logger.error(
      `[ADMIN ALERT] SARS submission failed: ${JSON.stringify(notification)}`,
      error.originalError?.stack,
    );

    // TODO: Send email notification to administrators
    // TODO: Create notification record in database
    // TODO: Trigger webhook if configured
  }
  ```

  **Existing Infrastructure:**
  - `NotificationService` exists at `apps/api/src/notifications/notification.service.ts`
  - `AuditLogService` available for database logging
  - `AdminNotification` type already defined in `sars-submission.types.ts`

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Notification Integration Pattern
  ```typescript
  @Injectable()
  export class SarsSubmissionRetryService {
    private readonly logger = new Logger(SarsSubmissionRetryService.name);

    constructor(
      private readonly prisma: PrismaService,
      @Optional() private readonly sarsClient?: SarsEfilingClient,
      @Optional() @Inject('RETRY_CONFIG') retryConfig?: Partial<RetryConfig>,
      @Optional() private readonly notificationService?: NotificationService,
      @Optional() private readonly auditLogService?: AuditLogService,
      private readonly configService?: ConfigService,
    ) {
      this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
    }

    /**
     * Notify administrators of submission failures
     */
    async notifyAdmin(submission: any, error: SarsApiError): Promise<void> {
      const metadata = submission.documentData?.retryMetadata || {};
      const errorType = this.classifyError(error);

      const notification: AdminNotification = {
        submissionId: submission.id,
        tenantId: submission.tenantId,
        submissionType: submission.submissionType,
        period: `${submission.periodStart.toISOString()} to ${submission.periodEnd.toISOString()}`,
        errorMessage: error.message,
        errorType,
        retryCount: metadata.retryCount || 0,
        inDlq: metadata.inDlq || false,
        correlationId: metadata.correlationId || null,
        failedAt: new Date(),
      };

      // 1. Always log the alert
      this.logger.error(
        `[ADMIN ALERT] SARS submission failed: ${JSON.stringify(notification)}`,
        error.originalError?.stack,
      );

      // 2. Create notification record in database for audit trail
      await this.createNotificationRecord(notification);

      // 3. Send email notification to administrators
      await this.sendEmailNotification(notification);

      // 4. Trigger webhook if configured
      await this.triggerWebhook(notification);
    }

    private async createNotificationRecord(
      notification: AdminNotification,
    ): Promise<void> {
      try {
        await this.prisma.sarsNotification.create({
          data: {
            tenantId: notification.tenantId,
            submissionId: notification.submissionId,
            notificationType: 'SUBMISSION_FAILED',
            payload: notification as unknown as Prisma.JsonObject,
            sentAt: new Date(),
          },
        });
      } catch (error) {
        this.logger.error(
          `Failed to create notification record: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Don't throw - notification recording is non-critical
      }
    }

    private async sendEmailNotification(
      notification: AdminNotification,
    ): Promise<void> {
      if (!this.notificationService) {
        this.logger.warn('NotificationService not available, skipping email');
        return;
      }

      try {
        // Get tenant admin users to notify
        const adminUsers = await this.prisma.userTenantRole.findMany({
          where: {
            tenantId: notification.tenantId,
            isActive: true,
            role: { in: ['OWNER', 'ADMIN'] },
          },
          include: { user: true },
        });

        for (const adminUser of adminUsers) {
          await this.notificationService.send(notification.tenantId, {
            recipientId: adminUser.userId,
            type: 'SARS_SUBMISSION_FAILED',
            subject: `SARS Submission Failed - ${notification.submissionType}`,
            body: this.buildEmailBody(notification),
            data: notification,
          });
        }
      } catch (error) {
        this.logger.error(
          `Failed to send email notification: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Don't throw - email is non-critical
      }
    }

    private async triggerWebhook(
      notification: AdminNotification,
    ): Promise<void> {
      const webhookUrl = this.configService?.get<string>('SARS_WEBHOOK_URL');
      if (!webhookUrl) {
        return; // Webhook not configured
      }

      try {
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-CrecheBooks-Event': 'sars.submission.failed',
          },
          body: JSON.stringify(notification),
        });

        if (!response.ok) {
          this.logger.warn(
            `Webhook returned ${response.status}: ${response.statusText}`,
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to trigger webhook: ${error instanceof Error ? error.message : String(error)}`,
        );
        // Don't throw - webhook is non-critical
      }
    }

    private buildEmailBody(notification: AdminNotification): string {
      return `
SARS Submission Failed

Submission ID: ${notification.submissionId}
Type: ${notification.submissionType}
Period: ${notification.period}
Error: ${notification.errorMessage}
Error Type: ${notification.errorType}
Retry Count: ${notification.retryCount}
In DLQ: ${notification.inDlq ? 'Yes' : 'No'}
Failed At: ${notification.failedAt.toISOString()}

${notification.inDlq ? 'This submission requires manual intervention.' : 'The system will automatically retry.'}

Correlation ID: ${notification.correlationId || 'N/A'}
      `.trim();
    }
  }
  ```

  ### 3. Database Model for Notification Records
  ```prisma
  // Add to schema.prisma
  model SarsNotification {
    id               String   @id @default(uuid())
    tenantId         String   @map("tenant_id")
    submissionId     String   @map("submission_id")
    notificationType String   @map("notification_type") @db.VarChar(50)
    payload          Json
    sentAt           DateTime @map("sent_at")
    createdAt        DateTime @default(now()) @map("created_at")

    tenant     Tenant         @relation(fields: [tenantId], references: [id])
    submission SarsSubmission @relation(fields: [submissionId], references: [id])

    @@index([tenantId, createdAt])
    @@index([submissionId])
    @@map("sars_notifications")
  }
  ```

  ### 4. Test Pattern
  ```typescript
  describe('SarsSubmissionRetryService - Notifications', () => {
    let service: SarsSubmissionRetryService;
    let prisma: PrismaService;
    let notificationService: NotificationService;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [
          SarsSubmissionRetryService,
          { provide: PrismaService, useValue: mockPrisma },
          { provide: NotificationService, useValue: mockNotificationService },
          { provide: ConfigService, useValue: mockConfigService },
        ],
      }).compile();

      service = module.get(SarsSubmissionRetryService);
    });

    it('should create notification record on failure', async () => {
      // Arrange
      const submission = createMockSubmission();
      const error: SarsApiError = {
        statusCode: 500,
        message: 'SARS service unavailable',
      };

      // Act
      await service.notifyAdmin(submission, error);

      // Assert
      expect(mockPrisma.sarsNotification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenantId: submission.tenantId,
          submissionId: submission.id,
          notificationType: 'SUBMISSION_FAILED',
        }),
      });
    });

    it('should send email to tenant admins', async () => {
      // Arrange
      mockPrisma.userTenantRole.findMany.mockResolvedValue([
        { userId: 'admin-1', user: { email: 'admin@creche.co.za' } },
      ]);

      // Act
      await service.notifyAdmin(createMockSubmission(), createMockError());

      // Assert
      expect(mockNotificationService.send).toHaveBeenCalled();
    });

    it('should trigger webhook when configured', async () => {
      // Arrange
      mockConfigService.get.mockReturnValue('https://webhook.example.com');
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      // Act
      await service.notifyAdmin(createMockSubmission(), createMockError());

      // Assert
      expect(fetch).toHaveBeenCalledWith(
        'https://webhook.example.com',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-CrecheBooks-Event': 'sars.submission.failed',
          }),
        }),
      );
    });

    it('should not throw if notification services fail', async () => {
      // Arrange
      mockPrisma.sarsNotification.create.mockRejectedValue(new Error('DB error'));
      mockNotificationService.send.mockRejectedValue(new Error('Email error'));

      // Act & Assert - should not throw
      await expect(
        service.notifyAdmin(createMockSubmission(), createMockError()),
      ).resolves.not.toThrow();
    });
  });
  ```

  ### 5. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task implements the notification system for failed SARS submissions.

**South African Context:**
- SARS eFiling failures can have serious compliance implications
- Tax deadlines are strict (monthly VAT, annual IRP5)
- Administrators need immediate notification of submission failures
- DLQ submissions require urgent manual intervention

**Notification Requirements:**
1. **Email**: Send to all tenant OWNER and ADMIN users
2. **Database Record**: Create audit trail for compliance
3. **Webhook**: Optional integration with external monitoring systems
</context>

<scope>
  <in_scope>
    - Implement email notification to tenant administrators
    - Create notification record in database
    - Add optional webhook trigger
    - Handle notification failures gracefully (don't fail main flow)
    - Unit tests for notification logic
  </in_scope>
  <out_of_scope>
    - SMS notifications (future enhancement)
    - Push notifications
    - Notification preferences UI
    - Retry logic for failed notifications
    - Rate limiting for notifications
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Add SarsNotification model to schema
# Edit apps/api/prisma/schema.prisma

# 2. Generate Prisma client
pnpm prisma:generate

# 3. Create migration
pnpm prisma:migrate dev --name add_sars_notification

# 4. Update SarsSubmissionRetryService
# Edit apps/api/src/database/services/sars-submission-retry.service.ts

# 5. Update tests
# Edit apps/api/tests/database/services/sars-submission-retry.service.spec.ts

# 6. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Notification failures must not interrupt the retry flow
    - All tenant OWNER and ADMIN users must be notified
    - Notification records must be tenant-scoped
    - Webhook URL must be configurable via environment variable
    - Email body must include all relevant submission details
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Creates notification record in database
    - Test: Sends email to all tenant admins
    - Test: Triggers webhook when configured
    - Test: Handles notification service errors gracefully
    - Test: Includes correct submission details in notification
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Let notification failures throw exceptions
  - Send notifications to users outside the tenant
  - Skip creating database record (required for audit)
  - Hardcode webhook URLs
  - Block the retry flow waiting for notifications
</anti_patterns>

</task_spec>
