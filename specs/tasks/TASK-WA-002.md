<task_spec id="TASK-WA-002" version="2.0">

<metadata>
  <title>WhatsApp Template Management Service</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>261</sequence>
  <implements>
    <requirement_ref>REQ-WA-TEMPLATE-001</requirement_ref>
    <requirement_ref>REQ-WA-TEMPLATE-002</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-INT-005</task_ref>
    <task_ref status="pending">TASK-WA-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-01-20</last_updated>
</metadata>

<!-- ============================================ -->
<!-- CRITICAL CONTEXT FOR AI AGENT               -->
<!-- ============================================ -->

<project_state>
  ## Current State

  **Files to Create:**
  - `apps/api/src/integrations/whatsapp/whatsapp-template.service.ts` (NEW)
  - `apps/api/src/integrations/whatsapp/dto/whatsapp-template.dto.ts` (NEW)
  - `apps/api/tests/integrations/whatsapp/whatsapp-template.service.spec.ts` (NEW)

  **Files to Modify:**
  - `apps/api/src/integrations/whatsapp/whatsapp.module.ts` (add service)
  - `apps/api/src/integrations/whatsapp/whatsapp.service.ts` (use template service)
  - `apps/api/src/integrations/whatsapp/types/whatsapp.types.ts` (add template types)

  **Current Problem:**
  - Template names are hardcoded in WhatsAppService
  - No validation that templates exist in Meta Business Manager
  - No ability to list or manage templates
  - Template parameters are not validated before sending
  - No caching of template metadata

  **Existing Templates in Code:**
  - `invoice_notification`
  - `invoice_reminder`
  - `payment_received`
  - `arrears_notice`
  - `registration_welcome`

  **Test Count:** 400+ tests passing
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS - MUST FOLLOW EXACTLY

  ### 1. Package Manager
  Use `pnpm` NOT `npm`. All commands: `pnpm run build`, `pnpm test`, etc.

  ### 2. Template Service Pattern
  ```typescript
  @Injectable()
  export class WhatsAppTemplateService {
    private readonly logger = new Logger(WhatsAppTemplateService.name);
    private templateCache: Map<string, WhatsAppTemplate> = new Map();
    private cacheExpiry: Date | null = null;
    private readonly CACHE_TTL_MS = 3600000; // 1 hour

    constructor(
      private readonly configService: ConfigService,
      private readonly httpService: HttpService,
    ) {}

    /**
     * Get all approved templates from Meta
     */
    async getTemplates(tenantId: string): Promise<WhatsAppTemplate[]> {
      if (this.isCacheValid()) {
        return Array.from(this.templateCache.values());
      }

      const config = await this.getConfig(tenantId);
      const response = await this.httpService.axiosRef.get(
        `https://graph.facebook.com/v18.0/${config.businessAccountId}/message_templates`,
        {
          headers: { Authorization: `Bearer ${config.accessToken}` },
          params: { status: 'APPROVED' },
        },
      );

      const templates = response.data.data as WhatsAppTemplate[];
      this.updateCache(templates);
      return templates;
    }

    /**
     * Validate template exists and has correct parameters
     */
    async validateTemplate(
      tenantId: string,
      templateName: string,
      params: Record<string, string>,
    ): Promise<TemplateValidationResult> {
      const templates = await this.getTemplates(tenantId);
      const template = templates.find(t => t.name === templateName);

      if (!template) {
        return { valid: false, error: `Template '${templateName}' not found` };
      }

      const requiredParams = this.extractRequiredParams(template);
      const missingParams = requiredParams.filter(p => !params[p]);

      if (missingParams.length > 0) {
        return {
          valid: false,
          error: `Missing parameters: ${missingParams.join(', ')}`,
        };
      }

      return { valid: true };
    }

    /**
     * Build template message payload for Meta API
     */
    buildTemplateMessage(
      templateName: string,
      language: string,
      params: Record<string, string>,
    ): WhatsAppTemplatePayload {
      return {
        name: templateName,
        language: { code: language },
        components: [
          {
            type: 'body',
            parameters: Object.values(params).map(value => ({
              type: 'text',
              text: value,
            })),
          },
        ],
      };
    }
  }
  ```

  ### 3. Template Types
  ```typescript
  export interface WhatsAppTemplate {
    id: string;
    name: string;
    language: string;
    status: 'APPROVED' | 'PENDING' | 'REJECTED';
    category: 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';
    components: WhatsAppTemplateComponent[];
  }

  export interface WhatsAppTemplateComponent {
    type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
    format?: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'VIDEO';
    text?: string;
    example?: { body_text?: string[][] };
  }

  export interface WhatsAppTemplatePayload {
    name: string;
    language: { code: string };
    components: Array<{
      type: string;
      parameters: Array<{ type: string; text: string }>;
    }>;
  }

  export interface TemplateValidationResult {
    valid: boolean;
    error?: string;
  }

  // CrecheBooks template definitions
  export const CRECHEBOOKS_TEMPLATES = {
    invoice_notification: {
      params: ['parent_name', 'child_name', 'amount', 'due_date', 'invoice_number'],
      language: 'en',
    },
    invoice_reminder: {
      params: ['parent_name', 'amount', 'due_date', 'days_overdue'],
      language: 'en',
    },
    payment_received: {
      params: ['parent_name', 'amount', 'payment_date', 'reference'],
      language: 'en',
    },
    arrears_notice: {
      params: ['parent_name', 'total_arrears', 'oldest_invoice_date'],
      language: 'en',
    },
    registration_welcome: {
      params: ['parent_name', 'child_name', 'creche_name', 'start_date'],
      language: 'en',
    },
  } as const;
  ```

  ### 4. DTO Pattern
  ```typescript
  export class ValidateTemplateDto {
    @IsString()
    templateName: string;

    @IsObject()
    params: Record<string, string>;
  }

  export class WhatsAppTemplateResponseDto {
    id: string;
    name: string;
    status: string;
    language: string;
    category: string;
    parameterCount: number;
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
This task creates a template management service for WhatsApp Business API.

**WhatsApp Template Requirements:**
1. All business-initiated messages must use pre-approved templates
2. Templates must be created in Meta Business Manager
3. Template approval takes 24-48 hours
4. Templates have language variants
5. Parameters must match template definition

**South African Context:**
- Templates should support English and possibly Afrikaans
- Rand currency formatting (R1,234.56)
- SA date formatting (DD/MM/YYYY)
</context>

<scope>
  <in_scope>
    - Create WhatsAppTemplateService
    - Fetch templates from Meta Graph API
    - Cache templates with TTL
    - Validate template name and parameters
    - Build template message payload
    - Define CrecheBooks template configurations
    - Create DTOs for template operations
    - Unit tests with mocked Meta API
  </in_scope>
  <out_of_scope>
    - Creating templates in Meta Business Manager (manual process)
    - Template approval workflow
    - Template versioning
    - Marketing templates (only utility templates)
    - Multi-language template selection
  </out_of_scope>
</scope>

<meta_api_reference>
## Meta Graph API - Message Templates

### List Templates
GET /v18.0/{WHATSAPP_BUSINESS_ACCOUNT_ID}/message_templates
```json
{
  "data": [
    {
      "id": "123456789",
      "name": "invoice_notification",
      "status": "APPROVED",
      "category": "UTILITY",
      "language": "en",
      "components": [
        {
          "type": "BODY",
          "text": "Hi {{1}}, your invoice for {{2}} totaling R{{3}} is due on {{4}}. Invoice #{{5}}.",
          "example": {
            "body_text": [["John", "Emma", "1500.00", "15/02/2026", "INV-001"]]
          }
        }
      ]
    }
  ]
}
```

### Send Template Message
POST /v18.0/{PHONE_NUMBER_ID}/messages
```json
{
  "messaging_product": "whatsapp",
  "to": "27821234567",
  "type": "template",
  "template": {
    "name": "invoice_notification",
    "language": { "code": "en" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "John" },
          { "type": "text", "text": "Emma" },
          { "type": "text", "text": "1500.00" },
          { "type": "text", "text": "15/02/2026" },
          { "type": "text", "text": "INV-001" }
        ]
      }
    ]
  }
}
```
</meta_api_reference>

<verification_commands>
## Execution Order

```bash
# 1. Create types
# Update apps/api/src/integrations/whatsapp/types/whatsapp.types.ts

# 2. Create DTOs
# Create apps/api/src/integrations/whatsapp/dto/whatsapp-template.dto.ts

# 3. Create template service
# Create apps/api/src/integrations/whatsapp/whatsapp-template.service.ts

# 4. Update WhatsApp module
# Edit apps/api/src/integrations/whatsapp/whatsapp.module.ts

# 5. Update WhatsApp service
# Edit apps/api/src/integrations/whatsapp/whatsapp.service.ts

# 6. Create tests
# Create apps/api/tests/integrations/whatsapp/whatsapp-template.service.spec.ts

# 7. Verify
pnpm run build           # Must show 0 errors
pnpm run lint            # Must show 0 errors/warnings
pnpm test --runInBand    # Must show all tests passing
```
</verification_commands>

<definition_of_done>
  <constraints>
    - Templates cached for 1 hour
    - Only APPROVED templates are returned
    - Parameter validation before send
    - Rate limit on template list API (per Meta limits)
    - Template names match CrecheBooks conventions
  </constraints>

  <verification>
    - pnpm run build: 0 errors
    - pnpm run lint: 0 errors, 0 warnings
    - pnpm test --runInBand: all tests passing
    - Test: Fetch templates from Meta API
    - Test: Cache invalidation after TTL
    - Test: Validate template exists
    - Test: Validate required parameters
    - Test: Build template payload
    - Test: Handle missing template error
    - Test: Handle API error gracefully
  </verification>
</definition_of_done>

<anti_patterns>
  ## DO NOT:
  - Use `npm` instead of `pnpm`
  - Fetch templates on every send (use cache)
  - Skip parameter validation
  - Hardcode access tokens
  - Allow unapproved templates
  - Ignore template language variants
</anti_patterns>

</task_spec>
