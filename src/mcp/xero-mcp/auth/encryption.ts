/**
 * AES-256 Encryption for OAuth Tokens
 * Using crypto-js for encryption/decryption
 */

import CryptoJS from 'crypto-js';
import { EncryptionError } from '../utils/error-handler';

export class Encryption {
  private readonly key: string;

  constructor() {
    const key = process.env.TOKEN_ENCRYPTION_KEY;

    if (!key) {
      throw new Error('TOKEN_ENCRYPTION_KEY environment variable is required');
    }

    if (key.length < 32) {
      throw new Error('TOKEN_ENCRYPTION_KEY must be at least 32 characters');
    }

    this.key = key;
  }

  /**
   * Encrypt plaintext data using AES-256
   */
  encrypt(plaintext: string): string {
    try {
      const encrypted = CryptoJS.AES.encrypt(plaintext, this.key).toString();
      return encrypted;
    } catch {
      throw new EncryptionError('encrypt');
    }
  }

  /**
   * Decrypt ciphertext data using AES-256
   */
  decrypt(ciphertext: string): string {
    try {
      const bytes = CryptoJS.AES.decrypt(ciphertext, this.key);
      const decrypted = bytes.toString(CryptoJS.enc.Utf8);

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
