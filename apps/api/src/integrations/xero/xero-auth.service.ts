/**
 * XeroAuthService
 * TASK-INT-002: Remove Default OAuth State Key
 * TASK-INT-007: OAuth2 PKCE for Xero Integration
 *
 * Secure OAuth state management for Xero integration.
 * Uses AES-256-GCM for authenticated encryption with fail-fast
 * validation to prevent CSRF attacks.
 *
 * SECURITY PRINCIPLES:
 * - NO FALLBACK: Fails fast if XERO_STATE_KEY not configured
 * - AES-256-GCM: Authenticated encryption with tamper detection
 * - TIMESTAMP VALIDATION: Prevents replay attacks
 * - NONCE GENERATION: Ensures state uniqueness
 * - PKCE SUPPORT: RFC 7636 compliant code challenge for enhanced security
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { PKCEUtils, PKCEPair } from '../../common/utils/pkce.utils';

/**
 * OAuth state payload for CSRF protection
 */
export interface OAuthStatePayload {
  tenantId: string;
  returnUrl: string;
  createdAt: number;
  nonce: string;
  /** PKCE code verifier - stored encrypted in state for token exchange */
  codeVerifier?: string;
}

/**
 * Internal state data with timestamp for replay protection
 */
interface StateData extends OAuthStatePayload {
  timestamp: number;
}

@Injectable()
export class XeroAuthService implements OnModuleInit {
  private readonly logger = new Logger(XeroAuthService.name);
  private stateKey!: Buffer;

  /** Default state expiration: 10 minutes */
  private readonly DEFAULT_STATE_MAX_AGE_MS = 10 * 60 * 1000;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Validates configuration on module initialization.
   * Fails fast if XERO_STATE_KEY is missing or invalid.
   */
  onModuleInit(): void {
    const stateKey = this.configService.get<string>('XERO_STATE_KEY');

    if (!stateKey) {
      throw new Error(
        'CRITICAL: XERO_STATE_KEY environment variable is required for secure OAuth. ' +
          'This key is used to encrypt/decrypt the OAuth state parameter to prevent CSRF attacks. ' +
          'Generate a secure key with: openssl rand -base64 32',
      );
    }

    if (stateKey.length < 32) {
      throw new Error(
        'CRITICAL: XERO_STATE_KEY must be at least 32 characters for secure AES-256 encryption. ' +
          `Current length: ${stateKey.length}. ` +
          'Generate a secure key with: openssl rand -base64 32',
      );
    }

    // Use first 32 bytes for AES-256
    this.stateKey = Buffer.from(stateKey, 'utf-8').subarray(0, 32);
    this.logger.log('Xero OAuth state encryption initialized');
  }

  /**
   * Generate encrypted state for OAuth flow using AES-256-GCM.
   *
   * The state parameter includes:
   * - Original payload (tenantId, returnUrl, createdAt)
   * - Additional nonce for uniqueness
   * - Timestamp for replay attack prevention
   *
   * Output format: base64url(iv[12] + authTag[16] + ciphertext)
   *
   * @param payload - OAuth state payload containing tenant and return information
   * @returns Base64URL encoded encrypted state string
   */
  generateState(payload: OAuthStatePayload): string {
    const stateData: StateData = {
      ...payload,
      nonce: randomBytes(16).toString('hex'),
      timestamp: Date.now(),
    };

    // Use AES-256-GCM for authenticated encryption
    // GCM provides both confidentiality and integrity
    const iv = randomBytes(12); // 96-bit IV for GCM
    const cipher = createCipheriv('aes-256-gcm', this.stateKey, iv);

    const stateJson = JSON.stringify(stateData);
    let encrypted = cipher.update(stateJson, 'utf8');
    const final = cipher.final();
    encrypted = Buffer.concat([encrypted, final]);

    // Get authentication tag (16 bytes for GCM)
    const authTag = cipher.getAuthTag();

    // Format: iv(12 bytes) + authTag(16 bytes) + encrypted data
    const combined = Buffer.concat([iv, authTag, encrypted]);

    return combined.toString('base64url');
  }

  /**
   * Validate and decrypt OAuth state.
   *
   * Performs:
   * 1. Base64URL decoding
   * 2. Length validation
   * 3. AES-256-GCM decryption with authentication
   * 4. Timestamp validation for replay attack prevention
   *
   * @param encryptedState - Base64URL encoded state from OAuth callback
   * @param maxAgeMs - Maximum age of state in milliseconds (default: 10 minutes)
   * @returns Decrypted and validated OAuth state payload
   * @throws UnauthorizedException if state is invalid, tampered, or expired
   */
  validateState(
    encryptedState: string,
    maxAgeMs: number = this.DEFAULT_STATE_MAX_AGE_MS,
  ): OAuthStatePayload {
    try {
      const data = Buffer.from(encryptedState, 'base64url');

      // Minimum length: 12 (iv) + 16 (authTag) = 28 bytes
      if (data.length < 28) {
        throw new UnauthorizedException('Invalid OAuth state: malformed data');
      }

      // Extract components
      const iv = data.subarray(0, 12);
      const authTag = data.subarray(12, 28);
      const encrypted = data.subarray(28);

      // Decrypt with GCM authentication
      const decipher = createDecipheriv('aes-256-gcm', this.stateKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted);
      decrypted = Buffer.concat([decrypted, decipher.final()]);

      const stateData = JSON.parse(decrypted.toString('utf8')) as StateData;

      // Validate timestamp for replay attack prevention
      const age = Date.now() - stateData.timestamp;
      if (age > maxAgeMs) {
        this.logger.warn(
          `OAuth state expired: age=${age}ms, maxAge=${maxAgeMs}ms`,
        );
        throw new UnauthorizedException(
          'OAuth state has expired. Please try again.',
        );
      }

      // Return only the payload fields (excluding internal timestamp)
      // Include codeVerifier if present (for PKCE flows)
      return {
        tenantId: stateData.tenantId,
        returnUrl: stateData.returnUrl,
        createdAt: stateData.createdAt,
        nonce: stateData.nonce,
        ...(stateData.codeVerifier && { codeVerifier: stateData.codeVerifier }),
      };
    } catch (error) {
      // Re-throw UnauthorizedException as-is
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      // Log the actual error for debugging but return generic message
      this.logger.warn(
        'OAuth state validation failed',
        error instanceof Error ? error.message : String(error),
      );
      throw new UnauthorizedException('Invalid OAuth state parameter');
    }
  }

  /**
   * Generate PKCE code pair for OAuth flow.
   *
   * Creates a cryptographically secure code verifier and corresponding
   * SHA-256 code challenge per RFC 7636.
   *
   * @returns PKCEPair containing codeVerifier, codeChallenge, and method
   *
   * @example
   * ```typescript
   * const pkce = authService.generatePKCE();
   * // Use pkce.codeChallenge in authorization URL
   * // Store pkce.codeVerifier securely in encrypted state
   * ```
   */
  generatePKCE(): PKCEPair {
    return PKCEUtils.generate();
  }

  /**
   * Generate authorization URL with PKCE support.
   *
   * This method:
   * 1. Generates a PKCE code pair
   * 2. Creates encrypted state containing the code verifier
   * 3. Returns the authorization URL parameters including code_challenge
   *
   * @param tenantId - The tenant ID for the OAuth flow
   * @param returnUrl - The URL to return to after OAuth completion
   * @param baseAuthUrl - The base authorization URL from the OAuth provider
   * @returns Object containing the full auth URL and encrypted state
   *
   * @example
   * ```typescript
   * const { authUrl, state, codeChallenge, codeChallengeMethod } =
   *   authService.generateAuthorizationUrlWithPKCE(
   *     tenantId,
   *     'https://app.example.com/callback',
   *     xeroClient.buildConsentUrl()
   *   );
   *
   * // Store state in database
   * // Redirect user to authUrl
   * ```
   */
  generateAuthorizationUrlWithPKCE(
    tenantId: string,
    returnUrl: string,
    baseAuthUrl: string,
  ): {
    authUrl: string;
    state: string;
    codeChallenge: string;
    codeChallengeMethod: 'S256';
  } {
    // Generate PKCE pair
    const pkce = this.generatePKCE();

    // Create state payload with code verifier embedded
    const statePayload: OAuthStatePayload = {
      tenantId,
      returnUrl,
      createdAt: Date.now(),
      nonce: randomBytes(16).toString('hex'),
      codeVerifier: pkce.codeVerifier,
    };

    // Encrypt the state (including code verifier)
    const state = this.generateState(statePayload);

    // Build authorization URL with PKCE parameters
    const authUrl = this.buildAuthUrlWithPKCE(
      baseAuthUrl,
      state,
      pkce.codeChallenge,
      pkce.codeChallengeMethod,
    );

    return {
      authUrl,
      state,
      codeChallenge: pkce.codeChallenge,
      codeChallengeMethod: pkce.codeChallengeMethod,
    };
  }

  /**
   * Validate state and extract code verifier for PKCE token exchange.
   *
   * This is a convenience method that validates the state and ensures
   * a code verifier is present for PKCE flows.
   *
   * @param encryptedState - The encrypted state from OAuth callback
   * @param maxAgeMs - Maximum age of state in milliseconds
   * @returns Validated payload with guaranteed codeVerifier
   * @throws UnauthorizedException if state is invalid or missing code verifier
   */
  validateStateWithPKCE(
    encryptedState: string,
    maxAgeMs: number = this.DEFAULT_STATE_MAX_AGE_MS,
  ): OAuthStatePayload & { codeVerifier: string } {
    const payload = this.validateState(encryptedState, maxAgeMs);

    if (!payload.codeVerifier) {
      this.logger.warn(
        'PKCE validation failed: missing code verifier in state',
      );
      throw new UnauthorizedException(
        'Invalid OAuth state: missing PKCE code verifier',
      );
    }

    return payload as OAuthStatePayload & { codeVerifier: string };
  }

  /**
   * Build authorization URL with PKCE parameters.
   *
   * @param baseUrl - The base authorization URL
   * @param state - The encrypted state parameter
   * @param codeChallenge - The PKCE code challenge
   * @param codeChallengeMethod - The challenge method (always S256)
   * @returns Complete authorization URL with all parameters
   */
  private buildAuthUrlWithPKCE(
    baseUrl: string,
    state: string,
    codeChallenge: string,
    codeChallengeMethod: 'S256',
  ): string {
    const url = new URL(baseUrl);

    // Add PKCE parameters
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', codeChallengeMethod);
    url.searchParams.set('state', state);

    return url.toString();
  }
}
