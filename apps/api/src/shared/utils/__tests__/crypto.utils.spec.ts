/**
 * CryptoUtils Unit Tests
 * TASK-INT-003: Standardize Encryption Implementation
 *
 * Tests for centralized crypto utilities using Node.js crypto module.
 * All tests use REAL encryption/decryption - NO MOCKS.
 */

import { CryptoUtils, EncryptedData } from '../crypto.utils';

describe('CryptoUtils', () => {
  describe('Key Generation', () => {
    it('should generate a 32-byte key', () => {
      const key = CryptoUtils.generateKey();

      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('should generate unique keys on each call', () => {
      const key1 = CryptoUtils.generateKey();
      const key2 = CryptoUtils.generateKey();

      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('Salt Generation', () => {
    it('should generate a salt of default length (16 bytes)', () => {
      const salt = CryptoUtils.generateSalt();

      expect(Buffer.isBuffer(salt)).toBe(true);
      expect(salt.length).toBe(16);
    });

    it('should generate a salt of specified length', () => {
      const salt = CryptoUtils.generateSalt(32);

      expect(salt.length).toBe(32);
    });

    it('should throw error for salt length less than 16 bytes', () => {
      expect(() => CryptoUtils.generateSalt(8)).toThrow(
        'Salt length must be at least 16 bytes',
      );
    });

    it('should generate unique salts on each call', () => {
      const salt1 = CryptoUtils.generateSalt();
      const salt2 = CryptoUtils.generateSalt();

      expect(salt1.equals(salt2)).toBe(false);
    });
  });

  describe('Encryption/Decryption (Object Format)', () => {
    const key = CryptoUtils.generateKey();

    it('should encrypt and decrypt text correctly', () => {
      const plaintext = 'Hello, World! This is sensitive data.';
      const encrypted = CryptoUtils.encrypt(plaintext, key);
      const decrypted = CryptoUtils.decrypt(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (random IV)', () => {
      const plaintext = 'Same text encrypted twice';
      const encrypted1 = CryptoUtils.encrypt(plaintext, key);
      const encrypted2 = CryptoUtils.encrypt(plaintext, key);

      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);

      // Both should decrypt to the same plaintext
      expect(CryptoUtils.decrypt(encrypted1, key)).toBe(plaintext);
      expect(CryptoUtils.decrypt(encrypted2, key)).toBe(plaintext);
    });

    it('should handle empty strings', () => {
      const encrypted = CryptoUtils.encrypt('', key);
      const decrypted = CryptoUtils.decrypt(encrypted, key);

      expect(decrypted).toBe('');
    });

    it('should handle special characters', () => {
      const specialText = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~\n\t\r';
      const encrypted = CryptoUtils.encrypt(specialText, key);
      const decrypted = CryptoUtils.decrypt(encrypted, key);

      expect(decrypted).toBe(specialText);
    });

    it('should handle unicode characters', () => {
      const unicodeText =
        'Hello \u4E16\u754C \u0645\u0631\u062D\u0628\u0627 \u05E9\u05DC\u05D5\u05DD \uD83C\uDF0D\uD83D\uDD10';
      const encrypted = CryptoUtils.encrypt(unicodeText, key);
      const decrypted = CryptoUtils.decrypt(encrypted, key);

      expect(decrypted).toBe(unicodeText);
    });

    it('should handle long text', () => {
      const longText = 'A'.repeat(100000);
      const encrypted = CryptoUtils.encrypt(longText, key);
      const decrypted = CryptoUtils.decrypt(encrypted, key);

      expect(decrypted).toBe(longText);
    });

    it('should include version in encrypted data', () => {
      const encrypted = CryptoUtils.encrypt('test', key);

      expect(encrypted.version).toBe(1);
    });

    it('should produce base64 encoded components', () => {
      const encrypted = CryptoUtils.encrypt('test', key);

      // IV: 12 bytes = 16 base64 chars
      expect(encrypted.iv.length).toBe(16);
      // AuthTag: 16 bytes = 24 base64 chars (with padding) or 22 (without)
      expect(encrypted.authTag.length).toBeGreaterThanOrEqual(22);
      expect(encrypted.ciphertext.length).toBeGreaterThan(0);
    });
  });

  describe('Encryption/Decryption (Base64 Format)', () => {
    const key = CryptoUtils.generateKey();

    it('should encrypt and decrypt using base64 format', () => {
      const plaintext = 'Compact binary format test';
      const encrypted = CryptoUtils.encryptToBase64(plaintext, key);
      const decrypted = CryptoUtils.decryptFromBase64(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext on each encryption', () => {
      const plaintext = 'Same text';
      const encrypted1 = CryptoUtils.encryptToBase64(plaintext, key);
      const encrypted2 = CryptoUtils.encryptToBase64(plaintext, key);

      expect(encrypted1).not.toBe(encrypted2);

      // Both should decrypt correctly
      expect(CryptoUtils.decryptFromBase64(encrypted1, key)).toBe(plaintext);
      expect(CryptoUtils.decryptFromBase64(encrypted2, key)).toBe(plaintext);
    });

    it('should handle empty strings', () => {
      const encrypted = CryptoUtils.encryptToBase64('', key);
      const decrypted = CryptoUtils.decryptFromBase64(encrypted, key);

      expect(decrypted).toBe('');
    });
  });

  describe('Decryption with Wrong Key (Authentication)', () => {
    it('should fail to decrypt with wrong key (object format)', () => {
      const key1 = CryptoUtils.generateKey();
      const key2 = CryptoUtils.generateKey();

      const encrypted = CryptoUtils.encrypt('sensitive data', key1);

      expect(() => CryptoUtils.decrypt(encrypted, key2)).toThrow();
    });

    it('should fail to decrypt with wrong key (base64 format)', () => {
      const key1 = CryptoUtils.generateKey();
      const key2 = CryptoUtils.generateKey();

      const encrypted = CryptoUtils.encryptToBase64('sensitive data', key1);

      expect(() => CryptoUtils.decryptFromBase64(encrypted, key2)).toThrow();
    });
  });

  describe('Tamper Detection (Authenticated Encryption)', () => {
    const key = CryptoUtils.generateKey();

    it('should detect tampered ciphertext (object format)', () => {
      const encrypted = CryptoUtils.encrypt('sensitive data', key);

      // Tamper with the ciphertext
      const cipherBuffer = Buffer.from(encrypted.ciphertext, 'base64');
      cipherBuffer[0] = cipherBuffer[0] ^ 0xff; // Flip bits
      encrypted.ciphertext = cipherBuffer.toString('base64');

      expect(() => CryptoUtils.decrypt(encrypted, key)).toThrow();
    });

    it('should detect tampered auth tag (object format)', () => {
      const encrypted = CryptoUtils.encrypt('sensitive data', key);

      // Tamper with the auth tag
      const authTagBuffer = Buffer.from(encrypted.authTag, 'base64');
      authTagBuffer[0] = authTagBuffer[0] ^ 0xff; // Flip bits
      encrypted.authTag = authTagBuffer.toString('base64');

      expect(() => CryptoUtils.decrypt(encrypted, key)).toThrow();
    });

    it('should detect tampered IV (object format)', () => {
      const encrypted = CryptoUtils.encrypt('sensitive data', key);

      // Tamper with the IV
      const ivBuffer = Buffer.from(encrypted.iv, 'base64');
      ivBuffer[0] = ivBuffer[0] ^ 0xff; // Flip bits
      encrypted.iv = ivBuffer.toString('base64');

      expect(() => CryptoUtils.decrypt(encrypted, key)).toThrow();
    });

    it('should detect tampered base64 data', () => {
      const encrypted = CryptoUtils.encryptToBase64('sensitive data', key);

      // Decode, tamper, re-encode
      const data = Buffer.from(encrypted, 'base64');
      data[data.length - 1] = data[data.length - 1] ^ 0xff; // Flip bits in ciphertext
      const tampered = data.toString('base64');

      expect(() => CryptoUtils.decryptFromBase64(tampered, key)).toThrow();
    });
  });

  describe('Key Validation', () => {
    it('should throw error for key that is not a Buffer', () => {
      expect(() =>
        CryptoUtils.encrypt('test', 'not-a-buffer' as unknown as Buffer),
      ).toThrow('Key must be a Buffer');
    });

    it('should throw error for key shorter than 32 bytes', () => {
      const shortKey = Buffer.alloc(16);

      expect(() => CryptoUtils.encrypt('test', shortKey)).toThrow(
        'Invalid key length: expected 32 bytes, got 16',
      );
    });

    it('should throw error for key longer than 32 bytes', () => {
      const longKey = Buffer.alloc(64);

      expect(() => CryptoUtils.encrypt('test', longKey)).toThrow(
        'Invalid key length: expected 32 bytes, got 64',
      );
    });
  });

  describe('Key Derivation - PBKDF2', () => {
    it('should derive a 32-byte key', () => {
      const password = 'my-secure-password';
      const salt = CryptoUtils.generateSalt();

      const key = CryptoUtils.deriveKeyPBKDF2(password, salt);

      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('should produce same key for same password and salt', () => {
      const password = 'my-secure-password';
      const salt = CryptoUtils.generateSalt();

      const key1 = CryptoUtils.deriveKeyPBKDF2(password, salt);
      const key2 = CryptoUtils.deriveKeyPBKDF2(password, salt);

      expect(key1.equals(key2)).toBe(true);
    });

    it('should produce different keys for different salts', () => {
      const password = 'my-secure-password';
      const salt1 = CryptoUtils.generateSalt();
      const salt2 = CryptoUtils.generateSalt();

      const key1 = CryptoUtils.deriveKeyPBKDF2(password, salt1);
      const key2 = CryptoUtils.deriveKeyPBKDF2(password, salt2);

      expect(key1.equals(key2)).toBe(false);
    });

    it('should produce different keys for different passwords', () => {
      const salt = CryptoUtils.generateSalt();

      const key1 = CryptoUtils.deriveKeyPBKDF2('password1', salt);
      const key2 = CryptoUtils.deriveKeyPBKDF2('password2', salt);

      expect(key1.equals(key2)).toBe(false);
    });

    it('should throw error for salt shorter than 16 bytes', () => {
      expect(() =>
        CryptoUtils.deriveKeyPBKDF2('password', Buffer.alloc(8)),
      ).toThrow('Salt must be at least 16 bytes');
    });

    it('should throw error for iterations less than 10000', () => {
      const salt = CryptoUtils.generateSalt();

      expect(() => CryptoUtils.deriveKeyPBKDF2('password', salt, 1000)).toThrow(
        'Iterations must be at least 10000',
      );
    });
  });

  describe('Key Derivation - Scrypt', () => {
    it('should derive a 32-byte key', () => {
      const password = 'my-secure-password';
      const salt = CryptoUtils.generateSalt();

      const key = CryptoUtils.deriveKeyScrypt(password, salt);

      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('should produce same key for same password and salt', () => {
      const password = 'my-secure-password';
      const salt = CryptoUtils.generateSalt();

      const key1 = CryptoUtils.deriveKeyScrypt(password, salt);
      const key2 = CryptoUtils.deriveKeyScrypt(password, salt);

      expect(key1.equals(key2)).toBe(true);
    });

    it('should produce different keys for different salts', () => {
      const password = 'my-secure-password';
      const salt1 = CryptoUtils.generateSalt();
      const salt2 = CryptoUtils.generateSalt();

      const key1 = CryptoUtils.deriveKeyScrypt(password, salt1);
      const key2 = CryptoUtils.deriveKeyScrypt(password, salt2);

      expect(key1.equals(key2)).toBe(false);
    });

    it('should throw error for salt shorter than 16 bytes', () => {
      expect(() =>
        CryptoUtils.deriveKeyScrypt('password', Buffer.alloc(8)),
      ).toThrow('Salt must be at least 16 bytes');
    });

    it('should throw error for cost less than 8192', () => {
      const salt = CryptoUtils.generateSalt();

      expect(() =>
        CryptoUtils.deriveKeyScrypt('password', salt, 32, 1024),
      ).toThrow('Scrypt cost (N) must be at least 8192');
    });
  });

  describe('Hashing - SHA256', () => {
    it('should produce consistent hash for same input', () => {
      const input = 'test string';
      const hash1 = CryptoUtils.hash(input);
      const hash2 = CryptoUtils.hash(input);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = CryptoUtils.hash('input1');
      const hash2 = CryptoUtils.hash('input2');

      expect(hash1).not.toBe(hash2);
    });

    it('should produce 64-character hex string (SHA-256)', () => {
      const hash = CryptoUtils.hash('test');

      expect(hash.length).toBe(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });

    it('should support base64 encoding', () => {
      const hash = CryptoUtils.hash('test', 'base64');

      // SHA-256 = 32 bytes = 44 base64 chars (with padding)
      expect(hash.length).toBe(44);
    });
  });

  describe('Hashing - SHA512', () => {
    it('should produce 128-character hex string (SHA-512)', () => {
      const hash = CryptoUtils.hash512('test');

      expect(hash.length).toBe(128);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('HMAC', () => {
    const key = CryptoUtils.generateKey();

    it('should produce consistent HMAC for same input and key', () => {
      const data = 'data to authenticate';
      const hmac1 = CryptoUtils.hmac(data, key);
      const hmac2 = CryptoUtils.hmac(data, key);

      expect(hmac1).toBe(hmac2);
    });

    it('should produce different HMAC for different keys', () => {
      const data = 'data to authenticate';
      const key2 = CryptoUtils.generateKey();

      const hmac1 = CryptoUtils.hmac(data, key);
      const hmac2 = CryptoUtils.hmac(data, key2);

      expect(hmac1).not.toBe(hmac2);
    });

    it('should produce different HMAC for different data', () => {
      const hmac1 = CryptoUtils.hmac('data1', key);
      const hmac2 = CryptoUtils.hmac('data2', key);

      expect(hmac1).not.toBe(hmac2);
    });

    it('should produce 64-character hex string (HMAC-SHA256)', () => {
      const hmac = CryptoUtils.hmac('test', key);

      expect(hmac.length).toBe(64);
      expect(hmac).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('HMAC-SHA512', () => {
    const key = CryptoUtils.generateKey();

    it('should produce 128-character hex string (HMAC-SHA512)', () => {
      const hmac = CryptoUtils.hmac512('test', key);

      expect(hmac.length).toBe(128);
      expect(hmac).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('Secure Compare', () => {
    it('should return true for identical strings', () => {
      const result = CryptoUtils.secureCompare('password123', 'password123');

      expect(result).toBe(true);
    });

    it('should return false for different strings', () => {
      const result = CryptoUtils.secureCompare('password123', 'password456');

      expect(result).toBe(false);
    });

    it('should return false for strings of different lengths', () => {
      const result = CryptoUtils.secureCompare('short', 'longer string');

      expect(result).toBe(false);
    });

    it('should return true for empty strings', () => {
      const result = CryptoUtils.secureCompare('', '');

      expect(result).toBe(true);
    });
  });

  describe('Random String Generation', () => {
    it('should generate hex string of correct length', () => {
      const hex = CryptoUtils.randomHex(16);

      // 16 bytes = 32 hex chars
      expect(hex.length).toBe(32);
      expect(hex).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate unique hex strings', () => {
      const hex1 = CryptoUtils.randomHex();
      const hex2 = CryptoUtils.randomHex();

      expect(hex1).not.toBe(hex2);
    });

    it('should generate base64url string', () => {
      const b64 = CryptoUtils.randomBase64Url(32);

      // base64url uses only alphanumeric, -, _
      expect(b64).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('should generate unique base64url strings', () => {
      const b64_1 = CryptoUtils.randomBase64Url();
      const b64_2 = CryptoUtils.randomBase64Url();

      expect(b64_1).not.toBe(b64_2);
    });
  });

  describe('Static Constants', () => {
    it('should expose algorithm constant', () => {
      expect(CryptoUtils.ALGORITHM).toBe('aes-256-gcm');
    });

    it('should expose IV length constant', () => {
      expect(CryptoUtils.IV_LENGTH).toBe(12);
    });

    it('should expose auth tag length constant', () => {
      expect(CryptoUtils.AUTH_TAG_LENGTH).toBe(16);
    });

    it('should expose key length constant', () => {
      expect(CryptoUtils.KEY_LENGTH).toBe(32);
    });
  });

  describe('Integration: End-to-End Encryption Flow', () => {
    it('should work with derived key (PBKDF2)', () => {
      const password = 'user-provided-password';
      const salt = CryptoUtils.generateSalt();
      const key = CryptoUtils.deriveKeyPBKDF2(password, salt);

      const plaintext = 'Secret message for end-to-end test';
      const encrypted = CryptoUtils.encrypt(plaintext, key);
      const decrypted = CryptoUtils.decrypt(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    it('should work with derived key (Scrypt)', () => {
      const password = 'user-provided-password';
      const salt = CryptoUtils.generateSalt();
      const key = CryptoUtils.deriveKeyScrypt(password, salt);

      const plaintext = 'Secret message for end-to-end test';
      const encrypted = CryptoUtils.encryptToBase64(plaintext, key);
      const decrypted = CryptoUtils.decryptFromBase64(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    it('should serialize and deserialize encrypted data correctly', () => {
      const key = CryptoUtils.generateKey();
      const plaintext = 'Data to serialize';

      // Encrypt
      const encrypted = CryptoUtils.encrypt(plaintext, key);

      // Serialize to JSON
      const json = JSON.stringify(encrypted);

      // Deserialize from JSON
      const parsed: EncryptedData = JSON.parse(json);

      // Decrypt
      const decrypted = CryptoUtils.decrypt(parsed, key);

      expect(decrypted).toBe(plaintext);
    });
  });
});
