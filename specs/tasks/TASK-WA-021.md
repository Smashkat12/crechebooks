<task_spec id="TASK-WA-021" version="2.0">

<metadata>
  <title>WhatsApp Broadcast Integration with Ad-hoc Communications</title>
  <status>pending</status>
  <phase>30</phase>
  <layer>logic</layer>
  <sequence>723</sequence>
  <priority>P3-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-WA-OPS-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-WA-007</task_ref>
    <task_ref status="complete">TASK-COMM-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-02-05</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  - Ad-hoc communications system (TASK-COMM-001 to 006) supports email and WhatsApp channels
  - WhatsApp broadcast currently uses basic text messages
  - No rich message support for broadcasts (templates, cards, quick replies)
  - No rate limiting for WhatsApp broadcast sends (Twilio has per-second limits)
  - No delivery tracking specific to broadcast messages
  - No broadcast-specific template for announcements

  **Existing Resources:**
  - BroadcastService (TASK-COMM-003) — sends to filtered recipient groups
  - WhatsAppChannelAdapter (TASK-NOTIF-001) — basic WhatsApp sending
  - TwilioContentService (TASK-WA-007) — rich message types
  - BroadcastMessage Prisma model (TASK-COMM-001)
  - RecipientGroup model (TASK-COMM-002)

  **Gap:**
  - No broadcast-specific approved template (cb_broadcast_announcement)
  - No rate-limited queue for broadcast sends
  - No rich message option in broadcast creation
  - No delivery status aggregation for broadcast analytics
  - No WhatsApp opt-out handling from broadcast messages

  **Files to Create:**
  - `apps/api/src/integrations/whatsapp/services/whatsapp-broadcast.service.ts`
  - `apps/api/src/integrations/whatsapp/services/whatsapp-broadcast.service.spec.ts`

  **Files to Modify:**
  - `apps/api/src/communications/services/broadcast.service.ts` — integrate WhatsApp broadcast service
  - `apps/api/src/integrations/whatsapp/templates/content-templates.ts` — add broadcast template
  - `apps/api/src/integrations/whatsapp/whatsapp.module.ts` — register service
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Broadcast Template
  ```typescript
  // In content-templates.ts

  export const BROADCAST_ANNOUNCEMENT: ContentTemplateDefinition = {
    friendlyName: 'cb_broadcast_announcement',
    language: 'en',
    category: 'UTILITY',
    variables: {
      '1': 'Sarah',            // Parent first name
      '2': 'Little Stars Creche', // Tenant name
      '3': 'Holiday Closure Notice', // Subject
      '4': 'Please note that the creche will be closed from 16-20 December for the holiday break. Normal operations resume on 6 January.', // Body
    },
    types: {
      'twilio/quick-reply': {
        body: 'Hi {{1}},\n\nMessage from {{2}}:\n\n*{{3}}*\n\n{{4}}\n\nKind regards,\n{{2}} Team',
        actions: [
          { type: 'QUICK_REPLY', title: 'Acknowledge', id: 'broadcast_ack' },
          { type: 'QUICK_REPLY', title: 'Reply', id: 'broadcast_reply' },
        ],
      },
    },
  };
  ```

  ### 2. Rate-Limited Broadcast Service
  ```typescript
  // apps/api/src/integrations/whatsapp/services/whatsapp-broadcast.service.ts

  @Injectable()
  export class WhatsAppBroadcastService {
    private readonly logger = new Logger(WhatsAppBroadcastService.name);
    // Twilio rate limit: ~80 messages/second for WhatsApp
    private readonly BATCH_SIZE = 50;
    private readonly BATCH_DELAY_MS = 1000;

    constructor(
      private readonly prisma: PrismaService,
      private readonly whatsappService: TwilioWhatsAppService,
      private readonly contentService: TwilioContentService,
    ) {}

    /**
     * Send broadcast to a list of WhatsApp-opted-in parents
     */
    async sendBroadcast(
      broadcastId: string,
      tenantId: string,
      subject: string,
      body: string,
      recipients: Array<{ parentId: string; phone: string; firstName: string }>,
    ): Promise<BroadcastResult> {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
      const results: BroadcastRecipientResult[] = [];

      // Process in batches to respect rate limits
      for (let i = 0; i < recipients.length; i += this.BATCH_SIZE) {
        const batch = recipients.slice(i, i + this.BATCH_SIZE);

        const batchResults = await Promise.allSettled(
          batch.map(recipient =>
            this.sendToRecipient(recipient, tenant, subject, body, broadcastId),
          ),
        );

        results.push(
          ...batchResults.map((result, idx) => ({
            parentId: batch[idx].parentId,
            status: result.status === 'fulfilled' ? 'sent' : 'failed',
            error: result.status === 'rejected' ? result.reason?.message : undefined,
          })),
        );

        // Rate limit delay between batches
        if (i + this.BATCH_SIZE < recipients.length) {
          await new Promise(resolve => setTimeout(resolve, this.BATCH_DELAY_MS));
        }
      }

      // Update broadcast with delivery stats
      const sent = results.filter(r => r.status === 'sent').length;
      const failed = results.filter(r => r.status === 'failed').length;

      return { total: recipients.length, sent, failed, results };
    }

    private async sendToRecipient(
      recipient: { parentId: string; phone: string; firstName: string },
      tenant: Tenant,
      subject: string,
      body: string,
      broadcastId: string,
    ): Promise<void> {
      await this.whatsappService.sendTemplateMessage(
        recipient.phone,
        'cb_broadcast_announcement',
        {
          '1': recipient.firstName,
          '2': tenant.tradingName,
          '3': subject,
          '4': body,
        },
      );
    }
  }
  ```

  ### 3. Opt-Out Handling
  ```typescript
  // When parent replies "STOP" to a broadcast:
  // 1. Mark parent.whatsappOptIn = false
  // 2. Respond with opt-out confirmation
  // 3. Do not send future broadcasts via WhatsApp
  // WhatsApp/Twilio handles STOP automatically, but we should sync the flag
  ```

  ### 4. Integration with Broadcast Service
  ```typescript
  // In broadcast.service.ts — when channel is 'whatsapp' or 'both':

  if (channel === 'whatsapp' || channel === 'both') {
    const waRecipients = recipients
      .filter(r => r.whatsappOptIn && r.phone)
      .map(r => ({
        parentId: r.id,
        phone: r.phone,
        firstName: r.firstName,
      }));

    const waResult = await this.whatsappBroadcastService.sendBroadcast(
      broadcast.id,
      tenantId,
      broadcast.subject,
      broadcast.body,
      waRecipients,
    );

    // Store WhatsApp delivery stats
    await this.prisma.broadcastDelivery.createMany({
      data: waResult.results.map(r => ({
        broadcastId: broadcast.id,
        parentId: r.parentId,
        channel: 'whatsapp',
        status: r.status,
        error: r.error,
      })),
    });
  }
  ```
</critical_patterns>

<scope>
  <in_scope>
    - WhatsAppBroadcastService with rate-limited sending
    - Broadcast announcement template (cb_broadcast_announcement)
    - Batch processing (50 per batch, 1s delay)
    - Delivery tracking per recipient
    - Integration with existing BroadcastService
    - Opt-out flag sync (whatsappOptIn = false on STOP)
    - Acknowledge/Reply quick reply handlers
    - Unit tests for batching and rate limiting
  </in_scope>
  <out_of_scope>
    - Broadcast scheduling (time-based sends)
    - Media attachments in broadcasts (text + template only)
    - Broadcast analytics dashboard UI
    - Multi-language broadcast templates
    - Broadcast targeting by child age group
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Create broadcast service
# Create apps/api/src/integrations/whatsapp/services/whatsapp-broadcast.service.ts

# 2. Add broadcast template
# Edit apps/api/src/integrations/whatsapp/templates/content-templates.ts

# 3. Update broadcast service integration
# Edit apps/api/src/communications/services/broadcast.service.ts

# 4. Verify
pnpm run build
pnpm run lint
pnpm test --runInBand
```
</verification_commands>

<definition_of_done>
  - [ ] WhatsAppBroadcastService with rate-limited batch sending
  - [ ] cb_broadcast_announcement template defined
  - [ ] Batch processing: 50 recipients per batch, 1s delay
  - [ ] Delivery results tracked per recipient
  - [ ] Integration with BroadcastService for channel routing
  - [ ] Opt-out handling (STOP → whatsappOptIn = false)
  - [ ] Acknowledge quick reply handler
  - [ ] Reply quick reply handler (opens session for follow-up)
  - [ ] Unit tests for batching logic
  - [ ] Unit tests for error handling (partial failures)
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

</task_spec>
