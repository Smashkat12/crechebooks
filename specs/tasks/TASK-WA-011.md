<task_spec id="TASK-WA-011" version="2.0">

<metadata>
  <title>WhatsApp Onboarding State Machine and Session Model</title>
  <status>pending</status>
  <phase>28</phase>
  <layer>foundation</layer>
  <sequence>713</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-WA-ONBOARD-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-WA-001</task_ref>
    <task_ref status="complete">TASK-WA-007</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-02-05</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  - Parent onboarding is only available via the web portal
  - Most parents prefer WhatsApp over the web app
  - No conversational onboarding flow exists
  - No way to collect parent/child data via WhatsApp
  - No state machine to track multi-step conversations

  **Existing Resources:**
  - TwilioWhatsAppService (TASK-WA-007) — Content API integration
  - TwilioContentService.sendSessionQuickReply / sendSessionMessage (TASK-WA-007)
  - ButtonResponseHandler (TASK-WA-009) — handles quick reply callbacks
  - WhatsAppMessage entity (TASK-WA-001) — message history tracking
  - Parent, Child, Enrollment Prisma models (TASK-BILL-001, TASK-BILL-002)

  **Gap:**
  - No `WhatsAppOnboardingSession` Prisma model to track conversation state
  - No state machine enum for onboarding steps
  - No types/interfaces for collected onboarding data
  - No re-engagement template for expired sessions

  **Files to Create:**
  - `apps/api/prisma/migrations/YYYYMMDDHHMMSS_add_whatsapp_onboarding_session/migration.sql`
  - `apps/api/src/integrations/whatsapp/types/onboarding.types.ts`

  **Files to Modify:**
  - `apps/api/prisma/schema.prisma` — add WhatsAppOnboardingSession model
  - `apps/api/src/integrations/whatsapp/templates/content-templates.ts` — add re-engagement template
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Prisma Model for Onboarding State
  ```prisma
  // apps/api/prisma/schema.prisma

  model WhatsAppOnboardingSession {
    id          String   @id @default(cuid())
    tenantId    String
    waId        String   // WhatsApp phone number (E.164)
    parentId    String?  // Linked after parent record is created
    currentStep OnboardingStep @default(WELCOME)
    collectedData Json   @default("{}")
    status      OnboardingStatus @default(IN_PROGRESS)
    lastMessageAt DateTime @default(now())
    startedAt   DateTime @default(now())
    completedAt DateTime?
    createdAt   DateTime @default(now())
    updatedAt   DateTime @updatedAt

    tenant Tenant @relation(fields: [tenantId], references: [id])
    parent Parent? @relation(fields: [parentId], references: [id])

    @@unique([tenantId, waId])
    @@index([tenantId, status])
    @@index([waId])
    @@map("whatsapp_onboarding_sessions")
  }

  enum OnboardingStep {
    WELCOME
    CONSENT
    PARENT_NAME
    PARENT_SURNAME
    PARENT_EMAIL
    PARENT_ID_NUMBER
    CHILD_NAME
    CHILD_DOB
    CHILD_ALLERGIES
    EMERGENCY_CONTACT_NAME
    EMERGENCY_CONTACT_PHONE
    EMERGENCY_CONTACT_RELATION
    ID_DOCUMENT
    FEE_AGREEMENT
    COMMUNICATION_PREFS
    CONFIRMATION
    COMPLETE
  }

  enum OnboardingStatus {
    IN_PROGRESS
    COMPLETED
    ABANDONED
    EXPIRED
  }
  ```

  ### 2. Onboarding Types
  ```typescript
  // apps/api/src/integrations/whatsapp/types/onboarding.types.ts

  export interface OnboardingCollectedData {
    parent?: {
      firstName?: string;
      surname?: string;
      email?: string;
      idNumber?: string;
      phone?: string;  // From waId
    };
    children?: Array<{
      firstName?: string;
      dateOfBirth?: string;  // YYYY-MM-DD
      allergies?: string;
      medicalNotes?: string;
    }>;
    emergencyContact?: {
      name?: string;
      phone?: string;
      relationship?: string;
    };
    idDocumentMediaUrl?: string;
    feeAcknowledged?: boolean;
    communicationPrefs?: {
      whatsapp?: boolean;
      email?: boolean;
    };
    popiaConsent?: boolean;
    popiaConsentAt?: string;  // ISO timestamp
  }

  export interface OnboardingStepConfig {
    step: OnboardingStep;
    message: string;
    validation?: (input: string) => { valid: boolean; error?: string };
    quickReplies?: Array<{ title: string; id: string }>;
    expectsMedia?: boolean;
    isOptional?: boolean;
  }
  ```

  ### 3. Re-engagement Template
  ```typescript
  // In content-templates.ts
  export const ONBOARDING_RESUME: ContentTemplateDefinition = {
    friendlyName: 'cb_onboarding_resume',
    language: 'en',
    category: 'UTILITY',
    variables: {
      '1': 'Sarah',
      '2': 'Little Stars Creche',
      '3': 'child details',  // current step description
    },
    types: {
      'twilio/quick-reply': {
        body: "Hi {{1}},\n\nWe noticed you started enrolling at {{2}} but didn't finish. You were on the {{3}} step.\n\nWould you like to continue where you left off?\n\nKind regards,\n{{2}} Team",
        actions: [
          { type: 'QUICK_REPLY', title: 'Continue', id: 'onboard_resume' },
          { type: 'QUICK_REPLY', title: 'Start Over', id: 'onboard_restart' },
          { type: 'QUICK_REPLY', title: 'Not Now', id: 'onboard_cancel' },
        ],
      },
    },
  };
  ```

  ### 4. Session Expiry
  - 24-hour WhatsApp session resets on each inbound message
  - If session expires mid-onboarding, use re-engagement template
  - Track `lastMessageAt` to detect stale sessions (>24h)
  - CRON job to mark sessions as EXPIRED after 7 days of inactivity

  ### 5. Tenant Isolation
  - `@@unique([tenantId, waId])` — one active session per phone per tenant
  - All queries MUST include `tenantId` filter
  - Multi-tenant: same phone can onboard at different creches
</critical_patterns>

<scope>
  <in_scope>
    - WhatsAppOnboardingSession Prisma model and migration
    - OnboardingStep and OnboardingStatus enums
    - Onboarding types/interfaces (collected data shape)
    - Step configuration with validation rules
    - Re-engagement template definition (cb_onboarding_resume)
    - Session expiry constants and helpers
  </in_scope>
  <out_of_scope>
    - Conversation handler logic (TASK-WA-012)
    - Webhook integration (TASK-WA-012)
    - Admin visibility dashboard (TASK-WA-014)
    - Multi-child flow (TASK-WA-013)
    - ID document upload handling (TASK-WA-013)
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Generate Prisma client
pnpm prisma:generate

# 2. Create migration
pnpm --filter @crechebooks/api prisma migrate dev --name add_whatsapp_onboarding_session

# 3. Verify types compile
pnpm run build

# 4. Lint check
pnpm run lint

# 5. Tests pass
pnpm test --runInBand
```
</verification_commands>

<definition_of_done>
  - [ ] WhatsAppOnboardingSession model in schema.prisma
  - [ ] OnboardingStep enum with all 17 steps
  - [ ] OnboardingStatus enum (IN_PROGRESS, COMPLETED, ABANDONED, EXPIRED)
  - [ ] Migration created and applied
  - [ ] OnboardingCollectedData interface defined
  - [ ] OnboardingStepConfig interface defined
  - [ ] Input validation functions for SA ID, email, phone, date
  - [ ] Re-engagement template (cb_onboarding_resume) defined
  - [ ] Session expiry constants (24h session, 7d abandon)
  - [ ] Tenant isolation via unique constraint
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

</task_spec>
