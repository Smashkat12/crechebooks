<task_spec id="TASK-INFRA-012" version="1.0">

<metadata>
  <title>Multi-Channel Notification Service Enhancement</title>
  <status>complete</status>
  <layer>logic</layer>
  <sequence>115</sequence>
  <priority>P2-HIGH</priority>
  <implements>
    <requirement_ref>REQ-BILL-006</requirement_ref>
    <requirement_ref>REQ-BILL-007</requirement_ref>
    <requirement_ref>REQ-PAY-009</requirement_ref>
    <critical_issue_ref>INFRA-002</critical_issue_ref>
  </implements>
  <depends_on>
    <task_ref status="PENDING">TASK-BILL-015</task_ref>
    <task_ref status="COMPLETE">TASK-BILL-013</task_ref>
  </depends_on>
  <estimated_complexity>high</estimated_complexity>
  <estimated_effort>3 days</estimated_effort>
</metadata>

<reasoning_mode>
REQUIRED: Use abstraction and multi-channel delivery thinking.
This task involves:
1. Abstract channel interface
2. Email, WhatsApp, SMS adapters
3. Preference management per parent
4. Delivery tracking across channels
5. Fallback chain (WhatsApp > Email > SMS)
</reasoning_mode>

<context>
PATTERN: Email works, WhatsApp is a stub, SMS not implemented. Each notification type re-implements delivery logic inconsistently.

This task creates a unified NotificationService with pluggable channel adapters and automatic fallback.
</context>

<current_state>
## Codebase State
- InvoiceDeliveryService handles email (TASK-BILL-013)
- WhatsAppService throws NOT_IMPLEMENTED
- No SMS service
- No unified notification interface

## What's Missing
- Channel adapter interface
- Unified notification service
- Fallback logic
- Delivery preference management
</current_state>

<input_context_files>
  <file purpose="invoice_delivery">apps/api/src/database/services/invoice-delivery.service.ts</file>
  <file purpose="whatsapp_service">apps/api/src/integrations/whatsapp/whatsapp.service.ts</file>
  <file purpose="parent_entity">apps/api/src/database/entities/parent.entity.ts</file>
</input_context_files>

<scope>
  <in_scope>
    - INotificationChannel interface
    - EmailChannelAdapter (refactor existing)
    - WhatsAppChannelAdapter (integrate with TASK-BILL-015)
    - SmsChannelAdapter (stub for future)
    - NotificationPreferenceService
    - Fallback chain execution
    - Delivery tracking across channels
  </in_scope>
  <out_of_scope>
    - Push notifications
    - In-app notifications
    - Custom channel creation
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/notifications/interfaces/notification-channel.interface.ts">
      export interface INotificationChannel {
        channelType: NotificationChannelType;
        isAvailable(recipientId: string): Promise<boolean>;
        send(notification: Notification): Promise<DeliveryResult>;
        getDeliveryStatus(messageId: string): Promise<DeliveryStatus>;
      }
    </signature>
    <signature file="apps/api/src/notifications/notification.service.ts">
      @Injectable()
      export class NotificationService {
        async send(tenantId: string, notification: NotificationPayload): Promise<DeliveryResult>;
        async sendWithFallback(tenantId: string, notification: NotificationPayload): Promise<DeliveryResult>;
        async getPreferences(parentId: string): Promise<NotificationPreferences>;
        async updatePreferences(parentId: string, prefs: NotificationPreferences): Promise<void>;
      }
    </signature>
  </signatures>

  <constraints>
    - Fallback order configurable per tenant
    - Default: WhatsApp > Email > SMS
    - Track delivery attempts across channels
    - POPIA consent required for each channel
    - Rate limiting per channel
  </constraints>

  <verification>
    - All channels implement interface
    - Fallback triggers on failure
    - Preferences respected
    - Delivery tracked end-to-end
    - Tests pass
  </verification>
</definition_of_done>

<files_to_create>
  <file path="apps/api/src/notifications/interfaces/notification-channel.interface.ts">Channel interface</file>
  <file path="apps/api/src/notifications/notification.service.ts">Unified service</file>
  <file path="apps/api/src/notifications/adapters/email-channel.adapter.ts">Email adapter</file>
  <file path="apps/api/src/notifications/adapters/whatsapp-channel.adapter.ts">WhatsApp adapter</file>
  <file path="apps/api/src/notifications/adapters/sms-channel.adapter.ts">SMS adapter (stub)</file>
  <file path="apps/api/src/notifications/notification-preference.service.ts">Preference service</file>
  <file path="apps/api/src/notifications/types/notification.types.ts">Types</file>
  <file path="apps/api/src/notifications/notification.module.ts">Module</file>
  <file path="apps/api/src/notifications/__tests__/notification.service.spec.ts">Tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/database/services/invoice-delivery.service.ts">Use NotificationService</file>
  <file path="apps/api/src/database/services/payment-reminder.service.ts">Use NotificationService</file>
</files_to_modify>

<validation_criteria>
  <criterion>Channel interface defined</criterion>
  <criterion>Email adapter works</criterion>
  <criterion>WhatsApp adapter integrates with TASK-BILL-015</criterion>
  <criterion>Fallback chain executes correctly</criterion>
  <criterion>Preferences managed per parent</criterion>
  <criterion>Tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- --testPathPattern="notification" --verbose</command>
</test_commands>

</task_spec>
