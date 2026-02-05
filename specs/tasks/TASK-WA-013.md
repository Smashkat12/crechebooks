<task_spec id="TASK-WA-013" version="2.0">

<metadata>
  <title>WhatsApp Onboarding Advanced Features</title>
  <status>pending</status>
  <phase>28</phase>
  <layer>logic</layer>
  <sequence>715</sequence>
  <priority>P2-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-WA-ONBOARD-003</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="pending">TASK-WA-012</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-02-05</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  - Basic onboarding flow (TASK-WA-012) only supports one child per session
  - ID document upload is basic (no OCR/validation)
  - No session expiry handling with re-engagement
  - No ability to edit previously entered data
  - No abandoned session recovery CRON job

  **Existing Resources:**
  - OnboardingConversationHandler (TASK-WA-012)
  - WhatsAppOnboardingSession model (TASK-WA-011)
  - Re-engagement template cb_onboarding_resume (TASK-WA-011)
  - TwilioContentService media sending (TASK-WA-007)

  **Gap:**
  - No "Register another child?" loop after first child completion
  - No media message handling for ID document photos
  - No CRON job for session expiry and re-engagement
  - No edit flow ("Go back to step X")
  - No progress indicator messages

  **Files to Create:**
  - `apps/api/src/integrations/whatsapp/jobs/onboarding-expiry.job.ts`
  - `apps/api/src/integrations/whatsapp/handlers/onboarding-conversation.handler.spec.ts` (extend)

  **Files to Modify:**
  - `apps/api/src/integrations/whatsapp/handlers/onboarding-conversation.handler.ts` — add multi-child, media, edit flows
  - `apps/api/src/integrations/whatsapp/whatsapp.module.ts` — register CRON job
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Multi-Child Registration
  ```typescript
  // After CHILD_ALLERGIES step, ask if they want to register another child
  // Add a step: CHILD_ANOTHER (quick reply: "Add Another Child" / "Continue")

  private getNextStep(current: OnboardingStep, input?: string): OnboardingStep {
    if (current === 'CHILD_ALLERGIES') return 'CHILD_ANOTHER';
    if (current === 'CHILD_ANOTHER') {
      if (input === 'add_another') return 'CHILD_NAME';  // Loop back
      return 'EMERGENCY_CONTACT_NAME';  // Continue
    }
    // ... rest of step progression
  }
  ```

  ### 2. Media Message Handling (ID Document)
  ```typescript
  // At ID_DOCUMENT step, accept photo or "Skip"
  async handleMediaMessage(
    waId: string,
    tenantId: string,
    mediaUrl: string,
    mediaContentType: string,
  ): Promise<void> {
    const session = await this.getActiveSession(waId, tenantId);
    if (!session || session.currentStep !== 'ID_DOCUMENT') return;

    // Validate it's an image
    if (!mediaContentType.startsWith('image/')) {
      await this.contentService.sendSessionMessage(
        waId,
        'Please send a photo of your ID document, or type "Skip" to continue without it.',
      );
      return;
    }

    // Store media URL in collected data
    const data = session.collectedData as OnboardingCollectedData;
    data.idDocumentMediaUrl = mediaUrl;

    await this.prisma.whatsAppOnboardingSession.update({
      where: { id: session.id },
      data: { collectedData: data as any },
    });

    await this.contentService.sendSessionMessage(
      waId,
      'ID document received. The creche will verify it during registration review.',
    );

    // Advance to next step
    await this.advanceToStep(session, 'FEE_AGREEMENT', waId, tenantId);
  }
  ```

  ### 3. Session Expiry CRON Job
  ```typescript
  // apps/api/src/integrations/whatsapp/jobs/onboarding-expiry.job.ts

  @Injectable()
  export class OnboardingExpiryJob {
    private readonly logger = new Logger(OnboardingExpiryJob.name);

    constructor(
      private readonly prisma: PrismaService,
      private readonly whatsappService: TwilioWhatsAppService,
    ) {}

    /**
     * Run every hour: find stale sessions and send re-engagement
     */
    @Cron('0 * * * *')  // Every hour
    async handleExpiredSessions(): Promise<void> {
      const staleThreshold = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h
      const abandonThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // 7d

      // Mark 7-day-old sessions as abandoned
      await this.prisma.whatsAppOnboardingSession.updateMany({
        where: {
          status: 'IN_PROGRESS',
          lastMessageAt: { lt: abandonThreshold },
        },
        data: { status: 'ABANDONED' },
      });

      // Send re-engagement for 24h-stale sessions (only once)
      const staleSessions = await this.prisma.whatsAppOnboardingSession.findMany({
        where: {
          status: 'IN_PROGRESS',
          lastMessageAt: { lt: staleThreshold, gt: abandonThreshold },
        },
        include: { tenant: true },
      });

      for (const session of staleSessions) {
        const data = session.collectedData as OnboardingCollectedData;
        const firstName = data.parent?.firstName || 'there';
        const stepLabel = this.stepToFriendlyLabel(session.currentStep);

        try {
          await this.whatsappService.sendTemplateMessage(
            session.waId,
            'cb_onboarding_resume',
            { '1': firstName, '2': session.tenant.tradingName, '3': stepLabel },
          );
        } catch (error) {
          this.logger.warn(`Failed to send re-engagement to ${session.waId}: ${error.message}`);
        }
      }
    }

    private stepToFriendlyLabel(step: OnboardingStep): string {
      const labels: Record<string, string> = {
        PARENT_NAME: 'your details',
        PARENT_SURNAME: 'your details',
        PARENT_EMAIL: 'your details',
        PARENT_ID_NUMBER: 'your details',
        CHILD_NAME: 'child details',
        CHILD_DOB: 'child details',
        CHILD_ALLERGIES: 'child details',
        EMERGENCY_CONTACT_NAME: 'emergency contact',
        EMERGENCY_CONTACT_PHONE: 'emergency contact',
        EMERGENCY_CONTACT_RELATION: 'emergency contact',
        ID_DOCUMENT: 'ID verification',
        FEE_AGREEMENT: 'fee agreement',
        COMMUNICATION_PREFS: 'preferences',
        CONFIRMATION: 'final confirmation',
      };
      return labels[step] || 'registration';
    }
  }
  ```

  ### 4. Progress Indicator
  ```typescript
  // Send progress at key milestones
  private async sendProgress(waId: string, step: OnboardingStep): Promise<void> {
    const progress: Record<string, string> = {
      CHILD_NAME: '📋 Step 2 of 5: Child Details',
      EMERGENCY_CONTACT_NAME: '📋 Step 3 of 5: Emergency Contact',
      ID_DOCUMENT: '📋 Step 4 of 5: Verification',
      FEE_AGREEMENT: '📋 Step 5 of 5: Fee Agreement',
    };
    if (progress[step]) {
      await this.contentService.sendSessionMessage(waId, progress[step]);
    }
  }
  ```

  ### 5. Edit Flow
  At CONFIRMATION step, if user taps "Edit", present a list picker with sections:
  - "Parent Details" → returns to PARENT_NAME
  - "Child Details" → returns to CHILD_NAME
  - "Emergency Contact" → returns to EMERGENCY_CONTACT_NAME
  - "Continue" → returns to CONFIRMATION
</critical_patterns>

<scope>
  <in_scope>
    - Multi-child registration loop ("Add Another Child" quick reply)
    - Media message handling for ID document photo
    - Session expiry CRON job (hourly check)
    - Re-engagement message for stale sessions
    - Abandoned session marking (7-day threshold)
    - Progress indicator messages at milestones
    - Edit flow from confirmation step
    - Quick reply handling for resume/restart/cancel
  </in_scope>
  <out_of_scope>
    - ID document OCR extraction (manual admin review)
    - Admin onboarding dashboard (TASK-WA-014)
    - WhatsApp Flows (Phase 2 — future)
    - Payment processing during onboarding
    - Enrollment auto-creation (admin confirms)
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Update handler with multi-child and media support
# Edit apps/api/src/integrations/whatsapp/handlers/onboarding-conversation.handler.ts

# 2. Create CRON job
# Create apps/api/src/integrations/whatsapp/jobs/onboarding-expiry.job.ts

# 3. Update module
# Edit apps/api/src/integrations/whatsapp/whatsapp.module.ts

# 4. Verify
pnpm run build
pnpm run lint
pnpm test --runInBand
```
</verification_commands>

<definition_of_done>
  - [ ] Multi-child loop with "Add Another Child" quick reply
  - [ ] CHILD_ANOTHER step added to OnboardingStep enum
  - [ ] Media message handling for ID document photos
  - [ ] Image content type validation
  - [ ] OnboardingExpiryJob CRON service created
  - [ ] 24-hour re-engagement messages sent to stale sessions
  - [ ] 7-day abandoned session marking
  - [ ] Progress indicators at 5 key milestones
  - [ ] Edit flow from confirmation (list picker with 3 sections)
  - [ ] Resume/restart/cancel quick reply handlers
  - [ ] Unit tests for multi-child flow
  - [ ] Unit tests for media handling
  - [ ] Unit tests for expiry job
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

</task_spec>
