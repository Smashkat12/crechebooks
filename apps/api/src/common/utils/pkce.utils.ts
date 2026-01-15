/**
 * PKCEUtils
 * TASK-INT-007: OAuth2 PKCE for Xero Integration
 *
 * RFC 7636 compliant Proof Key for Code Exchange (PKCE) implementation.
 * Provides protection against authorization code interception attacks.
 *
 * SECURITY PRINCIPLES:
 * - Uses cryptographically secure random bytes for verifier generation
 * - Implements S256 challenge method (SHA-256 hash)
 * - Uses timing-safe comparison for verification
 * - Base64URL encoding without padding per RFC 7636
 *
 * @see https://datatracker.ietf.org/doc/html/rfc7636
 */

import * as crypto from 'crypto';

/**
 * PKCE code pair containing verifier and challenge
 */
export interface PKCEPair {
  /** The code verifier - a high-entropy cryptographic random string */
  codeVerifier: string;
  /** The code challenge - transformed verifier for authorization request */
  codeChallenge: string;
  /** The challenge method - always 'S256' for this implementation */
  codeChallengeMethod: 'S256';
}

/**
 * PKCE utility class implementing RFC 7636
 *
 * Usage:
 * ```typescript
 * // Generate PKCE pair for OAuth flow
 * const pkce = PKCEUtils.generate();
 *
 * // Include in authorization URL:
 * // code_challenge=${pkce.codeChallenge}
 * // code_challenge_method=${pkce.codeChallengeMethod}
 *
 * // Store codeVerifier securely (encrypted in state)
 *
 * // On callback, include in token exchange:
 * // code_verifier=${pkce.codeVerifier}
 * ```
 */
export class PKCEUtils {
  /**
   * Minimum code verifier length per RFC 7636 Section 4.1
   * The spec requires minimum 43 characters
   */
  private static readonly MIN_VERIFIER_LENGTH = 43;

  /**
   * Maximum code verifier length per RFC 7636 Section 4.1
   * The spec allows maximum 128 characters
   */
  private static readonly MAX_VERIFIER_LENGTH = 128;

  /**
   * Default number of random bytes for verifier generation
   * 32 bytes = 43 base64url characters (after removing padding)
   */
  private static readonly DEFAULT_VERIFIER_BYTES = 32;

  /**
   * Generate a complete PKCE code pair
   *
   * @returns PKCEPair containing code verifier, challenge, and method
   *
   * @example
   * ```typescript
   * const { codeVerifier, codeChallenge, codeChallengeMethod } = PKCEUtils.generate();
   * // codeVerifier: store securely for token exchange
   * // codeChallenge: include in authorization URL
   * // codeChallengeMethod: always 'S256'
   * ```
   */
  static generate(): PKCEPair {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256',
    };
  }

  /**
   * Generate a cryptographically secure code verifier
   *
   * Per RFC 7636 Section 4.1, the code verifier must be:
   * - A high-entropy cryptographic random string
   * - Between 43 and 128 characters long
   * - Using unreserved characters: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
   *
   * Base64URL encoding satisfies these requirements.
   *
   * @param bytes - Number of random bytes to generate (default: 32)
   * @returns Base64URL encoded code verifier string
   * @throws Error if generated verifier is too short (should never happen with default)
   *
   * @example
   * ```typescript
   * const verifier = PKCEUtils.generateCodeVerifier();
   * // Result: 43-character base64url string like 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
   * ```
   */
  static generateCodeVerifier(
    bytes: number = this.DEFAULT_VERIFIER_BYTES,
  ): string {
    if (bytes < 32) {
      throw new Error(
        `Insufficient entropy: ${bytes} bytes provided, minimum 32 bytes required for secure PKCE`,
      );
    }

    const buffer = crypto.randomBytes(bytes);
    const verifier = this.base64UrlEncode(buffer);

    if (verifier.length < this.MIN_VERIFIER_LENGTH) {
      throw new Error(
        `Code verifier too short: ${verifier.length} < ${this.MIN_VERIFIER_LENGTH}. ` +
          `This should never happen - please report this bug.`,
      );
    }

    // Truncate to max length if necessary (unlikely with default bytes)
    return verifier.length > this.MAX_VERIFIER_LENGTH
      ? verifier.slice(0, this.MAX_VERIFIER_LENGTH)
      : verifier;
  }

  /**
   * Generate code challenge from code verifier using S256 method
   *
   * Per RFC 7636 Section 4.2, the S256 transformation is:
   * code_challenge = BASE64URL(SHA256(ASCII(code_verifier)))
   *
   * @param codeVerifier - The code verifier to transform
   * @returns Base64URL encoded SHA-256 hash of the verifier
   * @throws Error if code verifier is invalid (empty or too short)
   *
   * @example
   * ```typescript
   * // RFC 7636 Appendix B test vector
   * const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
   * const challenge = PKCEUtils.generateCodeChallenge(verifier);
   * // Result: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
   * ```
   */
  static generateCodeChallenge(codeVerifier: string): string {
    if (!codeVerifier) {
      throw new Error('Code verifier is required');
    }

    if (codeVerifier.length < this.MIN_VERIFIER_LENGTH) {
      throw new Error(
        `Invalid code verifier: length ${codeVerifier.length} is less than minimum ${this.MIN_VERIFIER_LENGTH}`,
      );
    }

    if (codeVerifier.length > this.MAX_VERIFIER_LENGTH) {
      throw new Error(
        `Invalid code verifier: length ${codeVerifier.length} exceeds maximum ${this.MAX_VERIFIER_LENGTH}`,
      );
    }

    // Validate character set per RFC 7636 Section 4.1
    // Allowed: [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
    const validCharsRegex = /^[A-Za-z0-9\-._~]+$/;
    if (!validCharsRegex.test(codeVerifier)) {
      throw new Error(
        'Invalid code verifier: contains characters outside the allowed set ' +
          '([A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~")',
      );
    }

    // Per RFC 7636: SHA256 hash of ASCII representation
    const hash = crypto
      .createHash('sha256')
      .update(codeVerifier, 'ascii')
      .digest();

    return this.base64UrlEncode(hash);
  }

  /**
   * Verify that a code verifier matches a code challenge
   *
   * Uses timing-safe comparison to prevent timing attacks.
   *
   * @param codeVerifier - The code verifier to check
   * @param codeChallenge - The code challenge to verify against
   * @returns true if verifier produces the challenge, false otherwise
   *
   * @example
   * ```typescript
   * const isValid = PKCEUtils.verify(codeVerifier, codeChallenge);
   * if (!isValid) {
   *   throw new Error('PKCE verification failed');
   * }
   * ```
   */
  static verify(codeVerifier: string, codeChallenge: string): boolean {
    try {
      const expectedChallenge = this.generateCodeChallenge(codeVerifier);

      // Use timing-safe comparison to prevent timing attacks
      // Both buffers must be same length for timingSafeEqual
      const expectedBuffer = Buffer.from(expectedChallenge, 'utf-8');
      const actualBuffer = Buffer.from(codeChallenge, 'utf-8');

      if (expectedBuffer.length !== actualBuffer.length) {
        return false;
      }

      return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
    } catch {
      // If challenge generation fails (invalid verifier), return false
      return false;
    }
  }

  /**
   * Validate that a code verifier meets RFC 7636 requirements
   *
   * @param codeVerifier - The code verifier to validate
   * @returns Object with isValid flag and optional error message
   */
  static validateVerifier(codeVerifier: string): {
    isValid: boolean;
    error?: string;
  } {
    if (!codeVerifier) {
      return { isValid: false, error: 'Code verifier is required' };
    }

    if (codeVerifier.length < this.MIN_VERIFIER_LENGTH) {
      return {
        isValid: false,
        error: `Code verifier too short: ${codeVerifier.length} < ${this.MIN_VERIFIER_LENGTH}`,
      };
    }

    if (codeVerifier.length > this.MAX_VERIFIER_LENGTH) {
      return {
        isValid: false,
        error: `Code verifier too long: ${codeVerifier.length} > ${this.MAX_VERIFIER_LENGTH}`,
      };
    }

    const validCharsRegex = /^[A-Za-z0-9\-._~]+$/;
    if (!validCharsRegex.test(codeVerifier)) {
      return {
        isValid: false,
        error: 'Code verifier contains invalid characters',
      };
    }

    return { isValid: true };
  }

  /**
   * Base64URL encode a buffer without padding
   *
   * Per RFC 7636 Section 3, base64url encoding must be done without padding.
   * This follows RFC 4648 Section 5 with padding characters removed.
   *
   * @param buffer - Buffer to encode
   * @returns Base64URL encoded string without padding
   */
  private static base64UrlEncode(buffer: Buffer): string {
    return buffer
      .toString('base64')
      .replace(/\+/g, '-') // Convert + to -
      .replace(/\//g, '_') // Convert / to _
      .replace(/=/g, ''); // Remove padding
  }
}
