<task_spec id="TASK-NOTIF-001" version="1.0">

<metadata>
  <title>Implement SMS Channel Adapter (Replace NOT_IMPLEMENTED)</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>146</sequence>
  <priority>P0-BLOCKER</priority>
  <implements>
    <requirement_ref>REQ-BILL-007</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-BILL-015</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
## Critical Gap Identified
During PRD compliance analysis, it was discovered that the SMS channel adapter
throws `NotImplementedError` and cannot send any SMS messages.

## Current State
- File: `apps/api/src/notifications/adapters/sms-channel.adapter.ts` (lines 42-64)
- Currently throws: `throw new NotImplementedError('SMS channel not implemented')`
- Invoice delivery to SMS fails completely
- WhatsApp adapter exists and works (TASK-BILL-015)

## What Should Happen (Per PRD REQ-BILL-007)
SMS delivery channel should:
1. Accept phone number and message
2. Send SMS via configured gateway (Twilio, Africa's Talking, etc.)
3. Return delivery status
4. Handle errors gracefully with retry logic

## Project Context
- **Notification Service**: `apps/api/src/notifications/`
- **Channel Interface**: `INotificationChannel` with send() method
- **South Africa**: International format +27 phone numbers
- **Recommended Gateway**: Africa's Talking (popular in South Africa) or Twilio
</context>

<input_context_files>
  <file purpose="sms_adapter">apps/api/src/notifications/adapters/sms-channel.adapter.ts</file>
  <file purpose="channel_interface">apps/api/src/notifications/interfaces/notification-channel.interface.ts</file>
  <file purpose="notification_service">apps/api/src/notifications/notification.service.ts</file>
  <file purpose="whatsapp_adapter">apps/api/src/notifications/adapters/whatsapp-channel.adapter.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-BILL-015 completed (WhatsApp adapter exists as reference)</check>
  <check>Notification service infrastructure exists</check>
</prerequisites>

<scope>
  <in_scope>
    - Replace NotImplementedError with working implementation
    - Create SmsChannelAdapter implementing INotificationChannel
    - Add phone number validation (South African format)
    - Add configuration for SMS gateway
    - Implement send() method with gateway abstraction
    - Add retry logic for failed sends
    - Return proper delivery status
    - Create gateway interface for swappable providers
    - Unit tests with mocked gateway
  </in_scope>
  <out_of_scope>
    - Actual gateway integration (TASK-NOTIF-002)
    - SMS template management
    - Bulk SMS sending
    - Two-way SMS (receiving)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/notifications/adapters/sms-channel.adapter.ts">
      import { Injectable, Logger } from '@nestjs/common';
      import { INotificationChannel, NotificationResult } from '../interfaces/notification-channel.interface';
      import { ISmsGateway } from '../interfaces/sms-gateway.interface';

      @Injectable()
      export class SmsChannelAdapter implements INotificationChannel {
        private readonly logger = new Logger(SmsChannelAdapter.name);

        constructor(
          private readonly smsGateway: ISmsGateway,
        ) {}

        /**
         * Send SMS notification
         * @param recipient - Phone number in E.164 format (+27...)
         * @param message - SMS content (max 160 chars for single SMS)
         * @returns Notification result with delivery status
         */
        async send(
          recipient: string,
          message: string,
          options?: SmsOptions,
        ): Promise&lt;NotificationResult&gt;;

        /**
         * Validate South African phone number
         * Accepts: +27XXXXXXXXX, 0XXXXXXXXX, 27XXXXXXXXX
         */
        private validatePhoneNumber(phone: string): string;

        /**
         * Format phone to E.164 (+27...)
         */
        private formatToE164(phone: string): string;
      }

      export interface SmsOptions {
        senderId?: string;
        priority?: 'normal' | 'high';
        maxRetries?: number;
      }
    </signature>

    <signature file="apps/api/src/notifications/interfaces/sms-gateway.interface.ts">
      export interface ISmsGateway {
        send(
          to: string,
          message: string,
          options?: { senderId?: string },
        ): Promise&lt;SmsGatewayResult&gt;;
      }

      export interface SmsGatewayResult {
        messageId: string;
        status: 'queued' | 'sent' | 'delivered' | 'failed';
        errorCode?: string;
        errorMessage?: string;
      }
    </signature>
  </signatures>

  <constraints>
    - Phone numbers must be validated and formatted to E.164
    - South African numbers start with +27
    - SMS content max 160 chars for single SMS (warn if longer)
    - Must use gateway interface for provider abstraction
    - Retry up to 3 times on transient failures
    - Log all send attempts and results
    - Return proper status (SUCCESS, FAILED, PENDING)
  </constraints>

  <verification>
    - NotImplementedError removed
    - send() method works with mock gateway
    - Phone validation accepts SA formats
    - Phone formatting outputs E.164
    - Retry logic works on transient failures
    - Proper status returned
    - Unit tests pass
  </verification>
</definition_of_done>

<pseudo_code>
SmsChannelAdapter (apps/api/src/notifications/adapters/sms-channel.adapter.ts):

import { Injectable, Logger } from '@nestjs/common';
import { INotificationChannel, NotificationResult } from '../interfaces/notification-channel.interface';
import { ISmsGateway, SmsGatewayResult } from '../interfaces/sms-gateway.interface';
import { ValidationException } from '../../shared/exceptions';

@Injectable()
export class SmsChannelAdapter implements INotificationChannel {
  private readonly logger = new Logger(SmsChannelAdapter.name);
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;

  constructor(
    private readonly smsGateway: ISmsGateway,
  ) {}

  async send(
    recipient: string,
    message: string,
    options: SmsOptions = {},
  ): Promise<NotificationResult> {
    // 1. Validate and format phone number
    let formattedPhone: string;
    try {
      formattedPhone = this.validatePhoneNumber(recipient);
    } catch (error) {
      this.logger.error(`Invalid phone number: ${recipient}`);
      return {
        success: false,
        status: 'FAILED',
        error: error.message,
      };
    }

    // 2. Warn if message exceeds single SMS length
    if (message.length > 160) {
      this.logger.warn(`SMS message exceeds 160 chars (${message.length}), will be split`);
    }

    // 3. Send with retry logic
    const maxRetries = options.maxRetries ?? this.MAX_RETRIES;
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(`SMS send attempt ${attempt}/${maxRetries} to ${formattedPhone}`);

        const result = await this.smsGateway.send(formattedPhone, message, {
          senderId: options.senderId,
        });

        if (result.status === 'sent' || result.status === 'queued' || result.status === 'delivered') {
          this.logger.log(`SMS sent successfully to ${formattedPhone}: ${result.messageId}`);
          return {
            success: true,
            status: 'SUCCESS',
            messageId: result.messageId,
          };
        }

        lastError = result.errorMessage || 'Unknown error';
        this.logger.warn(`SMS send failed: ${lastError}`);

      } catch (error) {
        lastError = error.message;
        this.logger.error(`SMS send error (attempt ${attempt}): ${error.message}`);
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        await this.delay(this.RETRY_DELAY_MS * attempt);
      }
    }

    // All retries exhausted
    this.logger.error(`SMS send failed after ${maxRetries} attempts to ${formattedPhone}`);
    return {
      success: false,
      status: 'FAILED',
      error: lastError || 'Max retries exceeded',
    };
  }

  private validatePhoneNumber(phone: string): string {
    // Remove spaces and dashes
    const cleaned = phone.replace(/[\s\-]/g, '');

    // South African number patterns
    const patterns = [
      /^\+27\d{9}$/,        // +27XXXXXXXXX (E.164)
      /^27\d{9}$/,          // 27XXXXXXXXX
      /^0\d{9}$/,           // 0XXXXXXXXX (local)
    ];

    const isValid = patterns.some(p => p.test(cleaned));

    if (!isValid) {
      throw new ValidationException(`Invalid South African phone number: ${phone}`, [
        { field: 'phone', message: 'Must be a valid SA phone number (+27XXXXXXXXX, 0XXXXXXXXX)', value: phone }
      ]);
    }

    return this.formatToE164(cleaned);
  }

  private formatToE164(phone: string): string {
    // Remove leading zero and add +27
    if (phone.startsWith('0')) {
      return `+27${phone.substring(1)}`;
    }
    // Add + if starts with 27
    if (phone.startsWith('27')) {
      return `+${phone}`;
    }
    // Already E.164
    return phone;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Mock Gateway for testing (apps/api/src/notifications/gateways/mock-sms.gateway.ts):

@Injectable()
export class MockSmsGateway implements ISmsGateway {
  async send(to: string, message: string, options?: { senderId?: string }): Promise<SmsGatewayResult> {
    // Simulate network delay
    await new Promise(r => setTimeout(r, 100));

    return {
      messageId: `mock-${Date.now()}`,
      status: 'sent',
    };
  }
}
</pseudo_code>

<files_to_create>
  <file path="apps/api/src/notifications/interfaces/sms-gateway.interface.ts">ISmsGateway interface</file>
  <file path="apps/api/src/notifications/gateways/mock-sms.gateway.ts">Mock gateway for testing</file>
  <file path="apps/api/src/notifications/adapters/sms-channel.adapter.spec.ts">Unit tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/notifications/adapters/sms-channel.adapter.ts">Replace NotImplementedError with working implementation</file>
  <file path="apps/api/src/notifications/notifications.module.ts">Register SmsChannelAdapter and MockSmsGateway</file>
</files_to_modify>

<validation_criteria>
  <criterion>NotImplementedError removed</criterion>
  <criterion>send() method works with mock gateway</criterion>
  <criterion>Phone validation accepts +27..., 27..., 0... formats</criterion>
  <criterion>Phone formatting outputs +27XXXXXXXXX</criterion>
  <criterion>Retry logic works with exponential backoff</criterion>
  <criterion>Proper NotificationResult returned</criterion>
  <criterion>Unit tests pass with >80% coverage</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run test -- sms-channel.adapter</command>
  <command>npm run test:cov -- sms-channel.adapter</command>
</test_commands>

</task_spec>
