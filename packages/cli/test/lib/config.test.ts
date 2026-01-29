/**
 * Config Module Tests
 * Tests for credential file management
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';

// Mock modules
vi.mock('node:fs');
vi.mock('node:os');

describe('Config Module', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    // Mock homedir
    vi.mocked(os.homedir).mockReturnValue('/home/testuser');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('credential file paths', () => {
    it('should use correct config directory', async () => {
      const { getConfigDir } = await import('../../src/lib/config.js');
      expect(getConfigDir()).toBe('/home/testuser/.crechebooks');
    });

    it('should use correct credentials file path', async () => {
      const { getCredentialsFilePath } = await import('../../src/lib/config.js');
      expect(getCredentialsFilePath()).toBe(
        '/home/testuser/.crechebooks/credentials.json',
      );
    });
  });

  describe('ensureConfigDir', () => {
    it('should create directory if not exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);
      vi.mocked(fs.mkdirSync).mockReturnValue(undefined);

      const { ensureConfigDir } = await import('../../src/lib/config.js');
      ensureConfigDir();

      expect(fs.mkdirSync).toHaveBeenCalledWith(
        '/home/testuser/.crechebooks',
        expect.objectContaining({ recursive: true }),
      );
    });

    it('should not create if directory exists', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);

      const { ensureConfigDir } = await import('../../src/lib/config.js');
      ensureConfigDir();

      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });
  });

  describe('getCredentials', () => {
    it('should return credentials from environment variables', async () => {
      process.env.CB_API_KEY = 'cb_test_key_1234567890123456';
      process.env.CB_TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
      process.env.CB_BASE_URL = 'http://test-api.example.com';

      const { getCredentials } = await import('../../src/lib/config.js');
      const creds = getCredentials();

      expect(creds).toEqual({
        apiKey: 'cb_test_key_1234567890123456',
        tenantId: '550e8400-e29b-41d4-a716-446655440000',
        baseUrl: 'http://test-api.example.com',
      });

      // Cleanup
      delete process.env.CB_API_KEY;
      delete process.env.CB_TENANT_ID;
      delete process.env.CB_BASE_URL;
    });

    it('should return null when no credentials configured', async () => {
      delete process.env.CB_API_KEY;
      delete process.env.CB_TENANT_ID;
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { getCredentials } = await import('../../src/lib/config.js');
      const creds = getCredentials();

      expect(creds).toBeNull();
    });
  });

  describe('listProfiles', () => {
    it('should return empty array when no credentials file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(false);

      const { listProfiles } = await import('../../src/lib/config.js');
      expect(listProfiles()).toEqual([]);
    });

    it('should return profiles from credentials file', async () => {
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          default: { apiKey: 'key1', tenantId: 'tenant1' },
          profiles: {
            staging: { apiKey: 'key2', tenantId: 'tenant2' },
            production: { apiKey: 'key3', tenantId: 'tenant3' },
          },
        }),
      );

      const { listProfiles } = await import('../../src/lib/config.js');
      const profiles = listProfiles();

      expect(profiles).toContain('default');
      expect(profiles).toContain('staging');
      expect(profiles).toContain('production');
    });
  });
});
