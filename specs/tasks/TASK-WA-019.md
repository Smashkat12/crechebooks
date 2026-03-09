<task_spec id="TASK-WA-019" version="2.0">

<metadata>
  <title>WhatsApp Template Approval Monitoring Service</title>
  <status>pending</status>
  <phase>30</phase>
  <layer>logic</layer>
  <sequence>721</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-WA-OPS-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-WA-007</task_ref>
    <task_ref status="complete">TASK-WA-008</task_ref>
  </depends_on>
  <estimated_complexity>low</estimated_complexity>
  <estimated_effort>2 hours</estimated_effort>
  <last_updated>2026-02-05</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  - 9 CrecheBooks templates are pending WhatsApp approval (submitted 2026-02-05)
  - No automated way to check approval status
  - No notification when templates are approved or rejected
  - No sync between Twilio's approval status and the local whatsapp_content_templates table
  - Must manually curl Twilio API to check status

  **Existing Resources:**
  - whatsapp_content_templates Prisma model — has approval_status column
  - TwilioContentService (TASK-WA-007) — Twilio API access
  - register-whatsapp-templates.ts — existing registration script
  - Content SIDs stored in DB from registration

  **Gap:**
  - No CRON job to poll Twilio for approval status changes
  - No admin notification on approval/rejection
  - No auto-update of local approval_status
  - No rejection reason tracking for resubmission

  **Files to Create:**
  - `apps/api/src/integrations/whatsapp/jobs/template-approval-monitor.job.ts`
  - `apps/api/src/integrations/whatsapp/jobs/template-approval-monitor.job.spec.ts`

  **Files to Modify:**
  - `apps/api/src/integrations/whatsapp/whatsapp.module.ts` — register CRON job
  - `apps/api/prisma/schema.prisma` — add rejectionReason to WhatsAppContentTemplate (if not exists)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Approval Monitor CRON Job
  ```typescript
  // apps/api/src/integrations/whatsapp/jobs/template-approval-monitor.job.ts

  @Injectable()
  export class TemplateApprovalMonitorJob {
    private readonly logger = new Logger(TemplateApprovalMonitorJob.name);

    constructor(
      private readonly prisma: PrismaService,
      private readonly configService: ConfigService,
      private readonly httpService: HttpService,
      private readonly notificationService: NotificationService,
    ) {}

    /**
     * Check template approval status every 6 hours
     */
    @Cron('0 */6 * * *')  // Every 6 hours
    async checkApprovalStatus(): Promise<void> {
      const pendingTemplates = await this.prisma.whatsAppContentTemplate.findMany({
        where: {
          approvalStatus: { in: ['pending', 'unsubmitted'] },
        },
      });

      if (pendingTemplates.length === 0) {
        this.logger.debug('No pending templates to check');
        return;
      }

      const accountSid = this.configService.get('TWILIO_ACCOUNT_SID');
      const authToken = this.configService.get('TWILIO_AUTH_TOKEN');
      const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

      for (const template of pendingTemplates) {
        try {
          const response = await this.httpService.axiosRef.get(
            `https://content.twilio.com/v1/Content/${template.contentSid}/ApprovalRequests`,
            { headers: { Authorization: `Basic ${auth}` } },
          );

          const approval = response.data?.whatsapp;
          if (!approval) continue;

          const newStatus = approval.status; // 'approved', 'rejected', 'pending'
          const rejectionReason = approval.rejection_reason || null;

          if (newStatus !== template.approvalStatus) {
            // Status changed — update DB
            await this.prisma.whatsAppContentTemplate.update({
              where: { id: template.id },
              data: {
                approvalStatus: newStatus,
                approvedAt: newStatus === 'approved' ? new Date() : null,
                rejectionReason,
              },
            });

            this.logger.log(
              `Template ${template.friendlyName} status: ${template.approvalStatus} → ${newStatus}`,
            );

            // Notify admins
            await this.notifyStatusChange(template, newStatus, rejectionReason);
          }
        } catch (error) {
          this.logger.warn(`Failed to check ${template.friendlyName}: ${error.message}`);
        }
      }
    }

    private async notifyStatusChange(
      template: WhatsAppContentTemplate,
      newStatus: string,
      rejectionReason?: string,
    ): Promise<void> {
      const admins = await this.prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'OWNER', 'SUPER_ADMIN'] } },
        select: { email: true },
      });

      const subject = newStatus === 'approved'
        ? `✅ WhatsApp template approved: ${template.friendlyName}`
        : `❌ WhatsApp template rejected: ${template.friendlyName}`;

      const body = newStatus === 'rejected'
        ? `Template "${template.friendlyName}" was rejected.\n\nReason: ${rejectionReason}\n\nPlease review and resubmit.`
        : `Template "${template.friendlyName}" has been approved and is now active for sending.`;

      for (const admin of admins) {
        await this.notificationService.sendEmail({
          to: admin.email,
          subject,
          text: body,
        });
      }
    }
  }
  ```

  ### 2. Schema Addition
  ```prisma
  model WhatsAppContentTemplate {
    // ... existing fields
    rejectionReason  String?  @map("rejection_reason")
  }
  ```

  ### 3. Manual Check Script
  Add a CLI command to check status on demand:
  ```bash
  # In register-whatsapp-templates.ts, add --check-status flag
  npx ts-node apps/api/src/scripts/register-whatsapp-templates.ts --check-status
  ```
</critical_patterns>

<scope>
  <in_scope>
    - CRON job polling Twilio every 6 hours
    - DB update on status change
    - Admin email notification on approval/rejection
    - Rejection reason tracking
    - Manual check-status CLI flag
    - Unit tests for status comparison logic
  </in_scope>
  <out_of_scope>
    - Automatic resubmission after rejection
    - Template editing UI
    - Webhook-based status updates (Twilio doesn't support this)
    - Multi-tenant template management
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Create CRON job
# Create apps/api/src/integrations/whatsapp/jobs/template-approval-monitor.job.ts

# 2. Update schema if needed
# Run: pnpm prisma:generate

# 3. Verify
pnpm run build
pnpm run lint
pnpm test --runInBand
```
</verification_commands>

<definition_of_done>
  - [ ] TemplateApprovalMonitorJob CRON service (every 6 hours)
  - [ ] Polls Twilio Content API for approval status
  - [ ] Updates whatsapp_content_templates.approval_status on change
  - [ ] Stores rejection_reason when rejected
  - [ ] Sets approved_at timestamp when approved
  - [ ] Admin email notification on status change
  - [ ] --check-status CLI flag for manual checks
  - [ ] Unit tests for status comparison
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

</task_spec>
