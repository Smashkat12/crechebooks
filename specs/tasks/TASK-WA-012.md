<task_spec id="TASK-WA-012" version="2.0">

<metadata>
  <title>WhatsApp Conversational Onboarding Handler</title>
  <status>pending</status>
  <phase>28</phase>
  <layer>logic</layer>
  <sequence>714</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-WA-ONBOARD-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="pending">TASK-WA-011</task_ref>
    <task_ref status="complete">TASK-WA-007</task_ref>
    <task_ref status="complete">TASK-WA-009</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>8 hours</estimated_effort>
  <last_updated>2026-02-05</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  - No conversation handler to drive the multi-step onboarding flow
  - No way to process free-text responses and map them to data fields
  - No input validation for SA-specific fields (ID number, phone format)
  - No webhook integration to route onboarding messages
  - No session management (create, resume, expire)

  **Existing Resources:**
  - WhatsAppOnboardingSession model (TASK-WA-011)
  - OnboardingStepConfig and types (TASK-WA-011)
  - TwilioContentService.sendSessionQuickReply / sendSessionMessage (TASK-WA-007)
  - ButtonResponseHandler (TASK-WA-009)
  - whatsapp-webhook.controller.ts — existing webhook handler
  - Parent, Child, Enrollment services (TASK-BILL-011)

  **Gap:**
  - No OnboardingConversationHandler service
  - No step-by-step message processing logic
  - No session creation from initial "enroll" or "register" keyword
  - No data persistence into Parent/Child/Enrollment records on completion
  - No POPIA consent flow

  **Files to Create:**
  - `apps/api/src/integrations/whatsapp/handlers/onboarding-conversation.handler.ts`
  - `apps/api/src/integrations/whatsapp/handlers/onboarding-conversation.handler.spec.ts`

  **Files to Modify:**
  - `apps/api/src/integrations/whatsapp/whatsapp-webhook.controller.ts` — route to onboarding handler
  - `apps/api/src/integrations/whatsapp/whatsapp.module.ts` — register new provider
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Conversation Handler Service
  ```typescript
  // apps/api/src/integrations/whatsapp/handlers/onboarding-conversation.handler.ts

  @Injectable()
  export class OnboardingConversationHandler {
    private readonly logger = new Logger(OnboardingConversationHandler.name);

    constructor(
      private readonly prisma: PrismaService,
      private readonly contentService: TwilioContentService,
      private readonly enrollmentService: EnrollmentService,
    ) {}

    /**
     * Check if incoming message should be routed to onboarding
     */
    async shouldHandle(waId: string, tenantId: string, body: string): Promise<boolean> {
      // Check for active session
      const session = await this.prisma.whatsAppOnboardingSession.findUnique({
        where: { tenantId_waId: { tenantId, waId } },
      });

      if (session && session.status === 'IN_PROGRESS') return true;

      // Check for trigger keywords
      const triggers = ['enroll', 'register', 'sign up', 'signup', 'join'];
      return triggers.some(t => body.toLowerCase().includes(t));
    }

    /**
     * Process incoming message in onboarding context
     */
    async handleMessage(
      waId: string,
      tenantId: string,
      body: string,
      mediaUrl?: string,
    ): Promise<void> {
      let session = await this.getOrCreateSession(waId, tenantId);

      // Update last message timestamp (resets 24h window)
      await this.prisma.whatsAppOnboardingSession.update({
        where: { id: session.id },
        data: { lastMessageAt: new Date() },
      });

      // Process current step
      const stepConfig = this.getStepConfig(session.currentStep, tenantId);
      const validation = stepConfig.validation?.(body);

      if (validation && !validation.valid) {
        await this.contentService.sendSessionMessage(
          waId,
          validation.error || 'Sorry, that doesn\'t look right. Please try again.',
        );
        return;
      }

      // Store collected data
      const collectedData = session.collectedData as OnboardingCollectedData;
      this.mapInputToData(session.currentStep, body, mediaUrl, collectedData);

      // Advance to next step
      const nextStep = this.getNextStep(session.currentStep);

      if (nextStep === 'COMPLETE') {
        await this.completeOnboarding(session, collectedData, tenantId);
        return;
      }

      // Update session and send next prompt
      session = await this.prisma.whatsAppOnboardingSession.update({
        where: { id: session.id },
        data: {
          currentStep: nextStep,
          collectedData: collectedData as any,
        },
      });

      await this.sendStepPrompt(waId, nextStep, tenantId, collectedData);
    }
  }
  ```

  ### 2. Step Flow
  The conversational steps proceed in this order:
  1. **WELCOME** → Send greeting with POPIA notice, ask to continue
  2. **CONSENT** → POPIA consent (quick reply: Accept/Decline)
  3. **PARENT_NAME** → "What is your first name?"
  4. **PARENT_SURNAME** → "What is your surname?"
  5. **PARENT_EMAIL** → "What is your email address?" (validated)
  6. **PARENT_ID_NUMBER** → "What is your SA ID number?" (Luhn validated, optional: "Skip")
  7. **CHILD_NAME** → "What is your child's first name?"
  8. **CHILD_DOB** → "What is your child's date of birth? (DD/MM/YYYY)"
  9. **CHILD_ALLERGIES** → "Any allergies or medical conditions? (or type None)"
  10. **EMERGENCY_CONTACT_NAME** → "Emergency contact full name?"
  11. **EMERGENCY_CONTACT_PHONE** → "Emergency contact phone number?"
  12. **EMERGENCY_CONTACT_RELATION** → Quick reply: Parent/Grandparent/Sibling/Other
  13. **ID_DOCUMENT** → "Please take a photo of your SA ID (or Skip)"
  14. **FEE_AGREEMENT** → Show fee structure, ask for acknowledgement
  15. **COMMUNICATION_PREFS** → Quick reply: WhatsApp/Email/Both
  16. **CONFIRMATION** → Summary, quick reply: Confirm/Edit/Cancel

  ### 3. Input Validation
  ```typescript
  // SA ID number validation (Luhn algorithm)
  function validateSAID(id: string): { valid: boolean; error?: string } {
    if (id.toLowerCase() === 'skip') return { valid: true };
    if (!/^\d{13}$/.test(id)) return { valid: false, error: 'SA ID must be 13 digits.' };
    // Luhn check
    const digits = id.split('').map(Number);
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      let d = digits[i];
      if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
      sum += d;
    }
    const check = (10 - (sum % 10)) % 10;
    if (check !== digits[12]) return { valid: false, error: 'Invalid SA ID number. Please check and try again.' };
    return { valid: true };
  }

  // Email validation
  function validateEmail(email: string): { valid: boolean; error?: string } {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!re.test(email)) return { valid: false, error: 'Please enter a valid email address.' };
    return { valid: true };
  }

  // SA phone validation
  function validatePhone(phone: string): { valid: boolean; error?: string } {
    const cleaned = phone.replace(/[\s-]/g, '');
    if (!/^(\+27|0)\d{9}$/.test(cleaned)) {
      return { valid: false, error: 'Please enter a valid SA phone number (e.g., 0821234567).' };
    }
    return { valid: true };
  }

  // Date of birth validation
  function validateDOB(input: string): { valid: boolean; error?: string } {
    const match = input.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (!match) return { valid: false, error: 'Please enter date as DD/MM/YYYY.' };
    const [, day, month, year] = match.map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
      return { valid: false, error: 'Invalid date. Please enter as DD/MM/YYYY.' };
    }
    const age = (Date.now() - date.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    if (age < 0 || age > 7) return { valid: false, error: 'Child must be between 0 and 7 years old.' };
    return { valid: true };
  }
  ```

  ### 4. Onboarding Completion
  ```typescript
  private async completeOnboarding(
    session: WhatsAppOnboardingSession,
    data: OnboardingCollectedData,
    tenantId: string,
  ): Promise<void> {
    // Create Parent record
    const parent = await this.prisma.parent.create({
      data: {
        tenantId,
        firstName: data.parent.firstName,
        lastName: data.parent.surname,
        email: data.parent.email,
        phone: session.waId,
        idNumber: data.parent.idNumber !== 'skip' ? data.parent.idNumber : null,
        whatsappOptIn: data.communicationPrefs?.whatsapp ?? true,
        popiaConsent: data.popiaConsent,
        popiaConsentAt: data.popiaConsentAt ? new Date(data.popiaConsentAt) : new Date(),
      },
    });

    // Create Child record(s)
    for (const child of data.children || []) {
      await this.prisma.child.create({
        data: {
          tenantId,
          parentId: parent.id,
          firstName: child.firstName,
          dateOfBirth: new Date(child.dateOfBirth),
          allergies: child.allergies !== 'none' ? child.allergies : null,
          medicalNotes: child.medicalNotes,
        },
      });
    }

    // Create EmergencyContact
    if (data.emergencyContact) {
      await this.prisma.emergencyContact.create({
        data: {
          tenantId,
          parentId: parent.id,
          name: data.emergencyContact.name,
          phone: data.emergencyContact.phone,
          relationship: data.emergencyContact.relationship,
        },
      });
    }

    // Mark session complete
    await this.prisma.whatsAppOnboardingSession.update({
      where: { id: session.id },
      data: {
        status: 'COMPLETED',
        parentId: parent.id,
        completedAt: new Date(),
        currentStep: 'COMPLETE',
      },
    });

    // Send confirmation
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    await this.contentService.sendSessionMessage(
      session.waId,
      `Welcome to ${tenant.tradingName}! 🎉\n\n` +
      `${data.parent.firstName}, your registration is complete.\n\n` +
      `What happens next:\n` +
      `1. The creche will review your registration\n` +
      `2. You'll receive your fee structure details\n` +
      `3. Once confirmed, invoices will be sent here on WhatsApp\n\n` +
      `Questions? Just reply to this message.`,
    );

    // Notify admin
    this.logger.log(`Onboarding complete: parent=${parent.id}, tenant=${tenantId}`);
  }
  ```

  ### 5. Webhook Integration
  ```typescript
  // In whatsapp-webhook.controller.ts — add before existing message handling

  // Check if this is an onboarding conversation
  if (await this.onboardingHandler.shouldHandle(from, tenantId, body)) {
    await this.onboardingHandler.handleMessage(from, tenantId, body, mediaUrl);
    return;
  }
  ```
</critical_patterns>

<scope>
  <in_scope>
    - OnboardingConversationHandler service
    - Step-by-step message processing
    - Input validation (SA ID, email, phone, DOB)
    - Session creation from trigger keywords
    - Session resume for returning users
    - Data mapping from text to OnboardingCollectedData
    - Parent/Child/EmergencyContact creation on completion
    - Webhook routing to onboarding handler
    - Quick reply handling for structured steps
    - POPIA consent collection
    - Confirmation summary before final submission
    - Unit tests for handler and validators
  </in_scope>
  <out_of_scope>
    - Multiple children registration (TASK-WA-013)
    - ID document upload/OCR (TASK-WA-013)
    - Admin dashboard for onboarding visibility (TASK-WA-014)
    - Fee structure display from DB (uses tenant default for now)
    - Enrollment creation (admin confirms separately)
    - WhatsApp Flows (Phase 2 — future)
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Create handler
# Create apps/api/src/integrations/whatsapp/handlers/onboarding-conversation.handler.ts

# 2. Create tests
# Create apps/api/src/integrations/whatsapp/handlers/onboarding-conversation.handler.spec.ts

# 3. Update webhook controller
# Edit apps/api/src/integrations/whatsapp/whatsapp-webhook.controller.ts

# 4. Update module
# Edit apps/api/src/integrations/whatsapp/whatsapp.module.ts

# 5. Verify
pnpm run build
pnpm run lint
pnpm test --runInBand
```
</verification_commands>

<definition_of_done>
  - [ ] OnboardingConversationHandler service created
  - [ ] shouldHandle() detects trigger keywords and active sessions
  - [ ] handleMessage() processes each step correctly
  - [ ] All 16 onboarding steps implemented with prompts
  - [ ] SA ID validation with Luhn check
  - [ ] Email, phone, DOB validation
  - [ ] POPIA consent step with quick reply
  - [ ] Confirmation summary step with all collected data
  - [ ] Parent record created on completion
  - [ ] Child record created on completion
  - [ ] Emergency contact created on completion
  - [ ] Session status updated to COMPLETED
  - [ ] Webhook controller routes to onboarding handler
  - [ ] Module updated with new provider
  - [ ] Unit tests for all validators
  - [ ] Unit tests for step transitions
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

</task_spec>
