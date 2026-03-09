<task_spec id="TASK-WA-015" version="2.0">

<metadata>
  <title>WhatsApp Flows API Integration Service</title>
  <status>pending</status>
  <phase>29</phase>
  <layer>foundation</layer>
  <sequence>717</sequence>
  <priority>P2-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-WA-FLOWS-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="complete">TASK-WA-007</task_ref>
    <task_ref status="pending">TASK-WA-012</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>6 hours</estimated_effort>
  <last_updated>2026-02-05</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  - Phase 1 conversational onboarding (TASK-WA-011 to 014) works but is verbose — 16+ messages
  - WhatsApp Flows allow native multi-screen forms inside WhatsApp (like mini-apps)
  - No Twilio/WhatsApp Flows API integration exists in the codebase
  - Flows provide a better UX: structured input, dropdowns, date pickers, back navigation

  **Existing Resources:**
  - TwilioWhatsAppService (TASK-WA-007) — Content API integration
  - TwilioContentService — session/template message sending
  - Twilio Node.js SDK (already in dependencies)
  - OnboardingConversationHandler (TASK-WA-012) — conversational fallback

  **Gap:**
  - No WhatsApp Flows API client
  - No flow definition JSON schema types
  - No flow creation/publishing API calls
  - No flow message sending capability
  - No flow response webhook handler

  **Files to Create:**
  - `apps/api/src/integrations/whatsapp/services/whatsapp-flows.service.ts`
  - `apps/api/src/integrations/whatsapp/types/whatsapp-flows.types.ts`
  - `apps/api/src/integrations/whatsapp/services/whatsapp-flows.service.spec.ts`

  **Files to Modify:**
  - `apps/api/src/integrations/whatsapp/whatsapp.module.ts` — register FlowsService
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. WhatsApp Flows Overview
  WhatsApp Flows are JSON-defined multi-screen forms that run natively inside WhatsApp:
  - Screens with text inputs, dropdowns, date pickers, radio buttons, checkboxes
  - Navigation between screens (next/back)
  - Data endpoint callback when flow completes
  - Flows are created via the WhatsApp Business Platform API (not Twilio Content API)
  - Twilio acts as BSP — flows are managed via Meta's Graph API through Twilio

  ### 2. Flows API Service
  ```typescript
  // apps/api/src/integrations/whatsapp/services/whatsapp-flows.service.ts

  @Injectable()
  export class WhatsAppFlowsService {
    private readonly logger = new Logger(WhatsAppFlowsService.name);
    private readonly graphApiUrl = 'https://graph.facebook.com/v21.0';

    constructor(
      private readonly configService: ConfigService,
      private readonly httpService: HttpService,
    ) {}

    /**
     * Create a new WhatsApp Flow
     */
    async createFlow(
      name: string,
      categories: FlowCategory[],
      flowJson: WhatsAppFlowDefinition,
    ): Promise<{ flowId: string }> {
      const wabaId = this.configService.get('WHATSAPP_BUSINESS_ACCOUNT_ID');
      const accessToken = this.configService.get('WHATSAPP_ACCESS_TOKEN');

      const response = await this.httpService.axiosRef.post(
        `${this.graphApiUrl}/${wabaId}/flows`,
        {
          name,
          categories,
          clone_flow_id: undefined,
        },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );

      const flowId = response.data.id;

      // Upload flow JSON
      await this.updateFlowJson(flowId, flowJson);

      return { flowId };
    }

    /**
     * Update flow JSON definition
     */
    async updateFlowJson(
      flowId: string,
      flowJson: WhatsAppFlowDefinition,
    ): Promise<void> {
      const accessToken = this.configService.get('WHATSAPP_ACCESS_TOKEN');

      await this.httpService.axiosRef.post(
        `${this.graphApiUrl}/${flowId}/assets`,
        { file: JSON.stringify(flowJson), name: 'flow.json' },
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
    }

    /**
     * Publish a flow (makes it available to send)
     */
    async publishFlow(flowId: string): Promise<void> {
      const accessToken = this.configService.get('WHATSAPP_ACCESS_TOKEN');

      await this.httpService.axiosRef.post(
        `${this.graphApiUrl}/${flowId}/publish`,
        {},
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
    }

    /**
     * Send a flow message to a user via Twilio
     */
    async sendFlowMessage(
      to: string,
      flowId: string,
      headerText: string,
      bodyText: string,
      ctaText: string,
      flowData?: Record<string, unknown>,
    ): Promise<string> {
      // Twilio sends flows as interactive messages
      const client = twilio(
        this.configService.get('TWILIO_ACCOUNT_SID'),
        this.configService.get('TWILIO_AUTH_TOKEN'),
      );

      const message = await client.messages.create({
        from: `whatsapp:${this.configService.get('TWILIO_WHATSAPP_NUMBER')}`,
        to: `whatsapp:${to}`,
        contentSid: undefined, // Not content API — use interactive
        body: undefined,
        // Flow messages use the interactive message format
        persistentAction: [`flow:${flowId}`],
        // Alternative: use the messaging API directly with flow payload
      });

      return message.sid;
    }

    /**
     * Handle flow completion webhook (data endpoint)
     */
    async handleFlowResponse(
      flowId: string,
      flowToken: string,
      responseData: Record<string, unknown>,
    ): Promise<FlowResponseAction> {
      this.logger.log(`Flow response received: flowId=${flowId}`);

      // Validate flow token
      // Process response data
      // Return next screen or completion

      return {
        screen: 'SUCCESS',
        data: {},
      };
    }
  }
  ```

  ### 3. Flow Types
  ```typescript
  // apps/api/src/integrations/whatsapp/types/whatsapp-flows.types.ts

  export type FlowCategory = 'SIGN_UP' | 'SIGN_IN' | 'APPOINTMENT_BOOKING'
    | 'LEAD_GENERATION' | 'CONTACT_US' | 'CUSTOMER_SUPPORT' | 'SURVEY' | 'OTHER';

  export interface WhatsAppFlowDefinition {
    version: '5.0';
    screens: WhatsAppFlowScreen[];
    data_api_version?: '3.0';
    routing_model?: Record<string, string[]>;
  }

  export interface WhatsAppFlowScreen {
    id: string;
    title: string;
    terminal?: boolean;
    data?: Record<string, { type: string; __example__: unknown }>;
    layout: {
      type: 'SingleColumnLayout';
      children: WhatsAppFlowComponent[];
    };
  }

  export type WhatsAppFlowComponent =
    | FlowTextHeading
    | FlowTextSubheading
    | FlowTextBody
    | FlowTextInput
    | FlowTextArea
    | FlowDatePicker
    | FlowDropdown
    | FlowRadioButtonGroup
    | FlowCheckboxGroup
    | FlowOptIn
    | FlowFooter;

  export interface FlowTextInput {
    type: 'TextInput';
    name: string;
    label: string;
    required?: boolean;
    'input-type'?: 'text' | 'number' | 'email' | 'phone' | 'password';
    'helper-text'?: string;
    'error-text'?: string;
  }

  export interface FlowDatePicker {
    type: 'DatePicker';
    name: string;
    label: string;
    required?: boolean;
    'min-date'?: string;
    'max-date'?: string;
    'helper-text'?: string;
  }

  export interface FlowDropdown {
    type: 'Dropdown';
    name: string;
    label: string;
    required?: boolean;
    'data-source': Array<{ id: string; title: string }>;
  }

  export interface FlowRadioButtonGroup {
    type: 'RadioButtonsGroup';
    name: string;
    label: string;
    required?: boolean;
    'data-source': Array<{ id: string; title: string }>;
  }

  export interface FlowFooter {
    type: 'Footer';
    label: string;
    'on-click-action': {
      name: 'navigate' | 'complete' | 'data_exchange';
      next?: { type: 'screen'; name: string };
      payload: Record<string, unknown>;
    };
  }

  export interface FlowResponseAction {
    screen: string;
    data: Record<string, unknown>;
  }
  ```

  ### 4. Environment Variables
  WhatsApp Flows require Meta Graph API access (separate from Twilio credentials):
  ```env
  WHATSAPP_BUSINESS_ACCOUNT_ID=   # Meta WABA ID
  WHATSAPP_ACCESS_TOKEN=           # Meta permanent access token
  WHATSAPP_FLOWS_ENDPOINT_URL=     # Data endpoint for flow responses
  ```

  ### 5. Relationship to Phase 1
  - Phase 1 (conversational) remains as fallback for users on older WhatsApp versions
  - Phase 2 (Flows) is the preferred path when supported
  - Both paths create the same Parent/Child/EmergencyContact records
  - The OnboardingConversationHandler detects Flow support and routes accordingly
</critical_patterns>

<scope>
  <in_scope>
    - WhatsAppFlowsService with CRUD operations
    - Flow types and JSON schema interfaces
    - Flow creation, update, publish API methods
    - Flow message sending via Twilio
    - Flow response webhook handler
    - Environment variable configuration
    - Unit tests for service methods
  </in_scope>
  <out_of_scope>
    - Onboarding flow definition (TASK-WA-016)
    - Flow response processing into records (TASK-WA-017)
    - Flow deployment and E2E tests (TASK-WA-018)
    - Conversational fallback logic (already in TASK-WA-012)
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Create flows service and types
# Create apps/api/src/integrations/whatsapp/services/whatsapp-flows.service.ts
# Create apps/api/src/integrations/whatsapp/types/whatsapp-flows.types.ts

# 2. Update module
# Edit apps/api/src/integrations/whatsapp/whatsapp.module.ts

# 3. Verify
pnpm run build
pnpm run lint
pnpm test --runInBand
```
</verification_commands>

<definition_of_done>
  - [ ] WhatsAppFlowsService created with Graph API integration
  - [ ] Flow CRUD methods (create, update, publish, delete)
  - [ ] Flow message sending via Twilio
  - [ ] Flow response webhook handler
  - [ ] WhatsApp Flow JSON schema types defined
  - [ ] All component types (TextInput, DatePicker, Dropdown, RadioButtons, etc.)
  - [ ] FlowCategory enum for Meta categories
  - [ ] Environment variables documented
  - [ ] Module updated with FlowsService provider
  - [ ] Unit tests for API calls (mocked)
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

</task_spec>
