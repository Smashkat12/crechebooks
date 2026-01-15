<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-INT-002</task_id>
    <title>Remove Default OAuth State Key</title>
    <priority>CRITICAL</priority>
    <category>Security</category>
    <phase>16-remediation</phase>
    <status>DONE</status>
    <estimated_effort>2 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <assignee>unassigned</assignee>
    <tags>
      <tag>security</tag>
      <tag>oauth</tag>
      <tag>xero-integration</tag>
      <tag>critical-fix</tag>
      <tag>csrf-protection</tag>
    </tags>
  </metadata>

  <context>
    <background>
      The Xero OAuth integration uses encryption for the state parameter to prevent
      CSRF attacks during the OAuth flow. However, the current implementation falls
      back to a default encryption key when XERO_STATE_KEY is not configured,
      defeating the security purpose of the state parameter.
    </background>
    <issue_description>
      CRITICAL - Xero OAuth uses default encryption for state parameter. This allows
      attackers to forge valid state parameters and potentially hijack OAuth flows,
      leading to account takeover or unauthorized access to Xero financial data.
    </issue_description>
    <business_impact>
      - OAuth CSRF protection bypassed with known default key
      - Potential unauthorized access to customer financial data in Xero
      - Compliance violations for financial integrations
      - Risk of fraudulent transactions through compromised accounts
    </business_impact>
    <technical_debt>
      OAuth state parameter security is a well-documented requirement (RFC 6749).
      Using a default key creates a false sense of security.
    </technical_debt>
  </context>

  <scope>
    <in_scope>
      <item>Remove default state key fallback from Xero auth service</item>
      <item>Implement fail-fast validation for XERO_STATE_KEY</item>
      <item>Add clear error messaging for missing configuration</item>
      <item>Ensure state encryption uses cryptographically secure methods</item>
      <item>Update Xero integration documentation</item>
    </in_scope>
    <out_of_scope>
      <item>Other OAuth integrations (handled in separate tasks)</item>
      <item>Xero API changes or token management</item>
      <item>State parameter format changes</item>
    </out_of_scope>
    <affected_files>
      <file>apps/api/src/integrations/xero/xero-auth.service.ts</file>
      <file>apps/api/src/integrations/xero/xero-auth.service.spec.ts</file>
      <file>.env.example</file>
    </affected_files>
    <dependencies>
      <dependency>TASK-INT-001 - Should use consistent encryption approach</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Remove the default state key and require explicit configuration of XERO_STATE_KEY.
      The service should fail to initialize if this key is not provided, preventing
      the OAuth flow from operating with insecure defaults.
    </approach>
    <steps>
      <step order="1">
        <description>Identify default key usage in Xero auth</description>
        <details>
          Locate where the default state encryption key is defined and used in the
          Xero authentication service. Document all locations that reference it.
        </details>
      </step>
      <step order="2">
        <description>Remove default key fallback</description>
        <details>
          Remove the fallback logic that uses a default key when XERO_STATE_KEY
          is not configured.
        </details>
      </step>
      <step order="3">
        <description>Implement fail-fast validation</description>
        <details>
          Add constructor validation that requires XERO_STATE_KEY to be set.
        </details>
        <code_example>
```typescript
@Injectable()
export class XeroAuthService {
  private readonly stateKey: Buffer;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    const stateKey = this.configService.get<string>('XERO_STATE_KEY');

    if (!stateKey) {
      throw new Error(
        'CRITICAL: XERO_STATE_KEY environment variable is required for secure OAuth. ' +
        'This key is used to encrypt/decrypt the OAuth state parameter to prevent CSRF attacks. ' +
        'Generate a secure key with: openssl rand -base64 32'
      );
    }

    if (stateKey.length < 32) {
      throw new Error(
        'CRITICAL: XERO_STATE_KEY must be at least 32 characters for secure encryption.'
      );
    }

    this.stateKey = Buffer.from(stateKey, 'utf-8');
  }

  generateState(userId: string, returnUrl: string): string {
    const stateData = JSON.stringify({
      userId,
      returnUrl,
      nonce: crypto.randomBytes(16).toString('hex'),
      timestamp: Date.now(),
    });

    // Use authenticated encryption (AES-GCM)
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.stateKey.slice(0, 32), iv);

    let encrypted = cipher.update(stateData, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'base64')])
      .toString('base64url');
  }

  validateState(encryptedState: string): { userId: string; returnUrl: string } {
    try {
      const data = Buffer.from(encryptedState, 'base64url');
      const iv = data.slice(0, 12);
      const authTag = data.slice(12, 28);
      const encrypted = data.slice(28);

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.stateKey.slice(0, 32), iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, undefined, 'utf8');
      decrypted += decipher.final('utf8');

      const stateData = JSON.parse(decrypted);

      // Validate timestamp to prevent replay attacks
      const maxAge = 10 * 60 * 1000; // 10 minutes
      if (Date.now() - stateData.timestamp > maxAge) {
        throw new Error('OAuth state has expired');
      }

      return {
        userId: stateData.userId,
        returnUrl: stateData.returnUrl,
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid OAuth state parameter');
    }
  }
}
```
        </code_example>
      </step>
      <step order="4">
        <description>Add state expiration validation</description>
        <details>
          Ensure state parameters have a timestamp and are validated for freshness
          to prevent replay attacks.
        </details>
      </step>
      <step order="5">
        <description>Update environment documentation</description>
        <details>
          Add XERO_STATE_KEY to .env.example with generation instructions.
        </details>
        <code_example>
```bash
# .env.example
# REQUIRED for Xero integration: OAuth state encryption key
# Used to protect against CSRF attacks in OAuth flow
# Generate with: openssl rand -base64 32
XERO_STATE_KEY=
```
        </code_example>
      </step>
      <step order="6">
        <description>Write comprehensive tests</description>
        <details>
          Test missing key, weak key, state generation, state validation,
          expired state handling, and tampered state detection.
        </details>
      </step>
    </steps>
    <technical_notes>
      - Use AES-256-GCM for authenticated encryption
      - Include timestamp in state for replay attack prevention
      - Include nonce for uniqueness
      - Use base64url encoding for URL safety
      - State should expire after reasonable time (5-10 minutes)
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <id>TC-001</id>
        <description>Service throws error when XERO_STATE_KEY is not set</description>
        <expected_result>ConfigurationError thrown with descriptive message</expected_result>
      </test_case>
      <test_case>
        <id>TC-002</id>
        <description>Service throws error when XERO_STATE_KEY is too short</description>
        <expected_result>ConfigurationError thrown indicating minimum length</expected_result>
      </test_case>
      <test_case>
        <id>TC-003</id>
        <description>State generation produces unique values</description>
        <expected_result>Multiple calls produce different encrypted states</expected_result>
      </test_case>
      <test_case>
        <id>TC-004</id>
        <description>Valid state can be decrypted and validated</description>
        <expected_result>Original data recovered from encrypted state</expected_result>
      </test_case>
      <test_case>
        <id>TC-005</id>
        <description>Tampered state is rejected</description>
        <expected_result>UnauthorizedException thrown for modified state</expected_result>
      </test_case>
      <test_case>
        <id>TC-006</id>
        <description>Expired state is rejected</description>
        <expected_result>UnauthorizedException thrown for old state</expected_result>
      </test_case>
      <test_case>
        <id>TC-007</id>
        <description>State from different key is rejected</description>
        <expected_result>UnauthorizedException thrown for wrong key</expected_result>
      </test_case>
    </test_cases>
    <acceptance_criteria>
      <criterion>No default state key exists in the codebase</criterion>
      <criterion>OAuth flow fails if XERO_STATE_KEY not configured</criterion>
      <criterion>State uses authenticated encryption (AES-GCM)</criterion>
      <criterion>State includes expiration validation</criterion>
      <criterion>Tampered states are detected and rejected</criterion>
      <criterion>Documentation updated with key requirements</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item>Default state key fallback removed</item>
      <item>Fail-fast validation implemented</item>
      <item>Authenticated encryption (AES-GCM) used for state</item>
      <item>State expiration validation added</item>
      <item>Replay attack prevention implemented</item>
      <item>Unit tests cover all security scenarios</item>
      <item>Integration test validates OAuth flow security</item>
      <item>.env.example updated with XERO_STATE_KEY</item>
      <item>Code reviewed by security-aware team member</item>
      <item>All CI/CD pipelines pass</item>
    </checklist>
    <security_review_required>true</security_review_required>
  </definition_of_done>
</task_specification>
