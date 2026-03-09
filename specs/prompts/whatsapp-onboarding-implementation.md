# WhatsApp Parent Onboarding Implementation Prompt

## Mission

Implement Phase 28: WhatsApp Parent Onboarding (TASK-WA-011 through TASK-WA-014). This adds a conversational onboarding flow via WhatsApp so parents can register their children at a creche by simply texting on WhatsApp.

## Claude-Flow v3 Bootstrap

Before ANY implementation, initialize the orchestration layer:

```
1. RESTORE SESSION MEMORY:
   npx claude-flow@alpha hooks session-restore --load-memory true

2. RETRIEVE PRIOR LEARNINGS (WhatsApp integration patterns):
   npx claude-flow@alpha hooks intelligence_pattern-search --query "whatsapp twilio content-api template session"

3. START LEARNING TRAJECTORY:
   npx claude-flow@alpha hooks intelligence_trajectory-start --trajectory "wa-onboarding-phase28"

4. STORE INITIAL CONTEXT:
   npx claude-flow@alpha memory store --key "wa-onboarding/init" --value '{"phase":28,"tasks":["WA-011","WA-012","WA-013","WA-014"],"started":"now"}'
```

## Task Dependency Chain (Strict Order)

```
TASK-WA-011 (foundation) ──→ TASK-WA-012 (logic) ──→ TASK-WA-013 (logic) ──→ TASK-WA-014 (surface)
   State Machine               Conversation Handler    Advanced Features       Admin API + Tests
   Prisma model + types        16-step flow handler    Multi-child loop         Controller + DTOs
   Re-engagement template      Input validation        Media upload             E2E tests
   Enums + interfaces          Webhook routing         CRON expiry job          Admin notification
```

**Do NOT skip ahead.** Each task depends on the output of the previous one.

## Detailed Task Specs

Read the full task specs before starting each task:
- `specs/tasks/TASK-WA-011.md` — State Machine and Session Model
- `specs/tasks/TASK-WA-012.md` — Conversational Onboarding Handler
- `specs/tasks/TASK-WA-013.md` — Advanced Features (multi-child, media, CRON)
- `specs/tasks/TASK-WA-014.md` — Admin Visibility and Tests

## Critical Codebase Context

### Existing WhatsApp Architecture (DO NOT recreate)
```
apps/api/src/integrations/whatsapp/
├── services/
│   ├── twilio-content.service.ts    ← TwilioContentService (sendSessionMessage, sendSessionQuickReply, sendListPicker)
│   ├── twilio-whatsapp.service.ts   ← TwilioWhatsAppService (sendRichInvoiceNotification, etc.)
│   ├── template.service.ts          ← WhatsAppTemplateService
│   ├── retry.service.ts             ← WhatsAppRetryService
│   ├── whatsapp-provider.service.ts ← WhatsAppProviderService
│   └── document-url.service.ts      ← DocumentUrlService (JWT-signed URLs)
├── handlers/
│   ├── button-response.handler.ts   ← ButtonResponseHandler (handlePayNow, handleExtensionRequest, etc.)
│   └── session-interactive.handler.ts ← SessionInteractiveHandler (list pickers, help menu)
├── templates/
│   └── content-templates.ts         ← 9 template definitions (all pending WhatsApp approval)
├── types/
│   ├── whatsapp.types.ts
│   ├── content.types.ts             ← ContentTemplateDefinition interface
│   ├── button.types.ts
│   ├── session.types.ts
│   ├── template.types.ts
│   └── message-history.types.ts
├── whatsapp.module.ts               ← Module registration (add new providers here)
└── whatsapp.service.ts              ← High-level WhatsApp service
```

### Webhook Entry Point
The WhatsApp webhook controller is at:
- `apps/api/src/api/whatsapp/whatsapp.controller.ts`
- `apps/api/src/webhooks/webhook.controller.ts`

### Schema Reality Check (IMPORTANT)
The task specs assumed a separate `EmergencyContact` model. The actual Prisma schema stores emergency contact info DIRECTLY on the `Child` model:

```prisma
model Child {
  // ... standard fields ...
  emergencyContact String?   @map("emergency_contact") @db.VarChar(200)
  emergencyPhone   String?   @map("emergency_phone") @db.VarChar(20)
}
```

There is NO separate EmergencyContact table. Adapt TASK-WA-012/013 accordingly — store emergency contact data on the Child record instead of creating a separate entity.

Similarly, the `Parent` model has these relevant fields:
```prisma
model Parent {
  firstName     String    @map("first_name") @db.VarChar(100)
  lastName      String    @map("last_name") @db.VarChar(100)
  email         String?   @db.VarChar(255)
  phone         String?   @db.VarChar(20)
  whatsapp      String?   @db.VarChar(20)
  whatsappOptIn Boolean   @default(false) @map("whatsapp_opt_in")
  idNumber      String?   @map("id_number") @db.VarChar(20)
  // ...
}
```

The `Child` model also requires `lastName` — collect it during onboarding or default to the parent's surname.

### Module Registration Pattern
When adding new providers, follow the existing pattern in `whatsapp.module.ts`:
1. Import the class
2. Add to `providers` array
3. Add to `exports` array if used by other modules

## Implementation Instructions Per Task

### TASK-WA-011: State Machine (Foundation)

**Coordination:**
```bash
npx claude-flow@alpha hooks pre-task --description "TASK-WA-011: WhatsApp Onboarding State Machine"
```

**Steps:**
1. Read `specs/tasks/TASK-WA-011.md` fully
2. Add `WhatsAppOnboardingSession` model to `apps/api/prisma/schema.prisma`
   - Include `OnboardingStep` enum and `OnboardingStatus` enum
   - Add relation to `Tenant` and `Parent` models
   - Add `@@unique([tenantId, waId])` constraint
3. Run `pnpm --filter @crechebooks/api prisma migrate dev --name add_whatsapp_onboarding_session`
4. Create `apps/api/src/integrations/whatsapp/types/onboarding.types.ts`
   - `OnboardingCollectedData` interface
   - `OnboardingStepConfig` interface
   - Validation function signatures
5. Add re-engagement template `cb_onboarding_resume` to `content-templates.ts`
6. Run `pnpm run build && pnpm run lint`

**Memory checkpoint:**
```bash
npx claude-flow@alpha hooks post-edit --file "schema.prisma" --memory-key "wa-onboarding/wa-011/schema"
npx claude-flow@alpha hooks post-edit --file "onboarding.types.ts" --memory-key "wa-onboarding/wa-011/types"
npx claude-flow@alpha hooks post-task --task-id "TASK-WA-011" --analyze-performance true
```

### TASK-WA-012: Conversation Handler (Core Logic)

**Coordination:**
```bash
npx claude-flow@alpha hooks pre-task --description "TASK-WA-012: Conversational Onboarding Handler"
npx claude-flow@alpha hooks intelligence_trajectory-step --step "wa-012-handler" --context "building conversation state machine handler"
```

**Steps:**
1. Read `specs/tasks/TASK-WA-012.md` fully
2. Create `apps/api/src/integrations/whatsapp/handlers/onboarding-conversation.handler.ts`
   - `shouldHandle()` — detect trigger keywords and active sessions
   - `handleMessage()` — process current step, validate input, advance state
   - `getStepConfig()` — return prompt text and validation for each step
   - `mapInputToData()` — store text responses into OnboardingCollectedData
   - `completeOnboarding()` — create Parent + Child records, send confirmation
   - All validation functions: SA ID (Luhn), email, phone, DOB
3. Route webhook to onboarding handler:
   - Find the webhook controller that processes incoming WhatsApp messages
   - Add `shouldHandle()` check before existing message processing
4. Register `OnboardingConversationHandler` in `whatsapp.module.ts`
5. Create unit tests in `__tests__/onboarding-conversation.handler.spec.ts`
6. Run `pnpm run build && pnpm run lint && pnpm test --runInBand`

**Critical details:**
- Use `TwilioContentService.sendSessionMessage()` for text prompts
- Use `TwilioContentService.sendSessionQuickReply()` for button steps (consent, relationship, prefs, confirmation)
- Emergency contact goes on Child model: `child.emergencyContact`, `child.emergencyPhone`
- Trigger keywords: "enroll", "register", "sign up", "signup", "join"
- ALL messages must use `tenant.tradingName` — never hardcode "CrecheBooks"
- Child requires `lastName` — default to parent's surname

**Memory checkpoint:**
```bash
npx claude-flow@alpha hooks post-edit --file "onboarding-conversation.handler.ts" --memory-key "wa-onboarding/wa-012/handler"
npx claude-flow@alpha hooks notification --message "WA-012 handler created with 16-step flow" --telemetry true
npx claude-flow@alpha hooks post-task --task-id "TASK-WA-012" --analyze-performance true
```

### TASK-WA-013: Advanced Features

**Coordination:**
```bash
npx claude-flow@alpha hooks pre-task --description "TASK-WA-013: Multi-child, media upload, CRON expiry"
```

**Steps:**
1. Read `specs/tasks/TASK-WA-013.md` fully
2. Add `CHILD_ANOTHER` step to `OnboardingStep` enum in schema
3. Extend handler with multi-child loop ("Add Another Child" / "Continue" quick reply)
4. Add media message handling for ID document photos (image content type check)
5. Create `apps/api/src/integrations/whatsapp/jobs/onboarding-expiry.job.ts`
   - CRON every hour: find stale sessions (>24h), send re-engagement template
   - Mark as ABANDONED after 7 days
6. Add progress indicators at key milestones
7. Add edit flow from confirmation step (list picker: Parent / Child / Emergency)
8. Register CRON job in module
9. Run `pnpm run build && pnpm run lint && pnpm test --runInBand`

**Memory checkpoint:**
```bash
npx claude-flow@alpha hooks post-edit --file "onboarding-expiry.job.ts" --memory-key "wa-onboarding/wa-013/cron"
npx claude-flow@alpha hooks post-task --task-id "TASK-WA-013" --analyze-performance true
```

### TASK-WA-014: Admin API + Tests

**Coordination:**
```bash
npx claude-flow@alpha hooks pre-task --description "TASK-WA-014: Admin onboarding visibility, E2E tests"
```

**Steps:**
1. Read `specs/tasks/TASK-WA-014.md` fully
2. Create `apps/api/src/integrations/whatsapp/dto/onboarding.dto.ts`
3. Create `apps/api/src/integrations/whatsapp/controllers/onboarding.controller.ts`
   - `GET /whatsapp/onboarding` — list sessions (filter by status, pagination)
   - `GET /whatsapp/onboarding/stats` — dashboard stats with conversion rate
   - `GET /whatsapp/onboarding/:id` — session detail with collected data
   - `POST /whatsapp/onboarding/:id/enroll` — convert to enrollment
   - All endpoints must be behind `JwtAuthGuard` + tenant-scoped
4. Add admin email notification in `completeOnboarding()` (notify ADMIN/OWNER users)
5. Register controller in module
6. Create E2E test: `apps/api/test/whatsapp-onboarding.e2e-spec.ts`
   - Full 16-step flow
   - Validation edge cases (invalid SA ID, bad email, future DOB)
   - Multi-child flow
   - Session resume after expiry
7. Run full verification: `pnpm run build && pnpm run lint && pnpm test --runInBand`

**Final memory:**
```bash
npx claude-flow@alpha hooks post-task --task-id "TASK-WA-014" --analyze-performance true
npx claude-flow@alpha hooks intelligence_trajectory-end --trajectory "wa-onboarding-phase28"
npx claude-flow@alpha hooks intelligence_pattern-store --pattern "whatsapp-onboarding-state-machine" --context "Multi-step WhatsApp conversation using session model with step enum, collected data JSON, and 24h session window management"
npx claude-flow@alpha hooks session-end --export-metrics true --generate-summary true
npx claude-flow@alpha memory store --key "wa-onboarding/complete" --value '{"tasks":["WA-011","WA-012","WA-013","WA-014"],"status":"complete"}'
```

## Quality Gates (Run After EACH Task)

```bash
pnpm prisma:generate          # Regenerate Prisma client
pnpm run build                # TypeScript compilation — 0 errors
pnpm run lint                 # ESLint — 0 errors
pnpm test --runInBand         # Unit tests pass
```

## Domain Rules (MANDATORY)

- **Currency**: ZAR stored as integer cents
- **Tenant Isolation**: ALL queries scoped to `tenantId`
- **POPIA**: Consent must be collected and timestamped before storing personal data
- **SA ID**: 13-digit Luhn-validated, optional field
- **Phone**: SA format `+27XXXXXXXXX` or `0XXXXXXXXX`
- **DOB**: Children must be age 0–7 for creche enrollment
- **Tenant Branding**: Always use `tenant.tradingName` — NEVER hardcode "CrecheBooks"
- **Audit**: Log onboarding events (start, complete, abandon) with timestamps

## Anti-Patterns (DO NOT)

- Do NOT create a separate EmergencyContact Prisma model — use Child.emergencyContact/emergencyPhone
- Do NOT hardcode tenant names in messages
- Do NOT skip POPIA consent — it must be the first interactive step
- Do NOT send approved templates for session-only interactions (quick replies in-session don't need approval)
- Do NOT create files outside `apps/api/src/integrations/whatsapp/` except for Prisma schema and E2E tests
- Do NOT modify existing template definitions in content-templates.ts (they're pending approval) — only ADD the new `cb_onboarding_resume` template
- Do NOT over-engineer — this is Phase 1 conversational, not WhatsApp Flows (Phase 2)
