/**
 * Encryption Service
 * Handles encryption/decryption of sensitive data
 *
 * TASK-STAFF-004: SimplePay Integration for Payroll Processing
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm';
  private readonly key: Buffer;

  constructor(private readonly configService: ConfigService) {
    const secret =
      this.configService.get<string>('ENCRYPTION_KEY') ||
      'default-encryption-key-32-chars!!';
    this.key = crypto.scryptSync(secret, 'salt', 32);
  }

  /**
   * Encrypt a plaintext string
   * @param text - The plaintext to encrypt
   * @returns Encrypted string in format: iv:authTag:ciphertext
   */
  async encrypt(text: string): Promise<string> {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  /**
   * Decrypt an encrypted string
   * @param encryptedText - Encrypted string in format: iv:authTag:ciphertext
   * @returns Decrypted plaintext string
   */
  async decrypt(encryptedText: string): Promise<string> {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
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
