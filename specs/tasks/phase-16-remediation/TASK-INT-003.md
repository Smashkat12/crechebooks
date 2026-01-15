<?xml version="1.0" encoding="UTF-8"?>
<task_specification>
  <metadata>
    <task_id>TASK-INT-003</task_id>
    <title>Standardize Encryption Implementation</title>
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
      <tag>standardization</tag>
      <tag>code-quality</tag>
      <tag>crypto</tag>
    </tags>
  </metadata>

  <context>
    <background>
      The codebase currently uses multiple encryption libraries inconsistently -
      Node.js built-in crypto module in some places and CryptoJS library in others.
      This inconsistency creates maintenance burden, potential security gaps, and
      makes it difficult to ensure uniform security standards across the application.
    </background>
    <issue_description>
      HIGH - Inconsistent Node crypto vs CryptoJS usage across the codebase. Different
      implementations may have different security characteristics, padding schemes,
      and key derivation methods, leading to potential vulnerabilities and confusion.
    </issue_description>
    <business_impact>
      - Increased maintenance complexity and bug potential
      - Inconsistent security posture across features
      - Difficulty in security auditing
      - Potential for subtle encryption bugs
      - Larger bundle size from duplicate crypto libraries
    </business_impact>
    <technical_debt>
      Multiple encryption implementations increase cognitive load and risk of
      security mistakes. A single, well-audited approach is essential.
    </technical_debt>
  </context>

  <scope>
    <in_scope>
      <item>Audit all encryption usage across the codebase</item>
      <item>Standardize on Node.js crypto module</item>
      <item>Migrate CryptoJS usage to Node crypto</item>
      <item>Create unified encryption utility functions</item>
      <item>Ensure consistent algorithm usage (AES-256-GCM)</item>
      <item>Remove CryptoJS dependency</item>
    </in_scope>
    <out_of_scope>
      <item>Key management system changes</item>
      <item>Migration of existing encrypted data (if format changes)</item>
      <item>Client-side encryption (browser)</item>
    </out_of_scope>
    <affected_files>
      <file>apps/api/src/common/services/encryption.service.ts</file>
      <file>apps/api/src/integrations/**/*.ts</file>
      <file>package.json</file>
      <file>apps/api/src/common/utils/crypto.utils.ts (new)</file>
    </affected_files>
    <dependencies>
      <dependency>TASK-INT-001 - Encryption key configuration</dependency>
      <dependency>TASK-INT-002 - OAuth state encryption</dependency>
    </dependencies>
  </scope>

  <implementation>
    <approach>
      Create a centralized encryption utility using Node.js crypto module with
      modern authenticated encryption (AES-256-GCM). Replace all CryptoJS usage
      with the standardized implementation and remove the dependency.
    </approach>
    <steps>
      <step order="1">
        <description>Audit current encryption usage</description>
        <details>
          Search the codebase for all encryption-related code including:
          - CryptoJS imports and usage
          - Node crypto usage
          - Custom encryption functions
          - Different algorithm usage
          Document findings in a migration checklist.
        </details>
        <code_example>
```bash
# Search commands to audit encryption usage
grep -r "CryptoJS" apps/
grep -r "crypto.create" apps/
grep -r "encrypt\|decrypt" apps/ --include="*.ts"
grep -r "AES\|aes" apps/ --include="*.ts"
```
        </code_example>
      </step>
      <step order="2">
        <description>Create standardized crypto utilities</description>
        <details>
          Build a centralized crypto utility module with consistent interfaces
          for all encryption needs.
        </details>
        <code_example>
```typescript
// apps/api/src/common/utils/crypto.utils.ts
import * as crypto from 'crypto';

export interface EncryptedData {
  iv: string;
  authTag: string;
  ciphertext: string;
  version: number;
}

export class CryptoUtils {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12;
  private static readonly AUTH_TAG_LENGTH = 16;
  private static readonly KEY_LENGTH = 32;
  private static readonly VERSION = 1;

  /**
   * Encrypts data using AES-256-GCM (authenticated encryption)
   */
  static encrypt(plaintext: string, key: Buffer): EncryptedData {
    if (key.length !== this.KEY_LENGTH) {
      throw new Error(`Encryption key must be ${this.KEY_LENGTH} bytes`);
    }

    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv, {
      authTagLength: this.AUTH_TAG_LENGTH,
    });

    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext,
      version: this.VERSION,
    };
  }

  /**
   * Decrypts data encrypted with AES-256-GCM
   */
  static decrypt(encrypted: EncryptedData, key: Buffer): string {
    if (key.length !== this.KEY_LENGTH) {
      throw new Error(`Decryption key must be ${this.KEY_LENGTH} bytes`);
    }

    const iv = Buffer.from(encrypted.iv, 'base64');
    const authTag = Buffer.from(encrypted.authTag, 'base64');
    const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');

    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv, {
      authTagLength: this.AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(ciphertext, undefined, 'utf8');
    plaintext += decipher.final('utf8');

    return plaintext;
  }

  /**
   * Encrypts to a single string (for simpler storage)
   */
  static encryptToString(plaintext: string, key: Buffer): string {
    const encrypted = this.encrypt(plaintext, key);
    return JSON.stringify(encrypted);
  }

  /**
   * Decrypts from a single string
   */
  static decryptFromString(encryptedString: string, key: Buffer): string {
    const encrypted: EncryptedData = JSON.parse(encryptedString);
    return this.decrypt(encrypted, key);
  }

  /**
   * Derives a key from a password using PBKDF2
   */
  static deriveKey(
    password: string,
    salt: Buffer,
    iterations: number = 100000,
  ): Buffer {
    return crypto.pbkdf2Sync(
      password,
      salt,
      iterations,
      this.KEY_LENGTH,
      'sha256',
    );
  }

  /**
   * Generates a cryptographically secure random key
   */
  static generateKey(): Buffer {
    return crypto.randomBytes(this.KEY_LENGTH);
  }

  /**
   * Generates a random salt for key derivation
   */
  static generateSalt(): Buffer {
    return crypto.randomBytes(16);
  }

  /**
   * Creates a secure hash (for non-reversible operations)
   */
  static hash(data: string, algorithm: string = 'sha256'): string {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  /**
   * Creates an HMAC for message authentication
   */
  static hmac(data: string, key: Buffer, algorithm: string = 'sha256'): string {
    return crypto.createHmac(algorithm, key).update(data).digest('hex');
  }

  /**
   * Timing-safe comparison for preventing timing attacks
   */
  static secureCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);

    if (bufA.length !== bufB.length) {
      return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  }
}
```
        </code_example>
      </step>
      <step order="3">
        <description>Refactor EncryptionService to use utilities</description>
        <details>
          Update the EncryptionService to use the new standardized crypto utilities.
        </details>
        <code_example>
```typescript
// apps/api/src/common/services/encryption.service.ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CryptoUtils, EncryptedData } from '../utils/crypto.utils';

@Injectable()
export class EncryptionService {
  private readonly encryptionKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const keyString = this.configService.get<string>('ENCRYPTION_KEY');

    if (!keyString) {
      throw new Error(
        'CRITICAL: ENCRYPTION_KEY environment variable is required.'
      );
    }

    // Derive a proper 32-byte key from the configured key
    this.encryptionKey = CryptoUtils.deriveKey(
      keyString,
      Buffer.from('app-encryption-salt', 'utf8'), // Consider per-install salt
      100000,
    );
  }

  encrypt(plaintext: string): string {
    return CryptoUtils.encryptToString(plaintext, this.encryptionKey);
  }

  decrypt(encryptedString: string): string {
    return CryptoUtils.decryptFromString(encryptedString, this.encryptionKey);
  }

  hash(data: string): string {
    return CryptoUtils.hash(data);
  }

  hmac(data: string): string {
    return CryptoUtils.hmac(data, this.encryptionKey);
  }
}
```
        </code_example>
      </step>
      <step order="4">
        <description>Migrate all CryptoJS usage</description>
        <details>
          Replace each CryptoJS usage with the standardized Node crypto utilities.
          Handle any format differences for existing encrypted data.
        </details>
      </step>
      <step order="5">
        <description>Remove CryptoJS dependency</description>
        <details>
          Remove CryptoJS from package.json and verify no remaining imports.
        </details>
        <code_example>
```bash
npm uninstall crypto-js
npm uninstall @types/crypto-js

# Verify removal
grep -r "crypto-js" apps/
```
        </code_example>
      </step>
      <step order="6">
        <description>Update integration encryption</description>
        <details>
          Update all integration modules to use the standardized encryption service.
        </details>
      </step>
      <step order="7">
        <description>Write comprehensive tests</description>
        <details>
          Test all crypto utility functions, encryption service methods,
          and integration-specific usage.
        </details>
      </step>
    </steps>
    <technical_notes>
      - AES-256-GCM provides authenticated encryption (confidentiality + integrity)
      - Always use random IVs, never reuse
      - Node crypto is battle-tested and FIPS-compliant capable
      - Consider data migration strategy if encryption format changes
      - Timing-safe comparison prevents timing attacks on secret comparison
    </technical_notes>
  </implementation>

  <verification>
    <test_cases>
      <test_case>
        <id>TC-001</id>
        <description>CryptoUtils.encrypt produces valid encrypted data</description>
        <expected_result>EncryptedData with iv, authTag, ciphertext, version</expected_result>
      </test_case>
      <test_case>
        <id>TC-002</id>
        <description>CryptoUtils.decrypt recovers original plaintext</description>
        <expected_result>Decrypted text matches original</expected_result>
      </test_case>
      <test_case>
        <id>TC-003</id>
        <description>Encryption with wrong key fails</description>
        <expected_result>Decryption throws authentication error</expected_result>
      </test_case>
      <test_case>
        <id>TC-004</id>
        <description>Tampered ciphertext is detected</description>
        <expected_result>Decryption throws authentication error</expected_result>
      </test_case>
      <test_case>
        <id>TC-005</id>
        <description>Same plaintext produces different ciphertext (random IV)</description>
        <expected_result>Multiple encryptions of same text produce different outputs</expected_result>
      </test_case>
      <test_case>
        <id>TC-006</id>
        <description>Key derivation produces consistent results</description>
        <expected_result>Same password and salt produce same key</expected_result>
      </test_case>
      <test_case>
        <id>TC-007</id>
        <description>No CryptoJS imports remain in codebase</description>
        <expected_result>grep returns no results</expected_result>
      </test_case>
      <test_case>
        <id>TC-008</id>
        <description>All integrations use standardized encryption</description>
        <expected_result>All integration tests pass with new encryption</expected_result>
      </test_case>
    </test_cases>
    <acceptance_criteria>
      <criterion>All encryption uses Node.js crypto module</criterion>
      <criterion>CryptoJS dependency removed from package.json</criterion>
      <criterion>No CryptoJS imports in codebase</criterion>
      <criterion>All encryption uses AES-256-GCM</criterion>
      <criterion>Centralized crypto utilities created and documented</criterion>
      <criterion>All existing functionality preserved</criterion>
      <criterion>All tests pass</criterion>
    </acceptance_criteria>
  </verification>

  <definition_of_done>
    <checklist>
      <item>Comprehensive audit of encryption usage completed</item>
      <item>CryptoUtils utility module created</item>
      <item>EncryptionService refactored to use utilities</item>
      <item>All CryptoJS usage migrated to Node crypto</item>
      <item>CryptoJS dependency removed</item>
      <item>All integrations updated</item>
      <item>Unit tests for all crypto utilities</item>
      <item>Integration tests pass</item>
      <item>No duplicate encryption implementations</item>
      <item>Code reviewed</item>
      <item>Documentation updated</item>
    </checklist>
    <security_review_required>true</security_review_required>
  </definition_of_done>
</task_specification>
