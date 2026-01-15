<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-INT-004</task_id>
    <title>Fix Static Salt in Key Derivation</title>
    <priority>HIGH</priority>
    <category>Security</category>
    <phase>16-remediation</phase>
    <status>DONE</status>
    <estimated_effort>4 hours</estimated_effort>
    <created_date>2026-01-15</created_date>
    <assignee>unassigned</assignee>
    <tags>
      <tag>security</tag>
      <tag>encryption</tag>
      <tag>key-derivation</tag>
      <tag>salt</tag>
      <tag>pbkdf2</tag>
    </tags>
  </metadata>

  <context>
    <background>
      The current encryption implementation uses a static, hardcoded salt value in
      key derivation. This defeats the purpose of salting, which is to ensure that
      even identical passwords/keys produce different derived keys. A static salt
      enables precomputation attacks and means that if one key is compromised, the
      attack can be replicated against all encrypted data.
    </background>
    <issue_description>
      HIGH - Static salt defeats key derivation purpose. The same salt is used for
      all key derivation operations, making rainbow table attacks feasible and
      reducing the security of the key derivation function significantly.
    </issue_description>
    <business_impact>
      - Reduced protection against brute-force attacks
      - If master key is weak, all derived keys vulnerable to precomputation
      - One successful attack can be replicated against all encrypted records
      - Security audit findings and compliance concerns
    </business_impact>
    <technical_debt>
      Static salts are a well-known anti-pattern. Proper salt management requires
      generating unique salts per record and storing them alongside encrypted data.
    </technical_debt>
  </context>

  <scope>
    <in_scope>
      <item>Implement per-record random salt generation</item>
      <item>Update encrypted data format to include salt</item>
      <item>Modify encryption/decryption to handle salt properly</item>
      <item>Create migration strategy for existing data</item>
      <item>Update key derivation to use random salts</item>
    </in_scope>
    <out_of_scope>
      <item>Key rotation implementation</item>
      <item>External key management system integration</item>
      <item>Backward compatibility layer for old format (deprecated immediately)</item>
    </out_of_scope>
    <affected_files>
      <file>apps/api/src/common/services/encryption.service.ts</file>
      <file>apps/api/src/common/utils/crypto.utils.ts</file>
      <file>apps/api/src/common/services/encryption.service.spec.ts</file>
    </affected_files>
    <dependencies>
      <dependency>TASK-INT-003 - Standardized encryption implementation</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Implement proper salt management by generating a unique random salt for each
      encryption operation. The salt is stored alongside the encrypted data in a
      structured format. During decryption, the salt is extracted and used for
      key derivation before decrypting the data.
    </approach>
    <steps>
      <step order="1">
        <description>Design new encrypted data format</description>
        <details>
          Create a versioned format that includes salt, IV, auth tag, and ciphertext
          in a structured manner that supports future upgrades.
        </details>
        <code_example>
```typescript
// New encrypted data format with salt
export interface EncryptedDataV2 {
  version: 2;
  salt: string;      // Base64 encoded 16-byte random salt
  iv: string;        // Base64 encoded 12-byte IV
  authTag: string;   // Base64 encoded 16-byte auth tag
  ciphertext: string; // Base64 encoded ciphertext
}

// Or as a single encoded string:
// [version:1][salt:16][iv:12][authTag:16][ciphertext:*]
```
        </code_example>
      </step>
      <step order="2">
        <description>Implement salt generation</description>
        <details>
          Add proper random salt generation using cryptographically secure
          random number generator.
        </details>
        <code_example>
```typescript
// apps/api/src/common/utils/crypto.utils.ts
export class CryptoUtils {
  private static readonly SALT_LENGTH = 16;
  private static readonly PBKDF2_ITERATIONS = 100000;

  /**
   * Generates a cryptographically secure random salt
   */
  static generateSalt(): Buffer {
    return crypto.randomBytes(this.SALT_LENGTH);
  }

  /**
   * Derives a key from password using PBKDF2 with provided salt
   */
  static deriveKey(
    password: string | Buffer,
    salt: Buffer,
    iterations: number = this.PBKDF2_ITERATIONS,
  ): Buffer {
    if (salt.length < this.SALT_LENGTH) {
      throw new Error(`Salt must be at least ${this.SALT_LENGTH} bytes`);
    }

    return crypto.pbkdf2Sync(
      password,
      salt,
      iterations,
      32, // 256 bits for AES-256
      'sha256',
    );
  }
}
```
        </code_example>
      </step>
      <step order="3">
        <description>Update encryption to include salt</description>
        <details>
          Modify the encrypt function to generate a random salt, derive the
          encryption key, and include the salt in the output.
        </details>
        <code_example>
```typescript
// apps/api/src/common/services/encryption.service.ts
@Injectable()
export class EncryptionService {
  private readonly masterKey: string;
  private static readonly VERSION = 2;

  constructor(private readonly configService: ConfigService) {
    const key = this.configService.get<string>('ENCRYPTION_KEY');

    if (!key) {
      throw new Error('CRITICAL: ENCRYPTION_KEY environment variable is required.');
    }

    if (key.length < 32) {
      throw new Error('CRITICAL: ENCRYPTION_KEY must be at least 32 characters.');
    }

    this.masterKey = key;
  }

  /**
   * Encrypts plaintext with per-record salt
   */
  encrypt(plaintext: string): string {
    // Generate unique salt for this encryption
    const salt = CryptoUtils.generateSalt();

    // Derive encryption key from master key + salt
    const derivedKey = CryptoUtils.deriveKey(this.masterKey, salt);

    // Generate random IV
    const iv = crypto.randomBytes(12);

    // Encrypt with AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv);
    let ciphertext = cipher.update(plaintext, 'utf8');
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Pack all components into a single buffer
    // Format: [version:1][salt:16][iv:12][authTag:16][ciphertext:*]
    const result = Buffer.concat([
      Buffer.from([EncryptionService.VERSION]),
      salt,
      iv,
      authTag,
      ciphertext,
    ]);

    return result.toString('base64');
  }

  /**
   * Decrypts ciphertext, extracting salt from the encrypted data
   */
  decrypt(encryptedData: string): string {
    const data = Buffer.from(encryptedData, 'base64');

    // Extract version
    const version = data[0];

    if (version === 2) {
      return this.decryptV2(data);
    } else if (version === 1 || this.looksLikeV1(data)) {
      // Handle legacy v1 format during migration period
      return this.decryptV1Legacy(data);
    }

    throw new Error(`Unknown encryption version: ${version}`);
  }

  private decryptV2(data: Buffer): string {
    // Extract components
    // [version:1][salt:16][iv:12][authTag:16][ciphertext:*]
    const salt = data.slice(1, 17);
    const iv = data.slice(17, 29);
    const authTag = data.slice(29, 45);
    const ciphertext = data.slice(45);

    // Derive key using extracted salt
    const derivedKey = CryptoUtils.deriveKey(this.masterKey, salt);

    // Decrypt
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(ciphertext);
    plaintext = Buffer.concat([plaintext, decipher.final()]);

    return plaintext.toString('utf8');
  }

  /**
   * Re-encrypts data from v1 format to v2 format
   * Use this for migrating existing encrypted data
   */
  reencrypt(v1EncryptedData: string): string {
    const plaintext = this.decryptV1Legacy(
      Buffer.from(v1EncryptedData, 'base64')
    );
    return this.encrypt(plaintext);
  }
}
```
        </code_example>
      </step>
      <step order="4">
        <description>Create migration utilities</description>
        <details>
          Build utilities to help migrate existing encrypted data from the
          static salt format to the new per-record salt format.
        </details>
        <code_example>
```typescript
// Migration service for encrypted data
@Injectable()
export class EncryptionMigrationService {
  constructor(private readonly encryptionService: EncryptionService) {}

  /**
   * Migrates a single encrypted value from v1 to v2 format
   */
  migrateValue(oldEncrypted: string): string {
    return this.encryptionService.reencrypt(oldEncrypted);
  }

  /**
   * Checks if data needs migration
   */
  needsMigration(encryptedData: string): boolean {
    try {
      const data = Buffer.from(encryptedData, 'base64');
      const version = data[0];
      return version < 2;
    } catch {
      return true; // Assume needs migration if can't parse
    }
  }
}
```
        </code_example>
      </step>
      <step order="5">
        <description>Update database records</description>
        <details>
          Create a migration script to re-encrypt existing data with proper salts.
          This should be run as a database migration or background job.
        </details>
      </step>
      <step order="6">
        <description>Write comprehensive tests</description>
        <details>
          Test salt uniqueness, key derivation, encryption/decryption,
          version handling, and migration utilities.
        </details>
      </step>
    </steps>
    <technical_notes>
      - Salt should be at least 16 bytes (128 bits)
      - PBKDF2 iterations should be at least 100,000 for security
      - Store salt with encrypted data, not separately
      - Version field enables future format upgrades
      - Consider gradual migration to avoid service disruption
      - Memory-hard functions like Argon2 are even better but PBKDF2 is widely supported
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <id>TC-001</id>
        <description>Each encryption produces unique salt</description>
        <expected_result>Same plaintext encrypted twice has different salts</expected_result>
      </test_case>
      <test_case>
        <id>TC-002</id>
        <description>Salt is included in encrypted output</description>
        <expected_result>Encrypted data contains extractable salt</expected_result>
      </test_case>
      <test_case>
        <id>TC-003</id>
        <description>Decryption extracts and uses salt correctly</description>
        <expected_result>Encrypted data can be decrypted using embedded salt</expected_result>
      </test_case>
      <test_case>
        <id>TC-004</id>
        <description>Different salts produce different derived keys</description>
        <expected_result>Same master key + different salts = different derived keys</expected_result>
      </test_case>
      <test_case>
        <id>TC-005</id>
        <description>Version 2 format is correctly structured</description>
        <expected_result>Encrypted output has correct byte layout</expected_result>
      </test_case>
      <test_case>
        <id>TC-006</id>
        <description>Legacy v1 data can still be decrypted</description>
        <expected_result>Old encrypted data remains readable during migration</expected_result>
      </test_case>
      <test_case>
        <id>TC-007</id>
        <description>Migration utility correctly re-encrypts data</description>
        <expected_result>Migrated data is in v2 format with unique salt</expected_result>
      </test_case>
      <test_case>
        <id>TC-008</id>
        <description>Salt length meets minimum requirements</description>
        <expected_result>Generated salts are at least 16 bytes</expected_result>
      </test_case>
    </test_cases>
    <acceptance_criteria>
      <criterion>Each encryption operation generates a unique random salt</criterion>
      <criterion>Salt is stored with encrypted data, not hardcoded</criterion>
      <criterion>Key derivation uses per-record salt</criterion>
      <criterion>Legacy data can be decrypted and migrated</criterion>
      <criterion>No static/hardcoded salts remain in codebase</criterion>
      <criterion>Migration path documented and tested</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item>Per-record salt generation implemented</item>
      <item>Encrypted data format includes salt</item>
      <item>Key derivation uses extracted salt</item>
      <item>Version field added for format upgrades</item>
      <item>Legacy v1 decryption supported for migration</item>
      <item>Migration utilities created</item>
      <item>No static salts in codebase</item>
      <item>Unit tests for salt uniqueness</item>
      <item>Unit tests for encryption/decryption</item>
      <item>Migration tests pass</item>
      <item>Code reviewed by security team</item>
      <item>Documentation updated</item>
    </checklist>
    <security_review_required>true</security_review_required>
  </definition_of_done>
</task_specification>
