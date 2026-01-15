/**
 * Cryptographic Utilities
 * TASK-INT-003: Standardize Encryption Implementation
 *
 * Centralized crypto utilities using ONLY Node.js crypto module.
 * All cryptographic operations use AES-256-GCM authenticated encryption.
 *
 * Security Principles:
 * - AES-256-GCM for authenticated encryption (confidentiality + integrity)
 * - 12-byte random IV (never reuse)
 * - 16-byte authentication tag
 * - 32-byte key (256 bits)
 * - PBKDF2 or scrypt for key derivation
 * - Constant-time comparison for secure string comparison
 */

import * as crypto from 'crypto';

/**
 * Structure for encrypted data with all necessary components for decryption.
 */
export interface EncryptedData {
  /** Base64 encoded 12-byte IV */
  iv: string;
  /** Base64 encoded 16-byte authentication tag */
  authTag: string;
  /** Base64 encoded ciphertext */
  ciphertext: string;
  /** Format version for future compatibility */
  version: number;
}

/**
 * Compact binary format for encrypted data.
 * Format: version(1) + iv(12) + authTag(16) + ciphertext(N)
 */
export interface EncryptedBinary {
  /** Base64 encoded binary data */
  data: string;
}

/**
 * Configuration for key derivation.
 */
export interface KeyDerivationConfig {
  /** Salt for key derivation (minimum 16 bytes recommended) */
  salt: Buffer;
  /** Number of iterations (minimum 100000 for PBKDF2, 16384 for scrypt) */
  iterations?: number;
  /** Key length in bytes (default: 32 for AES-256) */
  keyLength?: number;
  /** Algorithm: 'pbkdf2' or 'scrypt' */
  algorithm?: 'pbkdf2' | 'scrypt';
}

// Algorithm constants
const ALGORITHM = 'aes-256-gcm' as const;
const IV_LENGTH = 12; // 96 bits - recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits for AES-256
const CURRENT_VERSION = 1;

// Key derivation defaults
const PBKDF2_DEFAULT_ITERATIONS = 100000;
const SCRYPT_DEFAULT_COST = 16384; // N = 2^14
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

/**
 * CryptoUtils - Centralized cryptographic operations using Node.js crypto.
 *
 * All methods are static for easy use without instantiation.
 * Uses AES-256-GCM for all encryption operations.
 */
export class CryptoUtils {
  /** Encryption algorithm used */
  static readonly ALGORITHM = ALGORITHM;
  /** IV length in bytes */
  static readonly IV_LENGTH = IV_LENGTH;
  /** Authentication tag length in bytes */
  static readonly AUTH_TAG_LENGTH = AUTH_TAG_LENGTH;
  /** Key length in bytes */
  static readonly KEY_LENGTH = KEY_LENGTH;

  /**
   * Encrypt plaintext using AES-256-GCM authenticated encryption.
   *
   * @param plaintext - The text to encrypt
   * @param key - 32-byte encryption key
   * @returns EncryptedData object with iv, authTag, ciphertext, and version
   * @throws Error if key is not exactly 32 bytes
   */
  static encrypt(plaintext: string, key: Buffer): EncryptedData {
    CryptoUtils.validateKey(key);

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    let ciphertext = cipher.update(plaintext, 'utf8');
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      ciphertext: ciphertext.toString('base64'),
      version: CURRENT_VERSION,
    };
  }

  /**
   * Encrypt plaintext to a compact binary format.
   * Format: version(1) + iv(12) + authTag(16) + ciphertext(N)
   *
   * @param plaintext - The text to encrypt
   * @param key - 32-byte encryption key
   * @returns Base64 encoded binary data
   */
  static encryptToBase64(plaintext: string, key: Buffer): string {
    CryptoUtils.validateKey(key);

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });

    let ciphertext = cipher.update(plaintext, 'utf8');
    ciphertext = Buffer.concat([ciphertext, cipher.final()]);
    const authTag = cipher.getAuthTag();

    // Pack: version(1) + iv(12) + authTag(16) + ciphertext
    const result = Buffer.concat([
      Buffer.from([CURRENT_VERSION]),
      iv,
      authTag,
      ciphertext,
    ]);

    return result.toString('base64');
  }

  /**
   * Decrypt ciphertext using AES-256-GCM authenticated encryption.
   *
   * @param encrypted - EncryptedData object from encrypt()
   * @param key - 32-byte decryption key (must match encryption key)
   * @returns Decrypted plaintext string
   * @throws Error if decryption fails, key is wrong, or data is tampered
   */
  static decrypt(encrypted: EncryptedData, key: Buffer): string {
    CryptoUtils.validateKey(key);

    const iv = Buffer.from(encrypted.iv, 'base64');
    const authTag = Buffer.from(encrypted.authTag, 'base64');
    const ciphertext = Buffer.from(encrypted.ciphertext, 'base64');

    if (iv.length !== IV_LENGTH) {
      throw new Error(
        `Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`,
      );
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(
        `Invalid auth tag length: expected ${AUTH_TAG_LENGTH}, got ${authTag.length}`,
      );
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(ciphertext);
    plaintext = Buffer.concat([plaintext, decipher.final()]);

    return plaintext.toString('utf8');
  }

  /**
   * Decrypt base64 encoded binary data.
   * Format: version(1) + iv(12) + authTag(16) + ciphertext(N)
   *
   * @param base64Data - Base64 encoded encrypted data
   * @param key - 32-byte decryption key
   * @returns Decrypted plaintext string
   */
  static decryptFromBase64(base64Data: string, key: Buffer): string {
    CryptoUtils.validateKey(key);

    const data = Buffer.from(base64Data, 'base64');

    // Minimum length: version(1) + iv(12) + authTag(16) = 29 bytes
    const minLength = 1 + IV_LENGTH + AUTH_TAG_LENGTH;
    if (data.length < minLength) {
      throw new Error(
        `Invalid encrypted data: too short (${data.length} bytes, minimum ${minLength})`,
      );
    }

    const version = data[0];
    if (version !== CURRENT_VERSION) {
      throw new Error(
        `Unsupported encryption version: ${version} (expected ${CURRENT_VERSION})`,
      );
    }

    const iv = data.subarray(1, 1 + IV_LENGTH);
    const authTag = data.subarray(
      1 + IV_LENGTH,
      1 + IV_LENGTH + AUTH_TAG_LENGTH,
    );
    const ciphertext = data.subarray(1 + IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(ciphertext);
    plaintext = Buffer.concat([plaintext, decipher.final()]);

    return plaintext.toString('utf8');
  }

  /**
   * Derive a cryptographic key from a password using PBKDF2.
   *
   * @param password - The password to derive key from
   * @param salt - Salt buffer (minimum 16 bytes recommended)
   * @param iterations - Number of iterations (default: 100000)
   * @param keyLength - Output key length in bytes (default: 32)
   * @returns Derived key buffer
   */
  static deriveKeyPBKDF2(
    password: string,
    salt: Buffer,
    iterations: number = PBKDF2_DEFAULT_ITERATIONS,
    keyLength: number = KEY_LENGTH,
  ): Buffer {
    if (salt.length < 16) {
      throw new Error('Salt must be at least 16 bytes for security');
    }
    if (iterations < 10000) {
      throw new Error('Iterations must be at least 10000 for security');
    }
    return crypto.pbkdf2Sync(password, salt, iterations, keyLength, 'sha256');
  }

  /**
   * Derive a cryptographic key from a password using scrypt.
   * More resistant to hardware attacks than PBKDF2.
   *
   * @param password - The password to derive key from
   * @param salt - Salt buffer (minimum 16 bytes recommended)
   * @param keyLength - Output key length in bytes (default: 32)
   * @param cost - CPU/memory cost parameter N (default: 16384 = 2^14)
   * @returns Derived key buffer
   */
  static deriveKeyScrypt(
    password: string,
    salt: Buffer,
    keyLength: number = KEY_LENGTH,
    cost: number = SCRYPT_DEFAULT_COST,
  ): Buffer {
    if (salt.length < 16) {
      throw new Error('Salt must be at least 16 bytes for security');
    }
    if (cost < 8192) {
      throw new Error('Scrypt cost (N) must be at least 8192 for security');
    }
    return crypto.scryptSync(password, salt, keyLength, {
      N: cost,
      r: SCRYPT_BLOCK_SIZE,
      p: SCRYPT_PARALLELIZATION,
    });
  }

  /**
   * Generate a random 32-byte encryption key.
   *
   * @returns Cryptographically secure random key
   */
  static generateKey(): Buffer {
    return crypto.randomBytes(KEY_LENGTH);
  }

  /**
   * Generate a random salt for key derivation.
   *
   * @param length - Salt length in bytes (default: 16)
   * @returns Cryptographically secure random salt
   */
  static generateSalt(length: number = 16): Buffer {
    if (length < 16) {
      throw new Error('Salt length must be at least 16 bytes for security');
    }
    return crypto.randomBytes(length);
  }

  /**
   * Generate a random IV for encryption.
   *
   * @returns 12-byte random IV for AES-GCM
   */
  static generateIV(): Buffer {
    return crypto.randomBytes(IV_LENGTH);
  }

  /**
   * Compute SHA-256 hash of data.
   *
   * @param data - Data to hash
   * @param encoding - Output encoding (default: 'hex')
   * @returns Hash digest
   */
  static hash(
    data: string,
    encoding: crypto.BinaryToTextEncoding = 'hex',
  ): string {
    return crypto.createHash('sha256').update(data).digest(encoding);
  }

  /**
   * Compute SHA-512 hash of data.
   *
   * @param data - Data to hash
   * @param encoding - Output encoding (default: 'hex')
   * @returns Hash digest
   */
  static hash512(
    data: string,
    encoding: crypto.BinaryToTextEncoding = 'hex',
  ): string {
    return crypto.createHash('sha512').update(data).digest(encoding);
  }

  /**
   * Compute HMAC-SHA256 of data.
   *
   * @param data - Data to authenticate
   * @param key - HMAC key
   * @param encoding - Output encoding (default: 'hex')
   * @returns HMAC digest
   */
  static hmac(
    data: string,
    key: Buffer,
    encoding: crypto.BinaryToTextEncoding = 'hex',
  ): string {
    return crypto.createHmac('sha256', key).update(data).digest(encoding);
  }

  /**
   * Compute HMAC-SHA512 of data.
   *
   * @param data - Data to authenticate
   * @param key - HMAC key
   * @param encoding - Output encoding (default: 'hex')
   * @returns HMAC digest
   */
  static hmac512(
    data: string,
    key: Buffer,
    encoding: crypto.BinaryToTextEncoding = 'hex',
  ): string {
    return crypto.createHmac('sha512', key).update(data).digest(encoding);
  }

  /**
   * Constant-time string comparison to prevent timing attacks.
   *
   * @param a - First string
   * @param b - Second string
   * @returns true if strings are equal
   */
  static secureCompare(a: string, b: string): boolean {
    // If lengths differ, we still need constant time
    // Create buffers of same length
    const bufA = Buffer.from(a, 'utf8');
    const bufB = Buffer.from(b, 'utf8');

    // If lengths differ, create dummy buffer of same length for timing safety
    if (bufA.length !== bufB.length) {
      // Compare against self to maintain constant time
      crypto.timingSafeEqual(bufA, bufA);
      return false;
    }

    return crypto.timingSafeEqual(bufA, bufB);
  }

  /**
   * Generate a random string in hex format.
   *
   * @param byteLength - Number of random bytes (output will be 2x this in hex)
   * @returns Random hex string
   */
  static randomHex(byteLength: number = 32): string {
    return crypto.randomBytes(byteLength).toString('hex');
  }

  /**
   * Generate a random string in base64url format.
   * Safe for URLs and filenames.
   *
   * @param byteLength - Number of random bytes
   * @returns Random base64url string
   */
  static randomBase64Url(byteLength: number = 32): string {
    return crypto.randomBytes(byteLength).toString('base64url');
  }

  /**
   * Validate that a key is exactly 32 bytes.
   *
   * @param key - Key buffer to validate
   * @throws Error if key is not 32 bytes
   */
  private static validateKey(key: Buffer): void {
    if (!Buffer.isBuffer(key)) {
      throw new Error('Key must be a Buffer');
    }
    if (key.length !== KEY_LENGTH) {
      throw new Error(
        `Invalid key length: expected ${KEY_LENGTH} bytes, got ${key.length}`,
      );
    }
  }
}

// Export individual functions for convenience
export const encrypt = CryptoUtils.encrypt.bind(CryptoUtils);
export const decrypt = CryptoUtils.decrypt.bind(CryptoUtils);
export const encryptToBase64 = CryptoUtils.encryptToBase64.bind(CryptoUtils);
export const decryptFromBase64 =
  CryptoUtils.decryptFromBase64.bind(CryptoUtils);
export const deriveKeyPBKDF2 = CryptoUtils.deriveKeyPBKDF2.bind(CryptoUtils);
export const deriveKeyScrypt = CryptoUtils.deriveKeyScrypt.bind(CryptoUtils);
export const generateKey = CryptoUtils.generateKey.bind(CryptoUtils);
export const generateSalt = CryptoUtils.generateSalt.bind(CryptoUtils);
export const hash = CryptoUtils.hash.bind(CryptoUtils);
export const hmac = CryptoUtils.hmac.bind(CryptoUtils);
export const secureCompare = CryptoUtils.secureCompare.bind(CryptoUtils);
export const randomHex = CryptoUtils.randomHex.bind(CryptoUtils);
export const randomBase64Url = CryptoUtils.randomBase64Url.bind(CryptoUtils);
