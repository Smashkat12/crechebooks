<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-INT-001</task_id>
    <title>Remove Default Encryption Key Fallback</title>
    <priority>CRITICAL</priority>
    <category>Security</category>
    <phase>16-remediation</phase>
    <status>DONE</status>
    <estimated_effort>2 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <assignee>unassigned</assignee>
    <tags>
      <tag>security</tag>
      <tag>encryption</tag>
      <tag>critical-fix</tag>
      <tag>fail-fast</tag>
    </tags>
  </metadata>

  <context>
    <background>
      The EncryptionService currently falls back to a default encryption key when the
      ENCRYPTION_KEY environment variable is not set. This is a critical security
      vulnerability as it means production systems could inadvertently use a known,
      insecure default key for encrypting sensitive data like API tokens, credentials,
      and PII.
    </background>
    <issue_description>
      CRITICAL - EncryptionService falls back to default key if env missing. Any attacker
      who discovers the default key (through source code review, error messages, or other
      means) could decrypt all data encrypted with it.
    </issue_description>
    <business_impact>
      - Complete compromise of encrypted data if default key is discovered
      - Regulatory non-compliance (GDPR, PCI-DSS, HIPAA)
      - Potential data breach affecting all customers
      - Legal liability and reputational damage
    </business_impact>
    <technical_debt>
      This is a security anti-pattern that must be eliminated. Fail-fast behavior is
      required for cryptographic configuration to prevent silent security degradation.
    </technical_debt>
  </context>

  <scope>
    <in_scope>
      <item>Remove default encryption key fallback from EncryptionService</item>
      <item>Implement fail-fast validation on service initialization</item>
      <item>Add clear error messaging for missing configuration</item>
      <item>Update environment variable documentation</item>
      <item>Add startup validation test</item>
    </in_scope>
    <out_of_scope>
      <item>Key rotation implementation (separate task)</item>
      <item>Key management system integration</item>
      <item>Migration of existing encrypted data</item>
    </out_of_scope>
    <affected_files>
      <file>apps/api/src/common/services/encryption.service.ts</file>
      <file>apps/api/src/common/services/encryption.service.spec.ts</file>
      <file>.env.example</file>
    </affected_files>
    <dependencies>
      <dependency>None - this is a foundational security fix</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Remove the fallback default key and implement strict validation that throws an
      error during service construction if ENCRYPTION_KEY is not set. This ensures the
      application fails to start rather than operating with insecure defaults.
    </approach>
    <steps>
      <step order="1">
        <description>Locate and remove default key fallback</description>
        <details>
          Find the constructor or initialization code in EncryptionService that sets
          a default key when ENCRYPTION_KEY is missing. Remove the fallback entirely.
        </details>
      </step>
      <step order="2">
        <description>Implement fail-fast validation</description>
        <details>
          Add validation in the constructor that checks for ENCRYPTION_KEY and throws
          a descriptive ConfigurationError if not present.
        </details>
        <code_example>
```typescript
@Injectable()
export class EncryptionService {
  private readonly encryptionKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>('ENCRYPTION_KEY');

    if (!key) {
      throw new Error(
        'CRITICAL: ENCRYPTION_KEY environment variable is required but not set. ' +
        'Application cannot start without proper encryption configuration. ' +
        'Please set ENCRYPTION_KEY in your environment variables.'
      );
    }

    if (key.length < 32) {
      throw new Error(
        'CRITICAL: ENCRYPTION_KEY must be at least 32 characters for secure encryption.'
      );
    }

    this.encryptionKey = Buffer.from(key, 'utf-8');
  }
}
```
        </code_example>
      </step>
      <step order="3">
        <description>Add key strength validation</description>
        <details>
          Validate that the provided key meets minimum security requirements
          (minimum length, entropy checks if feasible).
        </details>
      </step>
      <step order="4">
        <description>Update error handling</description>
        <details>
          Ensure the error is logged appropriately and the application terminates
          cleanly with a clear error message.
        </details>
      </step>
      <step order="5">
        <description>Update documentation</description>
        <details>
          Update .env.example and any deployment documentation to clearly indicate
          ENCRYPTION_KEY is required and provide guidance on generating secure keys.
        </details>
        <code_example>
```bash
# .env.example
# REQUIRED: 256-bit encryption key for sensitive data
# Generate with: openssl rand -base64 32
ENCRYPTION_KEY=
```
        </code_example>
      </step>
      <step order="6">
        <description>Add unit tests</description>
        <details>
          Write tests that verify the service throws on missing key, throws on weak
          key, and initializes correctly with valid key.
        </details>
      </step>
    </steps>
    <technical_notes>
      - Use process.exit(1) or allow NestJS to handle the initialization error
      - Log the error with appropriate severity (CRITICAL/FATAL)
      - Do not log the actual key value in any error messages
      - Consider adding a startup health check that validates encryption is configured
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <id>TC-001</id>
        <description>Service throws error when ENCRYPTION_KEY is not set</description>
        <expected_result>ConfigurationError thrown with descriptive message</expected_result>
      </test_case>
      <test_case>
        <id>TC-002</id>
        <description>Service throws error when ENCRYPTION_KEY is too short</description>
        <expected_result>ConfigurationError thrown indicating minimum length requirement</expected_result>
      </test_case>
      <test_case>
        <id>TC-003</id>
        <description>Service initializes successfully with valid key</description>
        <expected_result>Service instance created without errors</expected_result>
      </test_case>
      <test_case>
        <id>TC-004</id>
        <description>Application fails to start without ENCRYPTION_KEY</description>
        <expected_result>Application exits with non-zero code and clear error</expected_result>
      </test_case>
      <test_case>
        <id>TC-005</id>
        <description>Error message does not contain actual key value</description>
        <expected_result>Logs contain no sensitive data</expected_result>
      </test_case>
    </test_cases>
    <acceptance_criteria>
      <criterion>No default encryption key exists in the codebase</criterion>
      <criterion>Application fails to start if ENCRYPTION_KEY is not set</criterion>
      <criterion>Clear error message guides developers on proper configuration</criterion>
      <criterion>All existing encryption/decryption tests pass with valid key</criterion>
      <criterion>Documentation updated with key generation instructions</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item>Default encryption key fallback removed from EncryptionService</item>
      <item>Fail-fast validation implemented in constructor</item>
      <item>Key length/strength validation added</item>
      <item>Error messages are clear and actionable</item>
      <item>No sensitive data logged in error messages</item>
      <item>Unit tests added for all validation scenarios</item>
      <item>Integration test confirms app won't start without key</item>
      <item>.env.example updated with ENCRYPTION_KEY requirement</item>
      <item>Code reviewed by security-aware team member</item>
      <item>All CI/CD pipelines pass</item>
    </checklist>
    <security_review_required>true</security_review_required>
  </definition_of_done>
</task_specification>
