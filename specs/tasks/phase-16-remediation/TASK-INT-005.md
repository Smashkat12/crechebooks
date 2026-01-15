<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-INT-005</task_id>
    <title>Fix WhatsApp Webhook Signature Key</title>
    <priority>HIGH</priority>
    <category>Security</category>
    <phase>16-remediation</phase>
    <status>DONE</status>
    <estimated_effort>2 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <assignee>unassigned</assignee>
    <tags>
      <tag>security</tag>
      <tag>whatsapp</tag>
      <tag>webhook</tag>
      <tag>signature-verification</tag>
      <tag>meta</tag>
    </tags>
  </metadata>

  <context>
    <background>
      The WhatsApp webhook controller implements signature verification to ensure
      incoming webhooks are genuinely from Meta (Facebook). However, the current
      implementation uses the wrong key for signature verification, potentially
      allowing forged webhook requests to be processed.
    </background>
    <issue_description>
      HIGH - Wrong key used for signature verification. The webhook controller may
      be using an incorrect secret (e.g., access token instead of app secret, or
      verify token instead of webhook signature key), allowing attackers to forge
      webhook payloads that pass validation.
    </issue_description>
    <business_impact>
      - Forged webhooks could trigger unintended actions
      - Message spoofing attacks possible
      - Data integrity compromised
      - Potential for fraudulent transactions via fake messages
      - Trust relationship with WhatsApp users undermined
    </business_impact>
    <technical_debt>
      Meta's webhook security model requires specific keys for different purposes.
      Mixing them up creates security vulnerabilities while appearing to work.
    </technical_debt>
  </context>

  <scope>
    <in_scope>
      <item>Identify correct Meta webhook signature key</item>
      <item>Fix signature verification implementation</item>
      <item>Add proper environment variable for webhook secret</item>
      <item>Implement timing-safe comparison</item>
      <item>Add comprehensive logging for verification failures</item>
    </in_scope>
    <out_of_scope>
      <item>WhatsApp message processing logic</item>
      <item>Meta API interaction changes</item>
      <item>Webhook challenge/verification token handling (separate concern)</item>
    </out_of_scope>
    <affected_files>
      <file>apps/api/src/integrations/whatsapp/whatsapp-webhook.controller.ts</file>
      <file>apps/api/src/integrations/whatsapp/whatsapp-webhook.controller.spec.ts</file>
      <file>.env.example</file>
    </affected_files>
    <dependencies>
      <dependency>None - independent security fix</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Correct the webhook signature verification to use Meta's App Secret for
      computing the HMAC signature. The signature is computed as HMAC-SHA256 of
      the raw request body using the App Secret as the key, then compared against
      the X-Hub-Signature-256 header.
    </approach>
    <steps>
      <step order="1">
        <description>Understand Meta's signature verification</description>
        <details>
          Meta signs webhooks using HMAC-SHA256 with the App Secret. The signature
          is sent in the X-Hub-Signature-256 header as "sha256=<signature>".

          Key distinctions:
          - App Secret: Used for signing webhooks (what we need)
          - Verify Token: Used only for webhook URL verification challenge
          - Access Token: Used for API calls, NOT for webhook verification
        </details>
      </step>
      <step order="2">
        <description>Add proper environment variable</description>
        <details>
          Create a dedicated environment variable for the WhatsApp App Secret
          used in webhook signature verification.
        </details>
        <code_example>
```bash
# .env.example
# WhatsApp Integration Configuration

# REQUIRED: App Secret from Meta Developer Console
# Used to verify webhook signatures (HMAC-SHA256)
# Find at: https://developers.facebook.com/apps/{app-id}/settings/basic/
WHATSAPP_APP_SECRET=

# Verify Token for webhook URL verification (different from App Secret!)
# This is a custom token you set in Meta webhook configuration
WHATSAPP_VERIFY_TOKEN=

# Access Token for API calls (NOT for webhook verification)
WHATSAPP_ACCESS_TOKEN=
```
        </code_example>
      </step>
      <step order="3">
        <description>Implement correct signature verification</description>
        <details>
          Fix the webhook controller to use the App Secret for HMAC verification
          with timing-safe comparison.
        </details>
        <code_example>
```typescript
// apps/api/src/integrations/whatsapp/whatsapp-webhook.controller.ts
import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Headers,
  RawBodyRequest,
  Req,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { Request } from 'express';

@Controller('webhooks/whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);
  private readonly appSecret: string;
  private readonly verifyToken: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly whatsappService: WhatsAppService,
  ) {
    // App Secret for webhook signature verification
    this.appSecret = this.configService.get<string>('WHATSAPP_APP_SECRET');

    if (!this.appSecret) {
      throw new Error(
        'CRITICAL: WHATSAPP_APP_SECRET is required for webhook signature verification. ' +
        'Find this in Meta Developer Console under App Settings > Basic.'
      );
    }

    // Verify Token for webhook URL verification (challenge/response)
    this.verifyToken = this.configService.get<string>('WHATSAPP_VERIFY_TOKEN');

    if (!this.verifyToken) {
      throw new Error(
        'WHATSAPP_VERIFY_TOKEN is required for webhook URL verification.'
      );
    }
  }

  /**
   * Webhook URL verification (GET request from Meta)
   * Uses WHATSAPP_VERIFY_TOKEN
   */
  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ): string {
    if (mode === 'subscribe' && this.secureCompare(token, this.verifyToken)) {
      this.logger.log('Webhook verification successful');
      return challenge;
    }

    this.logger.warn('Webhook verification failed', { mode, tokenMatch: false });
    throw new UnauthorizedException('Webhook verification failed');
  }

  /**
   * Webhook event handler (POST request from Meta)
   * Verifies signature using WHATSAPP_APP_SECRET
   */
  @Post()
  async handleWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-hub-signature-256') signature: string,
    @Body() body: any,
  ): Promise<{ status: string }> {
    // Verify signature
    if (!this.verifySignature(req.rawBody, signature)) {
      this.logger.warn('Invalid webhook signature', {
        hasSignature: !!signature,
        bodyLength: req.rawBody?.length,
      });
      throw new UnauthorizedException('Invalid webhook signature');
    }

    this.logger.debug('Webhook signature verified successfully');

    // Process the webhook
    await this.whatsappService.processWebhook(body);

    return { status: 'ok' };
  }

  /**
   * Verifies the webhook signature using HMAC-SHA256
   * @param rawBody - Raw request body as Buffer
   * @param signature - X-Hub-Signature-256 header value
   */
  private verifySignature(rawBody: Buffer, signature: string): boolean {
    if (!rawBody || !signature) {
      return false;
    }

    // Signature format: "sha256=<hex_signature>"
    if (!signature.startsWith('sha256=')) {
      this.logger.warn('Invalid signature format', {
        startsWithSha256: signature.startsWith('sha256=')
      });
      return false;
    }

    const receivedSignature = signature.slice(7); // Remove "sha256=" prefix

    // Compute expected signature using App Secret
    const expectedSignature = crypto
      .createHmac('sha256', this.appSecret)
      .update(rawBody)
      .digest('hex');

    // Use timing-safe comparison to prevent timing attacks
    return this.secureCompare(receivedSignature, expectedSignature);
  }

  /**
   * Timing-safe string comparison
   */
  private secureCompare(a: string, b: string): boolean {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }

    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    if (bufA.length !== bufB.length) {
      // Still do comparison to maintain constant time
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  }
}
```
        </code_example>
      </step>
      <step order="4">
        <description>Configure raw body parsing</description>
        <details>
          Ensure the application preserves the raw request body for signature
          verification. This typically requires middleware configuration.
        </details>
        <code_example>
```typescript
// main.ts or app module configuration
import { NestFactory } from '@nestjs/core';
import { json } from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Configure body parser to preserve raw body for webhook verification
  app.use(
    json({
      verify: (req: any, res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  await app.listen(3000);
}
```
        </code_example>
      </step>
      <step order="5">
        <description>Add security logging</description>
        <details>
          Log signature verification failures for security monitoring,
          without logging sensitive data.
        </details>
      </step>
      <step order="6">
        <description>Write comprehensive tests</description>
        <details>
          Test valid signatures, invalid signatures, missing signatures,
          malformed headers, and timing attack resistance.
        </details>
      </step>
    </steps>
    <technical_notes>
      - App Secret is found in Meta Developer Console: App Settings > Basic
      - Never confuse App Secret, Verify Token, and Access Token
      - Raw body MUST be used for signature verification (before JSON parsing)
      - Use timing-safe comparison to prevent timing attacks
      - Log verification failures for security monitoring
      - Consider rate limiting failed verification attempts
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <id>TC-001</id>
        <description>Valid signature passes verification</description>
        <expected_result>Webhook processed successfully</expected_result>
      </test_case>
      <test_case>
        <id>TC-002</id>
        <description>Invalid signature is rejected</description>
        <expected_result>401 Unauthorized returned</expected_result>
      </test_case>
      <test_case>
        <id>TC-003</id>
        <description>Missing signature header is rejected</description>
        <expected_result>401 Unauthorized returned</expected_result>
      </test_case>
      <test_case>
        <id>TC-004</id>
        <description>Malformed signature format is rejected</description>
        <expected_result>401 Unauthorized returned</expected_result>
      </test_case>
      <test_case>
        <id>TC-005</id>
        <description>Signature from wrong key is rejected</description>
        <expected_result>401 Unauthorized returned</expected_result>
      </test_case>
      <test_case>
        <id>TC-006</id>
        <description>Service fails to start without WHATSAPP_APP_SECRET</description>
        <expected_result>Configuration error thrown</expected_result>
      </test_case>
      <test_case>
        <id>TC-007</id>
        <description>Verify token endpoint uses correct token</description>
        <expected_result>Challenge returned for valid token</expected_result>
      </test_case>
      <test_case>
        <id>TC-008</id>
        <description>Verification failures are logged</description>
        <expected_result>Warning log entry created</expected_result>
      </test_case>
    </test_cases>
    <acceptance_criteria>
      <criterion>Webhook signature verification uses WHATSAPP_APP_SECRET</criterion>
      <criterion>Signature computed from raw request body</criterion>
      <criterion>Timing-safe comparison used</criterion>
      <criterion>Service fails to start without required secrets</criterion>
      <criterion>Clear distinction between App Secret and Verify Token</criterion>
      <criterion>Verification failures logged for security monitoring</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item>Correct key (App Secret) used for signature verification</item>
      <item>WHATSAPP_APP_SECRET environment variable added</item>
      <item>Fail-fast validation for required configuration</item>
      <item>Raw body preserved and used for verification</item>
      <item>Timing-safe comparison implemented</item>
      <item>Security logging for verification failures</item>
      <item>Clear documentation of key purposes</item>
      <item>Unit tests for all verification scenarios</item>
      <item>Integration test with real Meta signature format</item>
      <item>.env.example updated with all WhatsApp variables</item>
      <item>Code reviewed</item>
    </checklist>
    <security_review_required>true</security_review_required>
  </definition_of_done>
</task_specification>
