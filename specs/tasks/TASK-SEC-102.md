<task_spec id="TASK-SEC-102" version="1.0">

<metadata>
  <title>Webhook Signature Validation</title>
  <status>ready</status>
  <phase>usacf-sprint-3</phase>
  <layer>security</layer>
  <sequence>207</sequence>
  <priority>P1-HIGH</priority>
  <sprint>3</sprint>
  <estimated_effort>3 days (24 hours)</estimated_effort>
  <implements>
    <opportunity_ref>OP009</opportunity_ref>
    <gap_ref>S005</gap_ref>
    <vulnerability_ref>V004</vulnerability_ref>
  </implements>
  <depends_on>
    <!-- No strict dependencies -->
  </depends_on>
  <estimated_complexity>medium</estimated_complexity>
  <confidence>92%</confidence>
  <cvss_score>5.5</cvss_score>
  <usacf_analysis>docs/usacf-analysis/04-synthesis.md#OP009</usacf_analysis>
</metadata>

<project_context>
  <overview>
    CrecheBooks is a South African childcare center management SaaS platform.
    Multi-tenant architecture where every database query MUST include tenantId filter.
    Webhooks from Xero/SimplePay update financial data - must verify authenticity.
  </overview>

  <tech_stack>
    <backend>NestJS 10.x with TypeScript strict mode</backend>
    <orm>Prisma 5.x with PostgreSQL 15</orm>
    <crypto>Node.js crypto module for HMAC-SHA256</crypto>
    <testing>Jest for unit/integration, no mock data - use real signatures</testing>
  </tech_stack>

  <monorepo_structure>
    apps/api/        - NestJS API (this task's primary target)
    apps/web/        - React frontend
    packages/shared/ - Shared types and utilities
  </monorepo_structure>

  <critical_rules>
    <rule id="1">NO BACKWARDS COMPATIBILITY - fail fast, reject invalid signatures immediately</rule>
    <rule id="2">NO MOCK DATA in tests - use real HMAC signatures generated with test secrets</rule>
    <rule id="3">ROBUST ERROR LOGGING - log ALL failed signature validations with full context</rule>
    <rule id="4">TIMING SAFE - use crypto.timingSafeEqual to prevent timing attacks</rule>
    <rule id="5">RAW BODY - preserve raw body for signature calculation</rule>
  </critical_rules>

  <coding_patterns>
    <pattern name="guards">Security guards in apps/api/src/common/guards/</pattern>
    <pattern name="decorators">Custom decorators in apps/api/src/common/decorators/</pattern>
    <pattern name="middleware">Raw body middleware in apps/api/src/common/middleware/</pattern>
  </coding_patterns>

  <existing_webhook_structure>
    - Xero webhook at apps/api/src/api/webhooks/xero-webhook.controller.ts
    - SimplePay webhook at apps/api/src/api/webhooks/simplepay-webhook.controller.ts
    - Currently NO signature validation (this task adds it)
  </existing_webhook_structure>

  <provider_signature_formats>
    - Xero: x-xero-signature header, SHA256, base64 encoded
    - SimplePay: x-simplepay-signature header, SHA256, hex encoded
  </provider_signature_formats>
</project_context>

<executive_summary>
Implement HMAC signature validation for all incoming webhooks (Xero, SimplePay, Bank) to
prevent webhook spoofing attacks. Currently, webhooks are processed without verifying
authenticity, allowing attackers to inject malicious payloads.
</executive_summary>

<business_case>
  <problem>Webhooks processed without signature validation (CVSS 5.5)</problem>
  <solution>HMAC-SHA256 signature verification on all webhook endpoints</solution>
  <benefit>Block 100% of webhook spoofing attacks</benefit>
  <roi>Security hardening, compliance requirement</roi>
</business_case>

<context>
GAP S005: No request signing for webhooks.
Vulnerability V004: Webhook spoofing potential.

Current State:
```typescript
// VULNERABLE - no signature verification
@Post('/webhook/xero')
async handleXeroWebhook(@Body() payload: XeroWebhookPayload) {
  // Anyone can POST here and it will be processed!
  await this.processWebhook(payload);
}
```

Attack Vector:
- Attacker sends forged webhook with malicious invoice data
- System processes and stores invalid data
- Financial records corrupted
</context>

<input_context_files>
  <file purpose="xero_webhook">apps/api/src/api/webhooks/xero-webhook.controller.ts</file>
  <file purpose="simplepay_webhook">apps/api/src/api/webhooks/simplepay-webhook.controller.ts</file>
  <file purpose="usacf_gap_analysis">docs/usacf-analysis/02-gap-analysis.md</file>
</input_context_files>

<scope>
  <in_scope>
    - HMAC-SHA256 signature validation
    - Signature validation guard/middleware
    - Per-provider secret configuration
    - Timestamp validation (prevent replay)
    - Failed validation logging
    - Xero webhook verification
    - SimplePay webhook verification
    - Bank webhook verification (if applicable)
  </in_scope>
  <out_of_scope>
    - Webhook retry logic
    - Webhook delivery dashboard
    - Custom webhook endpoints
    - Rate limiting (separate task)
  </out_of_scope>
</scope>

<definition_of_done>
  <signatures>
    <signature file="apps/api/src/common/guards/webhook-signature.guard.ts">
      @Injectable()
      export class WebhookSignatureGuard implements CanActivate {
        constructor(private reflector: Reflector);

        canActivate(context: ExecutionContext): boolean;

        validateSignature(
          payload: string,
          signature: string,
          secret: string,
          algorithm?: string
        ): boolean;

        validateTimestamp(
          timestamp: string,
          maxAgeSeconds?: number
        ): boolean;
      }
    </signature>
    <signature file="apps/api/src/common/decorators/webhook-signature.decorator.ts">
      export const WebhookSignature = (
        provider: 'xero' | 'simplepay' | 'bank',
        options?: WebhookSignatureOptions
      ) => SetMetadata(WEBHOOK_SIGNATURE_KEY, { provider, ...options });
    </signature>
    <signature file="apps/api/src/api/webhooks/xero-webhook.controller.ts">
      @Controller('webhooks/xero')
      @UseGuards(WebhookSignatureGuard)
      export class XeroWebhookController {
        @Post()
        @WebhookSignature('xero')
        async handleWebhook(
          @Body() payload: XeroWebhookPayload,
          @Headers('x-xero-signature') signature: string
        ): Promise&lt;void&gt;;
      }
    </signature>
  </signatures>

  <constraints>
    - Signature validation must be constant-time (prevent timing attacks)
    - Timestamp tolerance: 5 minutes
    - Failed validations must be logged with details
    - Secrets must be stored in environment variables
    - Different secrets per provider
    - Raw body access required for signature calculation
  </constraints>

  <verification>
    - Valid signatures accepted
    - Invalid signatures rejected with 401
    - Expired timestamps rejected
    - Replay attacks blocked
    - All failures logged
    - No timing leak in signature comparison
  </verification>
</definition_of_done>

<implementation_approach>
  <step order="1">
    Create WebhookSignatureGuard with HMAC validation:
    ```typescript
    import { timingSafeEqual, createHmac } from 'crypto';

    validateSignature(
      payload: string,
      signature: string,
      secret: string,
      algorithm = 'sha256'
    ): boolean {
      const expected = createHmac(algorithm, secret)
        .update(payload)
        .digest('base64');

      return timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected)
      );
    }
    ```
  </step>
  <step order="2">
    Create @WebhookSignature decorator for metadata
  </step>
  <step order="3">
    Configure raw body parser for webhook routes
  </step>
  <step order="4">
    Apply guard to all webhook controllers
  </step>
  <step order="5">
    Add failed validation logging
  </step>
  <step order="6">
    Configure secrets per environment
  </step>
</implementation_approach>

<provider_specifications>
  <provider name="xero">
    <header>x-xero-signature</header>
    <algorithm>sha256</algorithm>
    <encoding>base64</encoding>
    <docs>https://developer.xero.com/documentation/webhooks</docs>
  </provider>
  <provider name="simplepay">
    <header>x-simplepay-signature</header>
    <algorithm>sha256</algorithm>
    <encoding>hex</encoding>
  </provider>
</provider_specifications>

<files_to_create>
  <file path="apps/api/src/common/guards/webhook-signature.guard.ts">
    Webhook signature validation guard
  </file>
  <file path="apps/api/src/common/decorators/webhook-signature.decorator.ts">
    Webhook signature decorator
  </file>
  <file path="apps/api/src/common/middleware/raw-body.middleware.ts">
    Raw body preservation middleware
  </file>
  <file path="apps/api/src/common/guards/__tests__/webhook-signature.guard.spec.ts">
    Guard unit tests
  </file>
  <file path="apps/api/tests/integration/webhook-security.spec.ts">
    Integration tests for webhook security
  </file>
</files_to_create>

<files_to_modify>
  <file path="apps/api/src/api/webhooks/xero-webhook.controller.ts">
    Apply signature validation
  </file>
  <file path="apps/api/src/api/webhooks/simplepay-webhook.controller.ts">
    Apply signature validation
  </file>
  <file path="apps/api/src/main.ts">
    Configure raw body parser
  </file>
  <file path="apps/api/src/config/configuration.ts">
    Add webhook secrets configuration
  </file>
</files_to_modify>

<validation_criteria>
  <criterion>Valid Xero signatures accepted</criterion>
  <criterion>Invalid signatures return 401 Unauthorized</criterion>
  <criterion>Expired timestamps rejected</criterion>
  <criterion>Signature comparison is constant-time</criterion>
  <criterion>All failures logged with details</criterion>
  <criterion>All existing webhook tests pass</criterion>
</validation_criteria>

<test_commands>
  <command>npm run build</command>
  <command>npm run lint</command>
  <command>npm run test -- --testPathPattern="webhook-signature" --verbose</command>
  <command>npm run test -- --testPathPattern="webhook" --verbose</command>
</test_commands>

<success_metrics>
  <metric name="spoofing_blocked">100%</metric>
  <metric name="valid_webhooks_processed">100%</metric>
  <metric name="timing_attack_resistant">Yes</metric>
</success_metrics>

<security_testing>
  <test name="signature_spoofing">
    Send webhook with incorrect signature, verify rejected
  </test>
  <test name="replay_attack">
    Resend valid webhook after timestamp expires, verify rejected
  </test>
  <test name="timing_attack">
    Measure response time variance, must be constant
  </test>
</security_testing>

<rollback_plan>
  - Feature flag: WEBHOOK_SIGNATURE_VALIDATION (default: true)
  - Disable guard by removing from providers
  - Warning: Disabling creates security vulnerability
</rollback_plan>

</task_spec>
