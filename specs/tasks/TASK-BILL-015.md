<task_spec id="TASK-BILL-015" version="1.0">

<metadata>
  <title>WhatsApp Business API Integration</title>
  <status>complete</status>
  <layer>logic</layer>
  <sequence>100</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-BILL-007</requirement_ref>
    <critical_issue_ref>CRIT-010</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="COMPLETE">TASK-BILL-013</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>3 days</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use integration-focused thinking with compliance awareness.
This task involves:
1. WhatsApp Business API integration (Meta Cloud API or Twilio)
2. Template message creation and approval
3. Invoice PDF attachment sending
4. Delivery status tracking via webhooks
5. POPIA consent management
</reasoning_mode>

<context>
CRITICAL BUG: WhatsApp service throws WHATSAPP_NOT_IMPLEMENTED exception.

Location: `apps/api/src/integrations/whatsapp/whatsapp.service.ts:74-79`

REQ-BILL-007 specifies: "Invoices delivered via email and/or WhatsApp based on parent preference."

This task implements actual WhatsApp Business API integration to replace the stub.
</context>

<current_state>
## Codebase State
- File exists: `apps/api/src/integrations/whatsapp/whatsapp.service.ts`
- Current implementation: Throws `WHATSAPP_NOT_IMPLEMENTED` exception
- InvoiceDeliveryService calls WhatsAppService
- Parent entity has `preferredContactMethod` field

## Current Stub Code
```typescript
// whatsapp.service.ts lines 74-79
async sendInvoice(parentId: string, invoiceId: string): Promise<void> {
  throw new NotImplementedException(
    'WhatsApp Business API not implemented',
    'WHATSAPP_NOT_IMPLEMENTED'
  );
}
```
</current_state>

<input_context_files>
  <file purpose="file_to_modify">apps/api/src/integrations/whatsapp/whatsapp.service.ts</file>
  <file purpose="invoice_delivery">apps/api/src/database/services/invoice-delivery.service.ts</file>
  <file purpose="parent_entity">apps/api/src/database/entities/parent.entity.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - WhatsApp Business API integration (Meta Cloud API)
    - Template messages: invoice_reminder, payment_received, arrears_notice
    - Invoice PDF attachment
    - Delivery status webhook handler
    - Opt-out/consent management
    - Integration tests with sandbox
  </in_scope>
  <out_of_scope>
    - Interactive messaging (buttons, quick replies)
    - WhatsApp catalog integration
    - Custom message building (templates only)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/integrations/whatsapp/whatsapp.service.ts">
      @Injectable()
      export class WhatsAppService {
        async sendInvoice(parentId: string, invoiceId: string): Promise<WhatsAppMessageResult>;
        async sendReminder(parentId: string, templateName: string, params: TemplateParams): Promise<WhatsAppMessageResult>;
        async handleWebhook(payload: WhatsAppWebhookPayload): Promise<void>;
        async checkOptIn(phoneNumber: string): Promise<boolean>;
        async optOut(phoneNumber: string): Promise<void>;
      }
    </signature>
    <signature file="apps/api/src/integrations/whatsapp/types/whatsapp.types.ts">
      export interface WhatsAppMessageResult {
        messageId: string;
        status: 'sent' | 'delivered' | 'read' | 'failed';
        sentAt: Date;
        recipientPhone: string;
      }

      export interface WhatsAppWebhookPayload {
        entry: Array<{
          changes: Array<{
            value: {
              statuses?: Array<{
                id: string;
                status: 'sent' | 'delivered' | 'read' | 'failed';
                timestamp: string;
              }>;
            };
          }>;
        }>;
      }

      export interface TemplateParams {
        [key: string]: string;
      }
    </signature>
  </signatures>

  <constraints>
    - Use Meta Cloud API (graph.facebook.com)
    - All messages must use pre-approved templates
    - POPIA: Must check opt-in before sending
    - Webhook signature verification required
    - Rate limiting: 80 messages/second
    - Phone numbers in E.164 format (+27...)
  </constraints>

  <verification>
    - Invoice PDF sent successfully
    - Delivery status tracked
    - Opt-out respected
    - Webhook processes events
    - Tests pass with sandbox
  </verification>
</definition_of_done>

<files_to_modify>
  <file path="apps/api/src/integrations/whatsapp/whatsapp.service.ts">Replace stub with implementation</file>
</files_to_modify>

<files_to_create>
  <file path="apps/api/src/integrations/whatsapp/types/whatsapp.types.ts">Types</file>
  <file path="apps/api/src/integrations/whatsapp/__tests__/whatsapp.service.spec.ts">Tests</file>
</files_to_create>

<validation_criteria>
  <criterion>sendInvoice no longer throws exception</criterion>
  <criterion>WhatsApp messages sent successfully</criterion>
  <criterion>PDF attachments work</criterion>
  <criterion>Webhook processes status updates</criterion>
  <criterion>Opt-out respected</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="whatsapp" --verbose</command>
</test_commands>

</task_spec>
