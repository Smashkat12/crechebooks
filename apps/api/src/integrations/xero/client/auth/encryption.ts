/**
 * AES-256-GCM Encryption for OAuth Tokens
 * TASK-INT-003: Migrated from CryptoJS to Node.js crypto module
 *
 * Uses authenticated encryption (AES-256-GCM) for both confidentiality and integrity.
 */

import * as crypto from 'crypto';
import { EncryptionError } from '../utils/error-handler';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended IV length
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

export class Encryption {
  private readonly key: Buffer;

  constructor() {
    const keyString = process.env.TOKEN_ENCRYPTION_KEY;

    if (!keyString) {
      throw new Error('TOKEN_ENCRYPTION_KEY environment variable is required');
    }

    if (keyString.length < KEY_LENGTH) {
      throw new Error(
        `TOKEN_ENCRYPTION_KEY must be at least ${KEY_LENGTH} characters`,
      );
    }

    // Derive a proper 32-byte key using scrypt (consistent with main EncryptionService)
    // TASK-INT-004: Using app-specific salt (should be per-tenant in production)
    this.key = crypto.scryptSync(keyString, 'mcp-xero-token-salt', KEY_LENGTH);
  }

  /**
   * Encrypt plaintext data using AES-256-GCM
   * Output format: iv:authTag:ciphertext (all hex encoded)
   */
  encrypt(plaintext: string): string {
    try {
      const iv = crypto.randomBytes(IV_LENGTH);
      const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      });

      let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
      ciphertext += cipher.final('hex');
      const authTag = cipher.getAuthTag();

      return `${iv.toString('hex')}:${authTag.toString('hex')}:${ciphertext}`;
    } catch {
      throw new EncryptionError('encrypt');
    }
  }

  /**
   * Decrypt ciphertext data using AES-256-GCM
   * Input format: iv:authTag:ciphertext (all hex encoded)
   */
  decrypt(ciphertext: string): string {
    try {
      const parts = ciphertext.split(':');
      if (parts.length !== 3) {
        throw new EncryptionError('decrypt');
      }

      const [ivHex, authTagHex, encryptedHex] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv, {
        authTagLength: AUTH_TAG_LENGTH,
      });
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      if (!decrypted) {
        throw new EncryptionError('decrypt');
      }

      return decrypted;
    } catch (error) {
      if (error instanceof EncryptionError) {
        throw error;
      }
      throw new EncryptionError('decrypt');
    }
  }
}
