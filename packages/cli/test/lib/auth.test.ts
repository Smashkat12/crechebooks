/**
 * Auth Module Tests
 * Tests for authentication and credential management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// Mock fs module
vi.mock('node:fs');

// Import after mocking
import {
  isValidApiKeyFormat,
  isValidTenantIdFormat,
  maskApiKey,
} from '../../src/lib/auth.js';

describe('Auth Module', () => {
  describe('isValidApiKeyFormat', () => {
    it('should return true for valid API key format', () => {
      expect(isValidApiKeyFormat('cb_1234567890123456789012345')).toBe(true);
      expect(isValidApiKeyFormat('cb_abcdefghijklmnopqrstuvwxyz')).toBe(true);
    });

    it('should return false for invalid API key format', () => {
      expect(isValidApiKeyFormat('invalid_key')).toBe(false);
      expect(isValidApiKeyFormat('cb_short')).toBe(false);
      expect(isValidApiKeyFormat('pk_1234567890123456789012345')).toBe(false);
      expect(isValidApiKeyFormat('')).toBe(false);
    });
  });

  describe('isValidTenantIdFormat', () => {
    it('should return true for valid UUID format', () => {
      expect(
        isValidTenantIdFormat('550e8400-e29b-41d4-a716-446655440000'),
      ).toBe(true);
      expect(
        isValidTenantIdFormat('123e4567-e89b-12d3-a456-426614174000'),
      ).toBe(true);
    });

    it('should return true for valid CUID format', () => {
      // CUID format: c followed by 24 lowercase alphanumeric chars
      expect(isValidTenantIdFormat('clh1234567890abcdefghijkl')).toBe(true);
      expect(isValidTenantIdFormat('cm12345678901234567890abc')).toBe(true);
    });

    it('should return false for invalid formats', () => {
      expect(isValidTenantIdFormat('invalid-id')).toBe(false);
      expect(isValidTenantIdFormat('123')).toBe(false);
      expect(isValidTenantIdFormat('')).toBe(false);
      expect(isValidTenantIdFormat('not-a-uuid-or-cuid')).toBe(false);
    });
  });

  describe('maskApiKey', () => {
    it('should mask middle of API key', () => {
      const result = maskApiKey('cb_1234567890123456789012345');
      expect(result).toBe('cb_1****2345');
    });

    it('should return **** for short keys', () => {
      expect(maskApiKey('short')).toBe('****');
      expect(maskApiKey('12345678')).toBe('****');
    });

    it('should handle empty string', () => {
      expect(maskApiKey('')).toBe('****');
    });
  });
});
