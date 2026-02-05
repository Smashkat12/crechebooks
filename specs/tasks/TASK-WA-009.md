<task_spec id="TASK-WA-009" version="2.0">

<metadata>
  <title>WhatsApp Interactive Button Response Handlers</title>
  <status>complete</status>
  <phase>26</phase>
  <layer>logic</layer>
  <sequence>269</sequence>
  <priority>P2-MEDIUM</priority>
  <implements>
    <requirement_ref>REQ-WA-INTERACTIVE-001</requirement_ref>
  </implements>
  <depends_on>
    <task_ref status="ready">TASK-WA-007</task_ref>
    <task_ref status="ready">TASK-WA-008</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>4 hours</estimated_effort>
  <last_updated>2026-02-05</last_updated>
</metadata>

<project_state>
  ## Current State

  **Problem:**
  - Quick reply buttons in templates have no response handlers
  - Button payloads are received but not processed
  - No workflow automation when parent taps buttons
  - No session message follow-up after button tap

  **Existing Resources:**
  - TwilioContentService (TASK-WA-007) - Content API
  - Rich templates with buttons (TASK-WA-008)
  - WhatsApp webhook controller

  **Gap:**
  - No button payload parsing
  - No action routing based on button type
  - No session message responses
  - No extension request workflow
  - No callback request tracking

  **Files to Create:**
  - `apps/api/src/integrations/whatsapp/handlers/button-response.handler.ts`
  - `apps/api/src/integrations/whatsapp/types/button.types.ts`

  **Files to Modify:**
  - `apps/api/src/integrations/whatsapp/whatsapp-webhook.controller.ts`
  - `apps/api/src/integrations/whatsapp/services/twilio-whatsapp.service.ts`
</project_state>

<critical_patterns>
  ## MANDATORY PATTERNS

  ### 1. Button Payload Format
  ```typescript
  // Button IDs follow pattern: action_referenceId
  // Examples:
  //   pay_INV-2026-001234
  //   extension_INV-2026-001234
  //   contact_INV-2026-001234
  //   paid_INV-2026-001234
  //   help_INV-2026-001234
  //   plan_INV-2026-001234
  //   callback_INV-2026-001234

  export type ButtonAction =
    | 'pay'
    | 'extension'
    | 'contact'
    | 'paid'
    | 'help'
    | 'plan'
    | 'callback';

  export interface ParsedButtonPayload {
    action: ButtonAction;
    referenceId: string;
    rawPayload: string;
  }

  export function parseButtonPayload(payload: string): ParsedButtonPayload {
    const [action, ...rest] = payload.split('_');
    return {
      action: action as ButtonAction,
      referenceId: rest.join('_'),
      rawPayload: payload,
    };
  }
  ```

  ### 2. Button Response Handler
  ```typescript
  // apps/api/src/integrations/whatsapp/handlers/button-response.handler.ts

  @Injectable()
  export class ButtonResponseHandler {
    private readonly logger = new Logger(ButtonResponseHandler.name);

    constructor(
      private readonly prisma: PrismaService,
      private readonly contentService: TwilioContentService,
      private readonly auditService: AuditLogService,
    ) {}

    async handleButtonResponse(
      from: string,
      payload: string,
      tenantId: string,
    ): Promise<void> {
      const parsed = parseButtonPayload(payload);

      this.logger.log(
        `Button response: ${parsed.action} for ${parsed.referenceId} from ${from}`,
      );

      // Get tenant for branding in responses
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
      });

      switch (parsed.action) {
        case 'pay':
          await this.handlePayNow(from, parsed.referenceId, tenant);
          break;
        case 'extension':
          await this.handleExtensionRequest(from, parsed.referenceId, tenant);
          break;
        case 'contact':
          await this.handleContactRequest(from, tenant);
          break;
        case 'paid':
          await this.handleAlreadyPaid(from, parsed.referenceId, tenant);
          break;
        case 'help':
          await this.handleHelpRequest(from, tenant);
          break;
        case 'plan':
          await this.handlePaymentPlanRequest(from, parsed.referenceId, tenant);
          break;
        case 'callback':
          await this.handleCallbackRequest(from, parsed.referenceId, tenant);
          break;
        default:
          this.logger.warn(`Unknown button action: ${parsed.action}`);
      }

      // Audit log the button response
      await this.auditService.log({
        tenantId,
        action: 'WHATSAPP_BUTTON_RESPONSE',
        resourceType: 'WhatsAppMessage',
        metadata: {
          from,
          buttonAction: parsed.action,
          referenceId: parsed.referenceId,
        },
      });
    }

    /**
     * PAY NOW - Send payment link
     */
    private async handlePayNow(
      to: string,
      invoiceId: string,
      tenant: Tenant,
    ): Promise<void> {
      const paymentUrl = `https://app.crechebooks.co.za/pay/${invoiceId}`;

      await this.contentService.sendSessionMessage(
        to,
        `Here's your secure payment link for ${tenant.tradingName}:\n\n${paymentUrl}\n\nThis link will remain active for 7 days.`,
      );
    }

    /**
     * EXTENSION REQUEST - Log and notify admin
     */
    private async handleExtensionRequest(
      to: string,
      invoiceId: string,
      tenant: Tenant,
    ): Promise<void> {
      // Find invoice and parent
      const invoice = await this.prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: { parent: true },
      });

      if (!invoice) {
        await this.contentService.sendSessionMessage(
          to,
          'We couldn\'t find that invoice. Please contact us for assistance.',
        );
        return;
      }

      // Create extension request record
      await this.prisma.paymentExtensionRequest.create({
        data: {
          tenantId: tenant.id,
          invoiceId,
          parentId: invoice.parentId,
          requestedAt: new Date(),
          status: 'PENDING',
          source: 'WHATSAPP',
        },
      });

      // Send confirmation
      await this.contentService.sendSessionMessage(
        to,
        `Your payment extension request for invoice ${invoice.invoiceNumber} has been submitted to ${tenant.tradingName}.\n\nOur team will contact you within 24 hours to discuss arrangements.`,
      );

      // TODO: Notify admin via email/dashboard
    }

    /**
     * CONTACT US - Open conversation
     */
    private async handleContactRequest(
      to: string,
      tenant: Tenant,
    ): Promise<void> {
      await this.contentService.sendSessionMessage(
        to,
        `Thank you for reaching out to ${tenant.tradingName}!\n\nI'm here to help. Please type your question and I'll assist you.\n\nOffice hours: Mon-Fri 08:00-17:00\nPhone: ${tenant.phone}`,
      );
    }

    /**
     * ALREADY PAID - Request proof
     */
    private async handleAlreadyPaid(
      to: string,
      invoiceId: string,
      tenant: Tenant,
    ): Promise<void> {
      await this.contentService.sendSessionMessage(
        to,
        `Thank you for letting ${tenant.tradingName} know!\n\nIf your payment was made recently, it may take 1-2 business days to reflect on your account.\n\nIf you have a proof of payment (POP), please share it here and we'll update your account promptly.`,
      );
    }

    /**
     * HELP - Send help menu
     */
    private async handleHelpRequest(
      to: string,
      tenant: Tenant,
    ): Promise<void> {
      await this.contentService.sendSessionQuickReply(
        to,
        `How can ${tenant.tradingName} help you today?`,
        [
          { title: 'Check Balance', id: 'menu_balance' },
          { title: 'Payment Methods', id: 'menu_payment' },
          { title: 'Speak to Someone', id: 'menu_human' },
        ],
      );
    }

    /**
     * PAYMENT PLAN - Request arrangement
     */
    private async handlePaymentPlanRequest(
      to: string,
      invoiceId: string,
      tenant: Tenant,
    ): Promise<void> {
      await this.contentService.sendSessionMessage(
        to,
        `We'd be happy to discuss a payment plan with you.\n\n${tenant.tradingName}'s admin team will contact you within 24 hours to arrange a suitable plan that works for your situation.`,
      );

      // TODO: Create payment plan request, notify admin
    }

    /**
     * CALLBACK REQUEST - Schedule call
     */
    private async handleCallbackRequest(
      to: string,
      invoiceId: string,
      tenant: Tenant,
    ): Promise<void> {
      await this.contentService.sendSessionMessage(
        to,
        `We'll call you back during office hours (08:00-17:00, Monday-Friday).\n\nIf you need immediate assistance, please call ${tenant.tradingName} directly at ${tenant.phone}.`,
      );

      // TODO: Create callback request, notify admin
    }
  }
  ```

  ### 3. Webhook Controller Update
  ```typescript
  // Update whatsapp-webhook.controller.ts

  @Post('twilio/webhook')
  async handleTwilioWebhook(
    @Body() body: TwilioWebhookBody,
    @Req() req: Request,
  ): Promise<{ status: string }> {
    // Verify signature
    if (!this.twilioService.verifyWebhookSignature(req)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const from = body.From?.replace('whatsapp:', '');

    // Handle button responses
    if (body.ButtonPayload) {
      // Find tenant from phone number
      const tenant = await this.findTenantByWhatsAppNumber(body.To);
      if (tenant) {
        await this.buttonHandler.handleButtonResponse(
          from,
          body.ButtonPayload,
          tenant.id,
        );
      }
    }

    // Handle list picker responses
    if (body.ListId) {
      await this.handleListPickerResponse(body);
    }

    // Handle status callbacks
    if (body.MessageStatus) {
      await this.handleStatusCallback(body);
    }

    return { status: 'ok' };
  }
  ```
</critical_patterns>

<scope>
  <in_scope>
    - Button payload parsing
    - Handler for each button action type
    - Session message responses with tenant branding
    - Extension request creation
    - Audit logging for button responses
    - Webhook controller updates
  </in_scope>
  <out_of_scope>
    - Admin notification system
    - Payment plan workflow
    - Callback scheduling system
    - Help menu list picker (TASK-WA-010)
    - Two-way conversation AI
  </out_of_scope>
</scope>

<verification_commands>
```bash
# 1. Create button types
# Create apps/api/src/integrations/whatsapp/types/button.types.ts

# 2. Create button response handler
# Create apps/api/src/integrations/whatsapp/handlers/button-response.handler.ts

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
  - [ ] Button payload parser created
  - [ ] Handler for all 7 button actions
  - [ ] Session messages use tenant.tradingName
  - [ ] Extension request creates database record
  - [ ] Webhook controller handles ButtonPayload
  - [ ] Audit logging for all button responses
  - [ ] Unit tests for handler methods
  - [ ] Build succeeds with 0 errors
  - [ ] Lint passes with 0 errors
</definition_of_done>

</task_spec>
