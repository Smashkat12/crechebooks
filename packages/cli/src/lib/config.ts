/**
 * CLI Configuration Management
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Credentials, CredentialsFile, CLIConfig } from '../types/index.js';

const CONFIG_DIR = path.join(os.homedir(), '.crechebooks');
const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials.json');
const DEFAULT_BASE_URL = 'http://localhost:3000';

/**
 * Well-known environment base URLs
 * Users can override these with CB_BASE_URL or --base-url
 */
export const ENVIRONMENT_URLS: Record<string, string> = {
  local: 'http://localhost:3000',
  development: 'http://localhost:3000',
  staging: process.env.CB_STAGING_URL || 'https://staging-crechebooks.up.railway.app',
  production: process.env.CB_PRODUCTION_URL || 'https://crechebooks.up.railway.app',
  railway: process.env.CB_PRODUCTION_URL || 'https://crechebooks.up.railway.app',
};

/**
 * Get base URL for an environment name
 */
export function getEnvironmentUrl(env: string): string {
  return ENVIRONMENT_URLS[env.toLowerCase()] || env;
}

/**
 * Ensure config directory exists
 */
export function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }
}

/**
 * Read credentials file
 */
export function readCredentialsFile(): CredentialsFile | null {
  try {
    if (!fs.existsSync(CREDENTIALS_FILE)) {
      return null;
    }
    const content = fs.readFileSync(CREDENTIALS_FILE, 'utf-8');
    return JSON.parse(content) as CredentialsFile;
  } catch {
    return null;
  }
}

/**
 * Write credentials file
 */
export function writeCredentialsFile(creds: CredentialsFile): void {
  ensureConfigDir();
  fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(creds, null, 2), {
    mode: 0o600,
  });
}

/**
 * Get active credentials from environment or file
 */
export function getCredentials(profile?: string): Credentials | null {
  // 1. Check environment variables first
  const envApiKey = process.env.CB_API_KEY;
  const envTenantId = process.env.CB_TENANT_ID;
  const envBaseUrl = process.env.CB_BASE_URL;

  if (envApiKey && envTenantId) {
    return {
      apiKey: envApiKey,
      tenantId: envTenantId,
      baseUrl: envBaseUrl || DEFAULT_BASE_URL,
    };
  }

  // 2. Read from credentials file
  const credsFile = readCredentialsFile();
  if (!credsFile) {
    return null;
  }

  // 3. Get specified profile or active profile or default
  const profileName = profile || credsFile.activeProfile || 'default';

  if (profileName === 'default' && credsFile.default) {
    return {
      ...credsFile.default,
      baseUrl: credsFile.default.baseUrl || DEFAULT_BASE_URL,
    };
  }

  const profileCreds = credsFile.profiles?.[profileName];
  if (profileCreds) {
    return {
      ...profileCreds,
      baseUrl: profileCreds.baseUrl || DEFAULT_BASE_URL,
    };
  }

  return null;
}

/**
 * Save credentials to a profile
 */
export function saveCredentials(
  credentials: Credentials,
  profile: string = 'default',
): void {
  const credsFile = readCredentialsFile() || {};

  if (profile === 'default') {
    credsFile.default = credentials;
  } else {
    credsFile.profiles = credsFile.profiles || {};
    credsFile.profiles[profile] = credentials;
  }

  credsFile.activeProfile = profile;
  writeCredentialsFile(credsFile);
}

/**
 * Remove credentials for a profile
 */
export function removeCredentials(profile: string = 'default'): boolean {
  const credsFile = readCredentialsFile();
  if (!credsFile) {
    return false;
  }

  if (profile === 'default') {
    delete credsFile.default;
  } else if (credsFile.profiles) {
    delete credsFile.profiles[profile];
  }

  if (credsFile.activeProfile === profile) {
    credsFile.activeProfile = undefined;
  }

  writeCredentialsFile(credsFile);
  return true;
}

/**
 * Switch active profile
 */
export function switchProfile(profile: string): boolean {
  const credsFile = readCredentialsFile();
  if (!credsFile) {
    return false;
  }

  const hasProfile =
    profile === 'default'
      ? !!credsFile.default
      : !!credsFile.profiles?.[profile];

  if (!hasProfile) {
    return false;
  }

  credsFile.activeProfile = profile;
  writeCredentialsFile(credsFile);
  return true;
}

/**
 * List all profiles
 */
export function listProfiles(): string[] {
  const credsFile = readCredentialsFile();
  if (!credsFile) {
    return [];
  }

  const profiles: string[] = [];
  if (credsFile.default) {
    profiles.push('default');
  }
  if (credsFile.profiles) {
    profiles.push(...Object.keys(credsFile.profiles));
  }

  return profiles;
}

/**
 * Get active profile name
 */
export function getActiveProfile(): string | null {
  const credsFile = readCredentialsFile();
  return credsFile?.activeProfile || (credsFile?.default ? 'default' : null);
}

/**
 * Load full CLI configuration
 */
export function loadConfig(profile?: string): CLIConfig {
  const credentials = getCredentials(profile);
  const activeProfile = getActiveProfile() || 'default';

  return {
    credentials,
    profile: profile || activeProfile,
  };
}

/**
 * Get config directory path
 */
export function getConfigDir(): string {
  return CONFIG_DIR;
}

/**
 * Get credentials file path
 */
export function getCredentialsFilePath(): string {
  return CREDENTIALS_FILE;
}
