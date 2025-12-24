<task_spec id="TASK-BILL-035" version="1.0">

<metadata>
  <title>Delivery Status Webhook Handlers</title>
  <status>pending</status>
  <layer>surface</layer>
  <sequence>112</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-BILL-008</requirement_ref>
    <critical_issue_ref>HIGH-003</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-BILL-013</task_ref>
    <task_ref status="PENDING">TASK-BILL-015</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <estimated_effort>1 day</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use webhook and event-driven thinking.
This task involves:
1. Email delivery webhook (SendGrid/Mailgun)
2. WhatsApp delivery webhook (Meta)
3. Status tracking updates
4. Delivery analytics
5. Webhook signature verification
</reasoning_mode>

<context>
GAP: Only SENT/FAILED status tracked, missing DELIVERED/OPENED/CLICKED.

REQ-BILL-008 specifies: "Track invoice delivery status."

This task implements webhook handlers for full delivery lifecycle tracking.
</context>

<current_state>
## Codebase State
- InvoiceDeliveryService tracks SENT/FAILED
- Email sending via Nodemailer
- WhatsApp service in progress (TASK-BILL-015)
- No webhook endpoints

## What's Missing
- Email webhook endpoint
- WhatsApp webhook endpoint
- DELIVERED, OPENED, CLICKED statuses
- Bounce/complaint handling
</current_state>

<input_context_files>
  <file purpose="delivery_service">apps/api/src/database/services/invoice-delivery.service.ts</file>
  <file purpose="notification_service">apps/api/src/notifications/notification.service.ts</file>
  <file purpose="invoice_entity">apps/api/src/database/entities/invoice.entity.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - POST /api/webhooks/email - email delivery events
    - POST /api/webhooks/whatsapp - WhatsApp delivery events
    - Status update to DELIVERED, OPENED, CLICKED
    - Bounce/complaint handling
    - Webhook signature verification
    - Delivery analytics aggregation
  </in_scope>
  <out_of_scope>
    - Email provider setup (existing)
    - WhatsApp template creation
    - UI dashboard components
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/webhooks/webhook.controller.ts">
      @Controller('webhooks')
      export class WebhookController {
        @Post('email')
        async handleEmailWebhook(
          @Body() payload: EmailWebhookPayload,
          @Headers('x-sendgrid-signature') signature: string
        ): Promise<void>;

        @Post('whatsapp')
        async handleWhatsAppWebhook(
          @Body() payload: WhatsAppWebhookPayload,
          @Headers('x-hub-signature-256') signature: string
        ): Promise<void>;

        @Get('whatsapp')
        handleWhatsAppVerification(
          @Query('hub.mode') mode: string,
          @Query('hub.verify_token') token: string,
          @Query('hub.challenge') challenge: string
        ): string;
      }
    </signature>
    <signature file="apps/api/src/webhooks/webhook.service.ts">
      @Injectable()
      export class WebhookService {
        async processEmailEvent(event: EmailEvent): Promise<void>;
        async processWhatsAppEvent(event: WhatsAppEvent): Promise<void>;
        verifyEmailSignature(payload: string, signature: string): boolean;
        verifyWhatsAppSignature(payload: string, signature: string): boolean;

        private updateDeliveryStatus(
          invoiceId: string,
          channel: 'email' | 'whatsapp',
          status: DeliveryStatus
        ): Promise<void>;
      }
    </signature>
    <signature file="apps/api/src/webhooks/types/webhook.types.ts">
      export type DeliveryStatus =
        | 'QUEUED'
        | 'SENT'
        | 'DELIVERED'
        | 'OPENED'
        | 'CLICKED'
        | 'BOUNCED'
        | 'COMPLAINED'
        | 'FAILED';

      export interface EmailEvent {
        event: 'delivered' | 'open' | 'click' | 'bounce' | 'spam_report' | 'dropped';
        timestamp: number;
        messageId: string;
        email: string;
      }

      export interface WhatsAppEvent {
        statuses: Array<{
          id: string;
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string;
          recipient_id: string;
        }>;
      }
    </signature>
  </signatures>

  <constraints>
    - Verify webhook signatures before processing
    - Idempotent event processing
    - Store raw webhook payloads for debugging
    - Handle out-of-order events
    - Update invoice delivery status
    - Aggregate analytics per tenant
  </constraints>

  <verification>
    - Email webhooks processed correctly
    - WhatsApp webhooks processed correctly
    - Signatures verified
    - Delivery status updated
    - Bounce/complaint handled
    - Analytics aggregated
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/webhooks/webhook.controller.ts">Webhook controller</file>
  <file path="apps/api/src/webhooks/webhook.service.ts">Webhook service</file>
  <file path="apps/api/src/webhooks/types/webhook.types.ts">Types</file>
  <file path="apps/api/src/webhooks/webhook.module.ts">Module</file>
  <file path="apps/api/src/webhooks/__tests__/webhook.service.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/app.module.ts">Import WebhookModule</file>
  <file path="apps/api/src/database/services/invoice-delivery.service.ts">Add status update method</file>
</files_to_modify>

<validation_criteria>
  <criterion>Email webhook endpoint works</criterion>
  <criterion>WhatsApp webhook endpoint works</criterion>
  <criterion>Signatures verified</criterion>
  <criterion>Status transitions correct</criterion>
  <criterion>Bounces/complaints handled</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="webhook" --verbose</command>
</test_commands>

</task_spec>
