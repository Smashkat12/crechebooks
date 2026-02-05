<task_spec id="TASK-WA-007" version="2.0">

<metadata>
  <title>Twilio Content API Integration Service</title>
  <status>complete</status>
  <phase>26</phase>
  <layer>logic</layer>
  <sequence>267</sequence>
  <priority>P1-HIGH</priority>
  <implements>
    <requirement_ref>REQ-WA-RICH-001</requirement_ref>
    <requirement_ref>REQ-WA-TEMPLATES-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-WA-001</task_ref>
    <task_ref status="complete">TASK-WA-002</task_ref>
    <task_ref status="complete">TASK-WA-006</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-02-05</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  - Current WhatsApp templates are text-only
  - No rich interactive elements (buttons, cards, carousels)
  - Templates not utilizing Twilio Content API
  - No PDF attachments in template messages
  - Parents cannot take quick actions from messages

  **Existing Resources:**
  - TwilioWhatsAppService - Basic Twilio messaging (552 lines)
  - WhatsAppTemplateService - Text template management (595 lines)
  - WhatsAppProviderService - Provider facade (374 lines)
  - WhatsAppMessage entity - Message tracking

  **Gap:**
  - No Twilio Content API integration
  - No rich content types (card, quick-reply, call-to-action)
  - Templates hardcode "CrecheBooks" instead of tenant name
  - No content template registration/management
  - No approval status tracking

  **Files to Create:**
  - `apps/api/src/integrations/whatsapp/services/twilio-content.service.ts`
  - `apps/api/src/integrations/whatsapp/templates/content-templates.ts`
  - `apps/api/src/integrations/whatsapp/types/content.types.ts`
  - `apps/api/src/scripts/register-whatsapp-templates.ts`

  **Files to Modify:**
  - `apps/api/src/integrations/whatsapp/whatsapp.module.ts` (add TwilioContentService)
  - `apps/api/src/integrations/whatsapp/services/twilio-whatsapp.service.ts` (use content API)
  - `apps/api/prisma/schema.prisma` (add WhatsAppContentTemplate model)
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Tenant Branding - CRITICAL
  All templates MUST use tenant-specific data, NOT "CrecheBooks":
  ```typescript
  // CORRECT - Use tenant data
  variables: {
    '1': tenant.tradingName,  // "Little Stars Creche"
    '2': tenant.phone,        // "+27600188230"
    '3': tenant.email,        // "info@littlestars.co.za"
  }

  // WRONG - Never hardcode CrecheBooks
  variables: {
    '1': 'CrecheBooks',  // ❌ NEVER DO THIS
  }
  ```

  ### 3. Content Types
  ```typescript
  // apps/api/src/integrations/whatsapp/types/content.types.ts

  export type TwilioContentType =
    | 'twilio/text'
    | 'twilio/media'
    | 'twilio/quick-reply'
    | 'twilio/call-to-action'
    | 'twilio/card'
    | 'twilio/list-picker'
    | 'twilio/carousel';

  export interface ContentTemplateDefinition {
    friendlyName: string;
    language: string;
    category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
    variables: Record<string, string>;
    types: Record<string, unknown>;
  }

  export interface QuickReplyAction {
    type: 'QUICK_REPLY';
    title: string;  // Max 20 chars
    id: string;     // Max 200 chars
  }

  export interface UrlAction {
    type: 'URL';
    title: string;  // Max 25 chars
    url: string;    // Must be HTTPS, can have {{variables}}
  }

  export interface PhoneAction {
    type: 'PHONE_NUMBER';
    title: string;  // Max 20 chars
    phone: string;  // E.164 format
  }

  export interface CardContent {
    title?: string;     // Max 1024 chars
    subtitle?: string;  // Max 60 chars
    body?: string;      // Max 1600 chars
    media?: string[];   // Image/document URLs
    actions?: (QuickReplyAction | UrlAction | PhoneAction)[];
  }
  ```

  ### 4. TwilioContentService
  ```typescript
  // apps/api/src/integrations/whatsapp/services/twilio-content.service.ts

  import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
  import { ConfigService } from '@nestjs/config';
  import Twilio from 'twilio';
  import { PrismaService } from '../../../database/prisma.service';

  @Injectable()
  export class TwilioContentService implements OnModuleInit {
    private readonly logger = new Logger(TwilioContentService.name);
    private client: Twilio.Twilio;
    private templateCache: Map<string, ContentTemplate> = new Map();

    constructor(
      private readonly configService: ConfigService,
      private readonly prisma: PrismaService,
    ) {}

    async onModuleInit() {
      const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
      const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

      if (accountSid && authToken) {
        this.client = Twilio(accountSid, authToken);
        await this.loadTemplates();
      }
    }

    /**
     * Load templates from Twilio and cache locally
     */
    async loadTemplates(): Promise<void> {
      const contents = await this.client.content.v1.contents.list({ limit: 100 });

      for (const content of contents) {
        this.templateCache.set(content.friendlyName, {
          sid: content.sid,
          friendlyName: content.friendlyName,
          language: content.language,
          variables: content.variables as Record<string, string>,
          types: content.types as Record<string, unknown>,
        });
      }

      this.logger.log(`Loaded ${this.templateCache.size} content templates`);
    }

    /**
     * Send message using content template with tenant-specific variables
     */
    async sendContentMessage(
      to: string,
      contentSid: string,
      variables: Array<{ key: string; value: string }>,
    ): Promise<string> {
      const fromNumber = this.configService.get<string>('TWILIO_WHATSAPP_NUMBER');
      const statusCallback = this.configService.get<string>('TWILIO_STATUS_CALLBACK_URL');

      // Convert array to Twilio format
      const contentVariables: Record<string, string> = {};
      variables.forEach((v, index) => {
        contentVariables[(index + 1).toString()] = v.value;
      });

      const message = await this.client.messages.create({
        to: `whatsapp:${to}`,
        from: `whatsapp:${fromNumber}`,
        contentSid,
        contentVariables: JSON.stringify(contentVariables),
        statusCallback,
      });

      return message.sid;
    }

    /**
     * Send session message with interactive elements (no approval needed)
     * Max 3 quick reply buttons in session
     */
    async sendSessionQuickReply(
      to: string,
      body: string,
      buttons: Array<{ title: string; id: string }>,
    ): Promise<string> {
      if (buttons.length > 3) {
        throw new Error('Session messages support max 3 quick reply buttons');
      }

      // Create temporary content for session
      const tempContent = await this.client.content.v1.contents.create({
        friendlyName: `session_${Date.now()}`,
        language: 'en',
        variables: {},
        types: {
          'twilio/quick-reply': {
            body,
            actions: buttons.map(b => ({
              type: 'QUICK_REPLY',
              title: b.title.substring(0, 20),
              id: b.id,
            })),
          },
        },
      });

      return this.sendContentMessage(to, tempContent.sid, []);
    }

    /**
     * Send list picker (session only - cannot be approved)
     */
    async sendListPicker(
      to: string,
      body: string,
      buttonText: string,
      items: Array<{ item: string; id: string; description?: string }>,
    ): Promise<string> {
      const listContent = await this.client.content.v1.contents.create({
        friendlyName: `list_${Date.now()}`,
        language: 'en',
        variables: {},
        types: {
          'twilio/list-picker': {
            body,
            button: buttonText.substring(0, 20),
            items: items.slice(0, 10).map(i => ({
              item: i.item.substring(0, 24),
              id: i.id.substring(0, 200),
              description: i.description?.substring(0, 72),
            })),
          },
        },
      });

      return this.sendContentMessage(to, listContent.sid, []);
    }

    /**
     * Get template by friendly name
     */
    getTemplate(friendlyName: string): ContentTemplate | undefined {
      return this.templateCache.get(friendlyName);
    }

    /**
     * Submit template for WhatsApp approval
     */
    async submitForApproval(contentSid: string, category: string): Promise<void> {
      await this.client.content.v1
        .contents(contentSid)
        .approvalRequests.whatsapp.create({ name: category, category });
    }
  }
  ```

  ### 5. Prisma Schema Update
  ```prisma
  // Add to apps/api/prisma/schema.prisma

  model WhatsAppContentTemplate {
    id              String    @id @default(uuid())
    tenantId        String?   @map("tenant_id")
    friendlyName    String    @unique @map("friendly_name")
    contentSid      String    @map("content_sid")
    language        String    @default("en")
    category        String    @default("UTILITY")
    contentType     String    @map("content_type")
    approvalStatus  String?   @map("approval_status")
    variables       Json?
    createdAt       DateTime  @default(now()) @map("created_at")
    updatedAt       DateTime  @updatedAt @map("updated_at")
    approvedAt      DateTime? @map("approved_at")

    tenant Tenant? @relation(fields: [tenantId], references: [id])

    @@map("whatsapp_content_templates")
    @@index([tenantId])
    @@index([approvalStatus])
  }
  ```

  ### 6. Test Commands
  ```bash
  pnpm run build          # Must have 0 errors
  pnpm run lint           # Must have 0 errors/warnings
  pnpm test --runInBand   # REQUIRED flag
  ```
</critical_patterns>

<context>
This task integrates Twilio Content API to enable rich WhatsApp templates with:
- Cards with media headers (PDF invoices, receipts)
- Quick reply buttons (Pay Now, Contact Us, Request Extension)
- Call-to-action buttons (URL + Phone)
- List pickers for interactive menus (session only)

**Business Impact:**
- Improved parent engagement through interactive messages
- Faster payment collection with one-tap "Pay Now" buttons
- Reduced support calls with self-service options
- Professional, branded communications for each creche

**Tenant Branding:**
All messages are sent on behalf of individual creches (tenants), not CrecheBooks.
Parents receive messages from "Little Stars Creche" not "CrecheBooks".

**Content Type Limits:**
- Quick Reply: 10 buttons (approved), 3 buttons (session)
- Call-to-Action: 2 buttons max (1 URL + 1 Phone)
- List Picker: 10 items max (session only, cannot be approved)
- Card: 10 buttons, 2 URL buttons max
- Body text: 1,024 chars (template), 1,600 chars (card)
</context>

<scope>
  <in_scope>
    - TwilioContentService with Content API integration
    - Content type definitions and interfaces
    - Template registration and caching
    - Session message helpers (quick reply, list picker)
    - Database model for template tracking
    - Template approval submission
    - Unit tests for service
  </in_scope>
  <out_of_scope>
    - Template content definitions (TASK-WA-008)
    - Button response handlers (TASK-WA-009)
    - Session interactive features (TASK-WA-010)
    - Frontend template management UI
    - Template analytics/reporting
  </out_of_scope>
</scope>

<verification_commands>
## Execution Order

```bash
# 1. Create types
# Create apps/api/src/integrations/whatsapp/types/content.types.ts

# 2. Update Prisma schema
# Add WhatsAppContentTemplate model

# 3. Create migration
cd apps/api
npx prisma migrate dev --name add_whatsapp_content_templates

# 4. Create TwilioContentService
# Create apps/api/src/integrations/whatsapp/services/twilio-content.service.ts

# 5. Update WhatsApp module
# Edit apps/api/src/integrations/whatsapp/whatsapp.module.ts

# 6. Create tests
# Create apps/api/tests/integrations/whatsapp/twilio-content.service.spec.ts

# 7. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  - [ ] Content types defined in types/content.types.ts
  - [ ] WhatsAppContentTemplate model added to Prisma schema
  - [ ] Migration created and applied
  - [ ] TwilioContentService with sendContentMessage, sendSessionQuickReply, sendListPicker
  - [ ] Template caching on module init
  - [ ] Template approval submission method
  - [ ] Session message helpers respect limits (3 buttons, 10 list items)
  - [ ] Unit tests for all service methods (90%+ coverage)
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Hardcode "CrecheBooks" in any template - use tenant.tradingName
  - Exceed content type limits (buttons, characters)
  - Store Twilio credentials in code
  - Skip signature verification for webhooks
  - Create templates without sample variables
  - Try to approve list-picker templates (session only)
</anti_patterns>

</task_spec>
