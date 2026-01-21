<task_spec id="TASK-COMM-002" version="1.0">

<metadata>
  <title>Ad-hoc Communication Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>281</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-COMM-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-COMM-001</task_ref>
    <task_ref status="complete">TASK-INT-005</task_ref>
    <task_ref status="complete">TASK-BILL-013</task_ref>
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
  - `apps/api/src/communications/services/adhoc-communication.service.ts` (NEW)
  - `apps/api/src/communications/services/recipient-resolver.service.ts` (NEW)
  - `apps/api/src/communications/services/broadcast-processor.service.ts` (NEW)
  - `apps/api/src/communications/processors/broadcast.processor.ts` (NEW)

  **Files to Modify:**
  - `apps/api/src/communications/communications.module.ts` (add services)
  - `apps/api/src/integrations/email/email.service.ts` (add bulk send method)
  - `apps/api/src/integrations/whatsapp/whatsapp.service.ts` (add adhoc message method)

  **Current Problem:**
  - No service to orchestrate ad-hoc message sending
  - No way to resolve recipients from filter criteria
  - No bulk sending capability with rate limiting
  - No background processing for large broadcasts
  - Cannot send the same message via multiple channels

  **Test Count:** 450+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. AdhocCommunicationService
  ```typescript
  @Injectable()
  export class AdhocCommunicationService {
    constructor(
      private readonly broadcastEntity: BroadcastMessageEntity,
      private readonly recipientEntity: MessageRecipientEntity,
      private readonly recipientResolver: RecipientResolverService,
      private readonly emailService: EmailService,
      private readonly whatsappService: WhatsAppService,
      private readonly notificationService: NotificationService,
      private readonly auditLogService: AuditLogService,
      @InjectQueue('broadcast') private readonly broadcastQueue: Queue,
    ) {}

    async createBroadcast(
      tenantId: string,
      userId: string,
      dto: CreateBroadcastDto,
    ): Promise<BroadcastMessage> {
      // 1. Create broadcast record
      const broadcast = await this.broadcastEntity.create({
        tenantId,
        ...dto,
      }, userId);

      // 2. Resolve recipients based on filter
      const recipients = await this.recipientResolver.resolve(
        tenantId,
        dto.recipientType,
        dto.recipientFilter,
        dto.channel,
      );

      // 3. Create recipient records
      const recipientRecords = recipients.map(r => ({
        broadcastId: broadcast.id,
        recipientId: r.id,
        recipientType: dto.recipientType,
        recipientName: r.name,
        recipientEmail: r.email,
        recipientPhone: r.phone,
      }));
      await this.recipientEntity.createMany(recipientRecords);

      // 4. Update total count
      await this.broadcastEntity.updateStatus(broadcast.id, 'draft', {
        totalRecipients: recipients.length,
      });

      return broadcast;
    }

    async sendBroadcast(
      tenantId: string,
      broadcastId: string,
    ): Promise<void> {
      // Queue for background processing
      await this.broadcastQueue.add('send', {
        tenantId,
        broadcastId,
      }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
      });
    }
  }
  ```

  ### 3. RecipientResolverService
  ```typescript
  @Injectable()
  export class RecipientResolverService {
    constructor(
      private readonly prisma: PrismaService,
    ) {}

    async resolve(
      tenantId: string,
      recipientType: RecipientType,
      filter?: RecipientFilterCriteria,
      channel?: CommunicationChannel,
    ): Promise<ResolvedRecipient[]> {
      if (recipientType === RecipientType.PARENT) {
        return this.resolveParents(tenantId, filter?.parentFilter, channel);
      } else if (recipientType === RecipientType.STAFF) {
        return this.resolveStaff(tenantId, filter?.staffFilter, channel);
      } else if (recipientType === RecipientType.CUSTOM) {
        return this.resolveByIds(tenantId, filter?.selectedIds ?? []);
      }
      return [];
    }

    private async resolveParents(
      tenantId: string,
      filter?: ParentFilter,
      channel?: CommunicationChannel,
    ): Promise<ResolvedRecipient[]> {
      const where: Prisma.ParentWhereInput = {
        tenantId,
        deletedAt: null,
        ...(filter?.isActive !== undefined && { isActive: filter.isActive }),
        ...(channel === 'whatsapp' && { whatsappOptIn: true, whatsapp: { not: null } }),
        ...(channel === 'sms' && { smsOptIn: true, phone: { not: null } }),
        ...(channel === 'email' && { email: { not: null } }),
      };

      // Handle enrollment-based filters
      if (filter?.enrollmentStatus?.length || filter?.feeStructureId) {
        where.children = {
          some: {
            enrollments: {
              some: {
                ...(filter.enrollmentStatus?.length && { status: { in: filter.enrollmentStatus } }),
                ...(filter.feeStructureId && { feeStructureId: filter.feeStructureId }),
              },
            },
          },
        };
      }

      // Handle arrears filter
      if (filter?.hasOutstandingBalance) {
        where.invoices = {
          some: {
            status: { in: ['SENT', 'OVERDUE', 'PARTIALLY_PAID'] },
            isDeleted: false,
          },
        };
      }

      const parents = await this.prisma.parent.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          whatsapp: true,
          preferredContact: true,
        },
      });

      return parents.map(p => ({
        id: p.id,
        name: `${p.firstName} ${p.lastName}`,
        email: p.email ?? undefined,
        phone: p.whatsapp ?? p.phone ?? undefined,
        preferredContact: p.preferredContact,
      }));
    }

    private async resolveStaff(
      tenantId: string,
      filter?: StaffFilter,
      channel?: CommunicationChannel,
    ): Promise<ResolvedRecipient[]> {
      const where: Prisma.StaffWhereInput = {
        tenantId,
        ...(filter?.isActive !== undefined && { isActive: filter.isActive }),
        ...(filter?.employmentType?.length && { employmentType: { in: filter.employmentType } }),
        ...(filter?.department && { department: filter.department }),
        ...(filter?.position && { position: filter.position }),
        ...(channel === 'email' && { email: { not: null } }),
        ...(channel !== 'email' && { phone: { not: null } }),
      };

      const staff = await this.prisma.staff.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
        },
      });

      return staff.map(s => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        email: s.email ?? undefined,
        phone: s.phone ?? undefined,
      }));
    }
  }
  ```

  ### 4. BroadcastProcessor (BullMQ)
  ```typescript
  @Processor('broadcast')
  export class BroadcastProcessor {
    constructor(
      private readonly broadcastEntity: BroadcastMessageEntity,
      private readonly recipientEntity: MessageRecipientEntity,
      private readonly emailService: EmailService,
      private readonly whatsappService: WhatsAppService,
      private readonly auditLogService: AuditLogService,
    ) {}

    @Process('send')
    async handleSend(job: Job<{ tenantId: string; broadcastId: string }>) {
      const { tenantId, broadcastId } = job.data;

      const broadcast = await this.broadcastEntity.findById(broadcastId);
      if (!broadcast) throw new Error(`Broadcast ${broadcastId} not found`);

      // Update status to sending
      await this.broadcastEntity.updateStatus(broadcastId, 'sending');

      const recipients = await this.prisma.messageRecipient.findMany({
        where: { broadcastId },
      });

      let sentCount = 0;
      let failedCount = 0;

      for (const recipient of recipients) {
        try {
          await this.sendToRecipient(broadcast, recipient);
          sentCount++;
        } catch (error) {
          failedCount++;
          await this.recipientEntity.markFailed(recipient.id, error.message);
        }

        // Rate limiting: 50ms between messages
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // Update final status
      const finalStatus = failedCount === 0 ? 'sent' :
                          sentCount === 0 ? 'failed' : 'partially_sent';
      await this.broadcastEntity.updateStatus(broadcastId, finalStatus, {
        sentCount,
        failedCount,
      });

      // Audit log
      await this.auditLogService.log({
        tenantId,
        action: 'broadcast_sent',
        entityType: 'broadcast_message',
        entityId: broadcastId,
        metadata: { sentCount, failedCount },
      });
    }

    private async sendToRecipient(
      broadcast: BroadcastMessage,
      recipient: MessageRecipient,
    ): Promise<void> {
      const channel = broadcast.channel;

      if (channel === 'email' || channel === 'all') {
        if (recipient.recipientEmail) {
          const result = await this.emailService.sendRaw({
            to: recipient.recipientEmail,
            subject: broadcast.subject ?? 'Message from your Creche',
            text: broadcast.body,
            html: broadcast.htmlBody,
          });
          await this.recipientEntity.updateEmailStatus(
            broadcast.id,
            recipient.recipientId,
            'sent',
            result.messageId,
          );
        }
      }

      if (channel === 'whatsapp' || channel === 'all') {
        if (recipient.recipientPhone) {
          const result = await this.whatsappService.sendTextMessage(
            recipient.recipientPhone,
            broadcast.body,
          );
          await this.recipientEntity.updateWhatsAppStatus(
            broadcast.id,
            recipient.recipientId,
            'sent',
            result.wamid,
          );
        }
      }
    }
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
This task implements the core communication service for sending ad-hoc messages.

**Business Requirements:**
1. Resolve recipients based on flexible filter criteria
2. Support sending via email, WhatsApp, or both channels
3. Background processing for large recipient lists
4. Rate limiting to respect API limits (Mailgun, WhatsApp)
5. Track delivery status per recipient per channel
6. Audit logging for POPIA compliance

**Integration Points:**
- EmailService (Mailgun) - Existing integration
- WhatsAppService (Twilio/Meta) - Existing integration
- BullMQ for background job processing
- AuditLogService for compliance

**Rate Limits:**
- Mailgun: 10,000/month (sandbox), configurable for production
- WhatsApp (Twilio): 50 msg/sec
- WhatsApp (Meta): 80 msg/sec
</context>

<scope>
  <in_scope>
    - AdhocCommunicationService for orchestration
    - RecipientResolverService for filter-based recipient lookup
    - BroadcastProcessor for background job processing
    - Email sending method for raw/custom content
    - WhatsApp text message method (non-template)
    - Rate limiting between sends
    - Delivery status tracking
  </in_scope>
  <out_of_scope>
    - API controller (TASK-COMM-003)
    - Frontend UI (TASK-COMM-004, TASK-COMM-005, TASK-COMM-006)
    - SMS sending (can be added later)
    - Scheduled message sending (future enhancement)
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Create RecipientResolverService
# Create apps/api/src/communications/services/recipient-resolver.service.ts

# 2. Create AdhocCommunicationService
# Create apps/api/src/communications/services/adhoc-communication.service.ts

# 3. Create BroadcastProcessor
# Create apps/api/src/communications/processors/broadcast.processor.ts

# 4. Update EmailService
# Add sendRaw() method to apps/api/src/integrations/email/email.service.ts

# 5. Update WhatsAppService
# Add sendTextMessage() method to apps/api/src/integrations/whatsapp/whatsapp.service.ts

# 6. Update CommunicationsModule
# Add services, processors, and queue registration

# 7. Create tests
# Create apps/api/tests/communications/services/adhoc-communication.service.spec.ts
# Create apps/api/tests/communications/services/recipient-resolver.service.spec.ts
# Create apps/api/tests/communications/processors/broadcast.processor.spec.ts

# 8. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - RecipientResolverService handles Parent, Staff, and Custom recipient types
    - Respects whatsappOptIn and smsOptIn for channel selection
    - BullMQ queue for background processing
    - Rate limiting between message sends (50ms)
    - Error handling with retry support
    - Audit logging for all broadcasts
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Resolve all active parents
    - Test: Resolve parents with arrears filter
    - Test: Resolve parents with WhatsApp opt-in only
    - Test: Resolve staff by department
    - Test: Create broadcast and queue for sending
    - Test: Process broadcast with email channel
    - Test: Process broadcast with WhatsApp channel
    - Test: Process broadcast with both channels
    - Test: Handle partial failures gracefully
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Send messages synchronously in the main request (use queue)
  - Skip rate limiting (will hit API limits)
  - Ignore opt-in preferences for WhatsApp/SMS
  - Send WhatsApp templates for ad-hoc content (use text messages)
  - Log full message content (privacy concern)
  - Block the event loop with large recipient lists
</anti_patterns>

</task_spec>
