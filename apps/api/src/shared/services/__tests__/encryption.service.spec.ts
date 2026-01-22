/**
 * EncryptionService Unit Tests
 *
 * TASK-INT-001: Remove Default Encryption Key Fallback
 * Tests fail-fast validation and encryption/decryption functionality
 */

import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { EncryptionService } from '../encryption.service';

// Valid test key (32+ characters for AES-256)
const VALID_TEST_KEY = 'test-encryption-key-at-least-32-characters-long';
const SHORT_KEY = 'short-key-less-than-32';

describe('EncryptionService', () => {
  describe('Constructor Validation (TASK-INT-001)', () => {
    it('should throw error when ENCRYPTION_KEY is not set', async () => {
      const moduleRef = Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(undefined),
            },
          },
        ],
      });

      await expect(moduleRef.compile()).rejects.toThrow(
        'CRITICAL: ENCRYPTION_KEY environment variable is required but not set',
      );
    });

    it('should throw error when ENCRYPTION_KEY is empty string', async () => {
      const moduleRef = Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(''),
            },
          },
        ],
      });

      await expect(moduleRef.compile()).rejects.toThrow(
        'CRITICAL: ENCRYPTION_KEY environment variable is required but not set',
      );
    });

    it('should throw error when ENCRYPTION_KEY is too short (less than 32 chars)', async () => {
      const moduleRef = Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(SHORT_KEY),
            },
          },
        ],
      });

      await expect(moduleRef.compile()).rejects.toThrow(
        'CRITICAL: ENCRYPTION_KEY must be at least 32 characters',
      );
    });

    it('should initialize successfully with valid key (32+ characters)', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(VALID_TEST_KEY),
            },
          },
        ],
      }).compile();

      const service = module.get<EncryptionService>(EncryptionService);
      expect(service).toBeDefined();
    });

    it('should initialize with exactly 32 character key', async () => {
      const exactKey = 'a'.repeat(32); // Exactly 32 characters
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(exactKey),
            },
          },
        ],
      }).compile();

      const service = module.get<EncryptionService>(EncryptionService);
      expect(service).toBeDefined();
    });

    it('error message should not contain the actual key value', async () => {
      const secretKey = 'my-super-secret-short';
      const moduleRef = Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(secretKey),
            },
          },
        ],
      });

      try {
        await moduleRef.compile();
        fail('Expected error to be thrown');
      } catch (error) {
        expect((error as Error).message).not.toContain(secretKey);
        expect((error as Error).message).toContain('CRITICAL');
        expect((error as Error).message).toContain('32 characters');
      }
    });
  });

  describe('Encryption/Decryption Operations', () => {
    let service: EncryptionService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(VALID_TEST_KEY),
            },
          },
        ],
      }).compile();

      service = module.get<EncryptionService>(EncryptionService);
    });

    it('should encrypt and decrypt text correctly', () => {
      const plaintext = 'Hello, World! This is sensitive data.';
      const encrypted = service.encrypt(plaintext);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it('should produce different ciphertext for same plaintext (due to random IV)', () => {
      const plaintext = 'Same text encrypted twice';
      const encrypted1 = service.encrypt(plaintext);
      const encrypted2 = service.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same plaintext
      expect(service.decrypt(encrypted1)).toBe(plaintext);
      expect(service.decrypt(encrypted2)).toBe(plaintext);
    });

    it('should handle empty strings', () => {
      const encrypted = service.encrypt('');
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe('');
    });

    it('should handle special characters and unicode', () => {
      const specialText = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/`~\n\t\r';
      const encrypted = service.encrypt(specialText);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(specialText);
    });

    it('should handle unicode characters', () => {
      const unicodeText = 'Hello 世界 مرحبا שלום 🌍🔐';
      const encrypted = service.encrypt(unicodeText);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(unicodeText);
    });

    it('should handle long text', () => {
      const longText = 'A'.repeat(10000);
      const encrypted = service.encrypt(longText);
      const decrypted = service.decrypt(encrypted);

      expect(decrypted).toBe(longText);
    });

    it('encrypted format should be v2 base64 binary format', () => {
      const encrypted = service.encrypt('test');

      // v2 format is base64 encoded binary
      // Format: version(1) + salt(16) + iv(12) + authTag(16) + ciphertext
      const data = Buffer.from(encrypted, 'base64');

      // Minimum length: 1 + 16 + 12 + 16 = 45 bytes + ciphertext
      expect(data.length).toBeGreaterThan(45);

      // First byte should be version 2
      expect(data[0]).toBe(2);
    });

    it('should throw error on tampered ciphertext (v2 format)', () => {
      const encrypted = service.encrypt('sensitive data');

      // Decode, tamper with ciphertext portion, re-encode
      const data = Buffer.from(encrypted, 'base64');
      // Tamper with last byte (ciphertext portion)
      data[data.length - 1] = data[data.length - 1] ^ 0xff;
      const tampered = data.toString('base64');

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it('should throw error on tampered auth tag (v2 format)', () => {
      const encrypted = service.encrypt('sensitive data');

      // Decode, tamper with auth tag portion, re-encode
      const data = Buffer.from(encrypted, 'base64');
      // Auth tag is at offset 1 + 16 + 12 = 29, tamper with first byte of auth tag
      data[29] = data[29] ^ 0xff;
      const tampered = data.toString('base64');

      expect(() => service.decrypt(tampered)).toThrow();
    });
  });

  describe('Hash Operations', () => {
    let service: EncryptionService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(VALID_TEST_KEY),
            },
          },
        ],
      }).compile();

      service = module.get<EncryptionService>(EncryptionService);
    });

    it('should produce consistent hash for same input', () => {
      const input = 'test string';
      const hash1 = service.hash(input);
      const hash2 = service.hash(input);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = service.hash('input1');
      const hash2 = service.hash('input2');

      expect(hash1).not.toBe(hash2);
    });

    it('should produce 64-character hex string (SHA-256)', () => {
      const hash = service.hash('test');

      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]+$/);
    });
  });

  describe('Random String Generation', () => {
    let service: EncryptionService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(VALID_TEST_KEY),
            },
          },
        ],
      }).compile();

      service = module.get<EncryptionService>(EncryptionService);
    });

    it('should generate random string of default length', () => {
      const random = service.generateRandomString();

      // Default is 32 bytes = 64 hex characters
      expect(random).toHaveLength(64);
      expect(random).toMatch(/^[0-9a-f]+$/);
    });

    it('should generate random string of specified length', () => {
      const random = service.generateRandomString(16);

      // 16 bytes = 32 hex characters
      expect(random).toHaveLength(32);
    });

    it('should generate unique strings on each call', () => {
      const random1 = service.generateRandomString();
      const random2 = service.generateRandomString();

      expect(random1).not.toBe(random2);
    });
  });

  describe('TASK-INT-004: Per-Record Salt', () => {
    let service: EncryptionService;

    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          EncryptionService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(VALID_TEST_KEY),
            },
          },
        ],
      }).compile();

      service = module.get<EncryptionService>(EncryptionService);
    });

    it('should generate unique salt for each encryption operation', () => {
      const encrypted1 = service.encrypt('test');
      const encrypted2 = service.encrypt('test');

      const data1 = Buffer.from(encrypted1, 'base64');
      const data2 = Buffer.from(encrypted2, 'base64');

      // Extract salt (bytes 1-17)
      const salt1 = data1.subarray(1, 17);
      const salt2 = data2.subarray(1, 17);

      // Salts must be unique
      expect(salt1.equals(salt2)).toBe(false);
    });

    it('should generate salt of at least 16 bytes', () => {
      const encrypted = service.encrypt('test');
      const data = Buffer.from(encrypted, 'base64');
      const salt = data.subarray(1, 17);
      expect(salt.length).toBe(16);
    });

    it('should detect legacy v1 format and handle migration check', () => {
      const encrypted = service.encrypt('test');
      expect(service.needsMigration(encrypted)).toBe(false);

      // v1 format uses colon-separated hex values
      const fakeV1 = 'abc123:def456:789xyz';
      expect(service.needsMigration(fakeV1)).toBe(true);
    });

    it('should produce completely different encrypted outputs due to unique salts', () => {
      const plaintext = 'identical-content';
      const results: string[] = [];

      // Encrypt same plaintext 10 times
      for (let i = 0; i < 10; i++) {
        results.push(service.encrypt(plaintext));
      }

      // All should be unique (different salt + IV each time)
      const uniqueResults = new Set(results);
      expect(uniqueResults.size).toBe(10);

      // All should decrypt to same value
      for (const encrypted of results) {
        expect(service.decrypt(encrypted)).toBe(plaintext);
      }
    });
  });
});
