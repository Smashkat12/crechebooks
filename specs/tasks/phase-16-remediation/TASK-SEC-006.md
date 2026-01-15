# TASK-SEC-006: Remove Webhook Signature Bypass

```xml
<task_spec id="TASK-SEC-006" version="1.0">
  <metadata>
    <title>Remove Webhook Signature Bypass</title>
    <priority>CRITICAL</priority>
    <estimated_tokens>4000</estimated_tokens>
    <domain>security</domain>
    <phase>16</phase>
    <status>DONE</status>
    <depends_on>none</depends_on>
  </metadata>

  <context>
    <background>
      Webhook signature verification ensures that incoming webhook requests genuinely
      originate from trusted sources (e.g., Stripe, GitHub). Bypassing this verification
      in development mode creates a critical vulnerability that can be exploited if
      dev code reaches production, allowing attackers to forge webhook events and
      manipulate application state (e.g., fake payment confirmations).
    </background>
    <current_state>
      Webhook signature verification bypassed in development:
      - Conditional check skips verification when NODE_ENV !== 'production'
      - Attackers can send forged webhooks if bypass reaches production
      - No signature verification in local development creates bad habits
      - Test webhooks accepted without validation
    </current_state>
    <target_state>
      Signature verification always enforced:
      - All webhook requests verified regardless of environment
      - Development uses test/sandbox keys from providers
      - Stripe test mode webhooks use test webhook secret
      - Clear separation between test and production secrets
      - No conditional bypass code in codebase
    </target_state>
  </context>

  <scope>
    <files_to_modify>
      <file path="apps/api/src/webhooks/stripe.controller.ts" action="modify">
        Remove dev mode signature bypass, always verify
      </file>
      <file path="apps/api/src/webhooks/stripe.service.ts" action="modify">
        Update signature verification to always execute
      </file>
      <file path="apps/api/src/webhooks/webhooks.module.ts" action="modify">
        Update module configuration for proper secret injection
      </file>
      <file path="apps/api/src/webhooks/github.controller.ts" action="modify">
        If exists, remove any similar bypass patterns
      </file>
    </files_to_modify>
    <files_to_create>
      <file path="apps/api/src/webhooks/webhook-signature.guard.ts">
        Reusable guard for webhook signature verification
      </file>
      <file path="apps/api/src/webhooks/webhook-signature.service.ts">
        Service to handle signature verification for different providers
      </file>
      <file path="scripts/setup-stripe-test-webhook.sh">
        Script to set up Stripe CLI for local webhook testing
      </file>
    </files_to_create>
  </scope>

  <implementation>
    <step order="1">
      Audit webhook handlers for bypass patterns:
      - Search for NODE_ENV checks in webhook code
      - Find any "skip verification" logic
      - Document all webhook endpoints and their providers
    </step>
    <step order="2">
      Remove all signature verification bypasses:
      - Delete conditional checks that skip verification
      - Remove any "dev mode" webhook acceptance
      - Ensure verification code path always executes
    </step>
    <step order="3">
      Create webhook signature verification service:
      - Support multiple providers (Stripe, GitHub, etc.)
      - Implement provider-specific verification algorithms
      - Use constant-time comparison for signatures
      - Throw clear exceptions on verification failure
    </step>
    <step order="4">
      Create webhook signature guard:
      - Implement CanActivate interface
      - Extract signature from appropriate header per provider
      - Verify using WebhookSignatureService
      - Log verification failures with request details
    </step>
    <step order="5">
      Configure environment-based webhook secrets:
      - STRIPE_WEBHOOK_SECRET_LIVE: Production webhook secret
      - STRIPE_WEBHOOK_SECRET_TEST: Test/development webhook secret
      - Select based on Stripe mode, not NODE_ENV
    </step>
    <step order="6">
      Set up local development webhook testing:
      - Document Stripe CLI usage for local webhooks
      - Create setup script for webhook forwarding
      - Configure test webhook secret in .env.development
      ```bash
      # Install Stripe CLI and forward webhooks
      stripe listen --forward-to localhost:3000/webhooks/stripe
      ```
    </step>
    <step order="7">
      Update Stripe webhook handler:
      - Apply WebhookSignatureGuard to endpoint
      - Use raw body for signature verification
      - Parse event only after verification succeeds
    </step>
    <step order="8">
      Add webhook verification tests:
      - Test with valid signatures (should succeed)
      - Test with invalid signatures (should reject)
      - Test with missing signatures (should reject)
      - Test with tampered payloads (should reject)
    </step>
    <step order="9">
      Implement webhook verification logging:
      - Log successful verifications (info level)
      - Log failed verifications (warn level with details)
      - Alert on repeated failures (potential attack)
    </step>
  </implementation>

  <verification>
    <test_command>npm run test -- --grep "webhook" && npm run test:e2e -- --grep "webhook"</test_command>
    <acceptance_criteria>
      <criterion>No signature bypass code exists in codebase</criterion>
      <criterion>All webhook requests verified regardless of environment</criterion>
      <criterion>Invalid signatures rejected with 400/401 response</criterion>
      <criterion>Missing signatures rejected</criterion>
      <criterion>Tampered payloads rejected</criterion>
      <criterion>Valid test webhooks accepted with test secret</criterion>
      <criterion>Valid production webhooks accepted with production secret</criterion>
      <criterion>Local development works with Stripe CLI</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <item>All signature bypass code removed</item>
    <item>WebhookSignatureGuard implemented and applied</item>
    <item>WebhookSignatureService supporting all providers</item>
    <item>Environment variables configured for test/prod secrets</item>
    <item>Local webhook testing documented and scripted</item>
    <item>Unit tests for signature verification passing</item>
    <item>Integration tests with Stripe CLI passing</item>
    <item>Security review confirming no bypasses remain</item>
    <item>grep/search confirms no NODE_ENV checks in webhook code</item>
    <item>Documentation for webhook development workflow</item>
  </definition_of_done>
</task_spec>
```
