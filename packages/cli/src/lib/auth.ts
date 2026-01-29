/**
 * Authentication Module
 *
 * Handles API key authentication for the CrecheBooks CLI.
 */

import type { Credentials } from '../types/index.js';
import { CLIError, CLIErrorCode } from '../types/index.js';
import {
  getCredentials,
  saveCredentials,
  removeCredentials,
  switchProfile,
  listProfiles,
  getActiveProfile,
} from './config.js';

/**
 * Require authentication - throws if not authenticated
 */
export function requireAuth(profile?: string): Credentials {
  const credentials = getCredentials(profile);

  if (!credentials) {
    throw new CLIError(
      CLIErrorCode.AUTH_REQUIRED,
      'No API key found.',
      "Run 'cb auth login' to authenticate.",
    );
  }

  return credentials;
}

/**
 * Check if authenticated
 */
export function isAuthenticated(profile?: string): boolean {
  return getCredentials(profile) !== null;
}

/**
 * Login with API key
 */
export function login(
  apiKey: string,
  tenantId: string,
  baseUrl?: string,
  profile: string = 'default',
): void {
  const credentials: Credentials = {
    apiKey,
    tenantId,
    baseUrl,
  };

  saveCredentials(credentials, profile);
}

/**
 * Logout - remove credentials
 */
export function logout(profile?: string): boolean {
  const activeProfile = profile || getActiveProfile() || 'default';
  return removeCredentials(activeProfile);
}

/**
 * Get current auth status
 */
export interface AuthStatus {
  authenticated: boolean;
  profile: string | null;
  tenantId: string | null;
  baseUrl: string | null;
  profiles: string[];
}

export function getAuthStatus(): AuthStatus {
  const activeProfile = getActiveProfile();
  const credentials = activeProfile ? getCredentials(activeProfile) : null;
  const profiles = listProfiles();

  return {
    authenticated: credentials !== null,
    profile: activeProfile,
    tenantId: credentials?.tenantId || null,
    baseUrl: credentials?.baseUrl || null,
    profiles,
  };
}

/**
 * Switch to a different profile
 */
export function useProfile(profile: string): boolean {
  return switchProfile(profile);
}

/**
 * Mask API key for display
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) {
    return '****';
  }
  return apiKey.slice(0, 4) + '****' + apiKey.slice(-4);
}

/**
 * Validate API key format
 * Accepts:
 * - CrecheBooks API keys: start with 'cb_' and are at least 20 characters
 * - JWT tokens: start with 'eyJ' (base64 encoded JSON)
 */
export function isValidApiKeyFormat(apiKey: string): boolean {
  // CrecheBooks API keys start with 'cb_' and are at least 20 characters
  if (apiKey.startsWith('cb_') && apiKey.length >= 20) {
    return true;
  }
  // JWT tokens start with 'eyJ' (base64 encoded '{"')
  if (apiKey.startsWith('eyJ') && apiKey.includes('.')) {
    return true;
  }
  return false;
}

/**
 * Validate tenant ID format
 */
export function isValidTenantIdFormat(tenantId: string): boolean {
  // Tenant IDs are UUIDs or cuid format
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const cuidPattern = /^c[a-z0-9]{24}$/;
  return uuidPattern.test(tenantId) || cuidPattern.test(tenantId);
}
