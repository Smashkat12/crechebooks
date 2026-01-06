<task_spec id="TASK-NOTIF-002" version="1.0">

<metadata>
  <title>SMS Gateway Integration (Twilio/Africa's Talking)</title>
  <status>ready</status>
  <layer>logic</layer>
  <sequence>147</sequence>
  <priority>P1-CRITICAL</priority>
  <implements>
    <requirement_ref>REQ-BILL-007</requirement_ref>
  </implements>
  <depends_on>
    <task_ref>TASK-NOTIF-001</task_ref>
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
</metadata>

<context>
## Purpose
After TASK-NOTIF-001 creates the SMS channel adapter with gateway abstraction,
this task implements actual SMS gateway integration.

## Current State
- SmsChannelAdapter exists with ISmsGateway interface
- MockSmsGateway used for testing
- No real SMS delivery

## Recommended Gateways for South Africa
1. **Africa's Talking** - Popular, good SA coverage, competitive pricing
2. **Twilio** - Global, well-documented, slightly more expensive
3. **Clickatell** - SA-based, good local support

This task implements Africa's Talking as primary, with Twilio as reference.

## Project Context
- Environment variables for API keys
- ConfigService for configuration
- Gateway interface allows easy swapping
</context>

<input_context_files>
  <file purpose="sms_gateway_interface">apps/api/src/notifications/interfaces/sms-gateway.interface.ts</file>
  <file purpose="sms_adapter">apps/api/src/notifications/adapters/sms-channel.adapter.ts</file>
  <file purpose="config_service">apps/api/src/config/configuration.ts</file>
</input_context_files>

<prerequisites>
  <check>TASK-NOTIF-001 completed (ISmsGateway interface exists)</check>
  <check>Africa's Talking or Twilio account created</check>
  <check>API credentials available</check>
</prerequisites>

<scope>
  <in_scope>
    - Implement AfricasTalkingSmsGateway
    - Implement TwilioSmsGateway (optional/reference)
    - Add environment variable configuration
    - Handle API responses and errors
    - Map gateway-specific statuses to SmsGatewayResult
    - Add delivery status callback webhook (optional)
    - Integration tests with sandbox/test credentials
  </in_scope>
  <out_of_scope>
    - SMS template management
    - Bulk SMS optimization
    - Two-way SMS
    - Multiple gateway failover
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/notifications/gateways/africastalking-sms.gateway.ts">
      import { Injectable, Logger } from '@nestjs/common';
      import { ConfigService } from '@nestjs/config';
      import { ISmsGateway, SmsGatewayResult } from '../interfaces/sms-gateway.interface';

      @Injectable()
      export class AfricasTalkingSmsGateway implements ISmsGateway {
        private readonly logger = new Logger(AfricasTalkingSmsGateway.name);
        private readonly client: any; // Africa's Talking SDK

        constructor(private readonly configService: ConfigService) {
          // Initialize Africa's Talking SDK
        }

        async send(
          to: string,
          message: string,
          options?: { senderId?: string },
        ): Promise&lt;SmsGatewayResult&gt;;
      }
    </signature>
  </signatures>

  <constraints>
    - API keys MUST be in environment variables (never hardcoded)
    - Use sandbox mode for development
    - Handle rate limiting gracefully
    - Map all gateway statuses to standard SmsGatewayResult
    - Log all API interactions (redact sensitive data)
  </constraints>

  <verification>
    - SMS sent via Africa's Talking API
    - Proper status returned
    - Errors handled gracefully
    - Environment configuration works
    - Integration tests pass with sandbox
  </verification>
</definition_of_done>

<pseudo_code>
AfricasTalkingSmsGateway (apps/api/src/notifications/gateways/africastalking-sms.gateway.ts):

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ISmsGateway, SmsGatewayResult } from '../interfaces/sms-gateway.interface';
import AfricasTalking from 'africastalking';

@Injectable()
export class AfricasTalkingSmsGateway implements ISmsGateway {
  private readonly logger = new Logger(AfricasTalkingSmsGateway.name);
  private readonly sms: any;
  private readonly senderId: string;

  constructor(private readonly configService: ConfigService) {
    const credentials = {
      apiKey: this.configService.get<string>('AFRICASTALKING_API_KEY'),
      username: this.configService.get<string>('AFRICASTALKING_USERNAME'),
    };

    if (!credentials.apiKey || !credentials.username) {
      this.logger.warn('Africa\'s Talking credentials not configured');
    }

    const AT = AfricasTalking(credentials);
    this.sms = AT.SMS;
    this.senderId = this.configService.get<string>('SMS_SENDER_ID', 'CrecheBooks');
  }

  async send(
    to: string,
    message: string,
    options?: { senderId?: string },
  ): Promise<SmsGatewayResult> {
    try {
      const result = await this.sms.send({
        to: [to],
        message,
        from: options?.senderId || this.senderId,
      });

      // Africa's Talking returns Recipients array
      const recipient = result.SMSMessageData?.Recipients?.[0];

      if (!recipient) {
        return {
          messageId: result.SMSMessageData?.Message || 'unknown',
          status: 'failed',
          errorCode: 'NO_RECIPIENT',
          errorMessage: 'No recipient data returned',
        };
      }

      // Map AT status to our standard
      const status = this.mapStatus(recipient.status);

      this.logger.log(`SMS sent to ${to}: ${recipient.messageId} - ${status}`);

      return {
        messageId: recipient.messageId,
        status,
        errorCode: recipient.statusCode?.toString(),
        errorMessage: recipient.status !== 'Success' ? recipient.status : undefined,
      };

    } catch (error) {
      this.logger.error(`Africa's Talking API error: ${error.message}`);

      return {
        messageId: '',
        status: 'failed',
        errorCode: 'API_ERROR',
        errorMessage: error.message,
      };
    }
  }

  private mapStatus(atStatus: string): 'queued' | 'sent' | 'delivered' | 'failed' {
    switch (atStatus) {
      case 'Success':
        return 'sent';
      case 'Sent':
        return 'sent';
      case 'Queued':
        return 'queued';
      case 'Delivered':
        return 'delivered';
      default:
        return 'failed';
    }
  }
}

// Environment variables (.env.example):
AFRICASTALKING_API_KEY=your_api_key
AFRICASTALKING_USERNAME=sandbox  # or your username
SMS_SENDER_ID=CrecheBooks
SMS_GATEWAY=africastalking  # or twilio

// Configuration (apps/api/src/config/sms.config.ts):
export const smsConfig = () => ({
  sms: {
    gateway: process.env.SMS_GATEWAY || 'mock',
    senderId: process.env.SMS_SENDER_ID || 'CrecheBooks',
    africastalking: {
      apiKey: process.env.AFRICASTALKING_API_KEY,
      username: process.env.AFRICASTALKING_USERNAME,
    },
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    },
  },
});

// Module registration with factory:
{
  provide: 'ISmsGateway',
  useFactory: (configService: ConfigService) => {
    const gateway = configService.get('sms.gateway');
    switch (gateway) {
      case 'africastalking':
        return new AfricasTalkingSmsGateway(configService);
      case 'twilio':
        return new TwilioSmsGateway(configService);
      default:
        return new MockSmsGateway();
    }
  },
  inject: [ConfigService],
}
</pseudo_code>

<files_to_create>
  <file path="apps/api/src/notifications/gateways/africastalking-sms.gateway.ts">Africa's Talking implementation</file>
  <file path="apps/api/src/notifications/gateways/twilio-sms.gateway.ts">Twilio implementation (reference)</file>
  <file path="apps/api/src/config/sms.config.ts">SMS configuration</file>
  <file path="apps/api/src/notifications/gateways/africastalking-sms.gateway.spec.ts">Integration tests</file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/package.json">Add africastalking and twilio dependencies</file>
  <file path="apps/api/.env.example">Add SMS gateway environment variables</file>
  <file path="apps/api/src/notifications/notifications.module.ts">Add gateway factory provider</file>
  <file path="apps/api/src/config/configuration.ts">Import sms config</file>
</files_to_modify>

<validation_criteria>
  <criterion>Africa's Talking SDK installed and configured</criterion>
  <criterion>SMS sent successfully via API</criterion>
  <criterion>Status mapping correct</criterion>
  <criterion>Errors handled gracefully</criterion>
  <criterion>Environment configuration working</criterion>
  <criterion>Gateway swappable via config</criterion>
  <criterion>Integration tests pass with sandbox</criterion>
</validation_criteria>

<test_commands>
  <command>cd apps/api && npm install africastalking</command>
  <command>npm run build</command>
  <command>npm run test -- africastalking-sms.gateway</command>
</test_commands>

</task_spec>
