/**
 * Encryption Service
 * Handles encryption/decryption of sensitive data
 *
 * TASK-STAFF-004: SimplePay Integration for Payroll Processing
 * TASK-INT-001: Remove Default Encryption Key Fallback - Fail-fast validation
 * TASK-INT-004: Per-record random salt for key derivation
 *
 * Format v2: version(1) + salt(16) + iv(12) + authTag(16) + ciphertext
 * Format v1 (legacy): iv:authTag:ciphertext (hex encoded, static salt)
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

/**
 * Minimum key length required for secure AES-256 encryption.
 * 32 characters provides 256 bits of entropy when used as input to scrypt.
 */
const MIN_KEY_LENGTH = 32;

// TASK-INT-004: Encryption format constants
const VERSION_V2 = 2;
const SALT_LENGTH = 16;
const IV_LENGTH = 12; // Recommended for GCM
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SCRYPT_COST = 16384; // N=2^14, recommended minimum
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly masterKey: string;
  // TASK-INT-004: Legacy key for backward compatibility during migration
  private readonly legacyKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const secret = this.configService.get<string>('ENCRYPTION_KEY');

    // CRITICAL: Fail-fast validation - no default keys allowed
    if (!secret) {
      this.logger.error(
        'CRITICAL: ENCRYPTION_KEY environment variable is required but not set. ' +
          'Application cannot start without proper encryption configuration.',
      );
      throw new Error(
        'CRITICAL: ENCRYPTION_KEY environment variable is required but not set. ' +
          'Application cannot start without proper encryption configuration. ' +
          'Please set ENCRYPTION_KEY in your environment variables. ' +
          'Generate a secure key with: openssl rand -base64 32',
      );
    }

    // Validate key strength for AES-256
    if (secret.length < MIN_KEY_LENGTH) {
      this.logger.error(
        `CRITICAL: ENCRYPTION_KEY must be at least ${MIN_KEY_LENGTH} characters for secure AES-256 encryption. ` +
          `Current key length: ${secret.length} characters.`,
      );
      throw new Error(
        `CRITICAL: ENCRYPTION_KEY must be at least ${MIN_KEY_LENGTH} characters for secure AES-256 encryption. ` +
          `Generate a secure key with: openssl rand -base64 32`,
      );
    }

    this.masterKey = secret;
    // TASK-INT-004: Keep legacy key for decrypting old v1 format during migration
    this.legacyKey = crypto.scryptSync(secret, 'salt', KEY_LENGTH);
    this.logger.log(
      'EncryptionService initialized with v2 per-record salt support',
    );
  }

  /**
   * Derive encryption key from master key using per-record salt
   * TASK-INT-004: Each record gets a unique derived key
   */
  private deriveKey(salt: Buffer): Buffer {
    return crypto.scryptSync(this.masterKey, salt, KEY_LENGTH, {
      N: SCRYPT_COST,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
    });
  }

  /**
   * Encrypt a plaintext string with per-record salt (v2 format)
   * TASK-INT-004: Uses random salt for each encryption operation
   *
   * @param text - The plaintext to encrypt
   * @returns Base64 encoded encrypted data with embedded salt
   */
  encrypt(text: string): string {
    // TASK-INT-004: Generate unique salt for this encryption
    const salt = crypto.randomBytes(SALT_LENGTH);
    const derivedKey = this.deriveKey(salt);

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(this.algorithm, derivedKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    let ciphertext = cipher.update(text, 'utf8');
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);
    const authTag = cipher.getAuthTag();

    // TASK-INT-004: Pack format v2: version(1) + salt(16) + iv(12) + authTag(16) + ciphertext
    const result = Buffer.concat([
      Buffer.from([VERSION_V2]),
      salt,
      iv,
      authTag,
      ciphertext,
    ]);

    this.logger.debug(
      `TASK-INT-004: Encrypted ${text.length} chars with unique salt`,
    );
    return result.toString('base64');
  }

  /**
   * Decrypt an encrypted string (supports v1 and v2 formats)
   * TASK-INT-004: Extracts salt from v2 format, uses legacy key for v1
   *
   * @param encryptedText - Encrypted data (v2 base64 or v1 hex format)
   * @returns Decrypted plaintext string
   */
  decrypt(encryptedText: string): string {
    // Try to detect format
    if (this.isV2Format(encryptedText)) {
      return this.decryptV2(encryptedText);
    }
    // Fall back to legacy v1 format
    return this.decryptV1Legacy(encryptedText);
  }

  /**
   * Check if encrypted data is in v2 format
   * TASK-INT-003: Fixed to handle empty string encryption (zero-length ciphertext)
   */
  private isV2Format(encryptedText: string): boolean {
    try {
      const data = Buffer.from(encryptedText, 'base64');
      // Minimum v2 format size: version(1) + salt(16) + iv(12) + authTag(16) = 45 bytes
      // Ciphertext can be 0 bytes for empty string encryption
      const minV2Length = 1 + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH;
      return data.length >= minV2Length && data[0] === VERSION_V2;
    } catch {
      return false;
    }
  }

  /**
   * Decrypt v2 format with per-record salt
   * TASK-INT-004: Extracts and uses embedded salt
   */
  private decryptV2(encryptedText: string): string {
    const data = Buffer.from(encryptedText, 'base64');

    // Extract components: version(1) + salt(16) + iv(12) + authTag(16) + ciphertext
    const salt = data.subarray(1, 1 + SALT_LENGTH);
    const iv = data.subarray(1 + SALT_LENGTH, 1 + SALT_LENGTH + IV_LENGTH);
    const authTag = data.subarray(
      1 + SALT_LENGTH + IV_LENGTH,
      1 + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH,
    );
    const ciphertext = data.subarray(
      1 + SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH,
    );

    // Derive key using extracted salt
    const derivedKey = this.deriveKey(salt);

    const decipher = crypto.createDecipheriv(this.algorithm, derivedKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(ciphertext);
    plaintext = Buffer.concat([plaintext, decipher.final()]);

    return plaintext.toString('utf8');
  }

  /**
   * Decrypt legacy v1 format (static salt)
   * TASK-INT-004: Backward compatibility for existing encrypted data
   */
  private decryptV1Legacy(encryptedText: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(
      this.algorithm,
      this.legacyKey,
      iv,
    );
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Re-encrypt data from v1 to v2 format
   * TASK-INT-004: Migration utility for existing encrypted data
   *
   * @param v1EncryptedText - Data encrypted with v1 format (static salt)
   * @returns Data encrypted with v2 format (per-record salt)
   */
  reencrypt(v1EncryptedText: string): string {
    const plaintext = this.decryptV1Legacy(v1EncryptedText);
    return this.encrypt(plaintext);
  }

  /**
   * Check if data needs migration from v1 to v2 format
   * TASK-INT-004: Helps identify records needing migration
   */
  needsMigration(encryptedText: string): boolean {
    return !this.isV2Format(encryptedText);
  }

  /**
   * Hash a string using SHA-256
   * @param text - The text to hash
   * @returns SHA-256 hash of the text
   */
  hash(text: string): string {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  /**
   * Generate a random string
   * @param length - Length of the random string in bytes (output will be hex, so 2x length)
   * @returns Random hex string
   */
  generateRandomString(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
}
