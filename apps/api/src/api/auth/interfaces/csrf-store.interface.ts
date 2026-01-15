/**
 * CSRF Token Metadata stored in Redis
 *
 * Contains all necessary information for token validation
 * and lifecycle management.
 */
export interface CsrfTokenMetadata {
  /**
   * User ID the token belongs to
   */
  userId: string;

  /**
   * SHA-256 hash of the token (never store plaintext)
   */
  tokenHash: string;

  /**
   * Unix timestamp when token was created (milliseconds)
   */
  createdAt: number;

  /**
   * Unix timestamp when token expires (milliseconds)
   */
  expiresAt: number;

  /**
   * Optional session ID for session-bound tokens
   */
  sessionId?: string;
}

/**
 * OAuth State metadata for CSRF protection during OAuth flows
 */
export interface OAuthStateMetadata {
  /**
   * The redirect URI to return to after OAuth completes
   */
  redirectUri: string;

  /**
   * Unix timestamp when state expires (milliseconds)
   */
  expiresAt: number;
}

/**
 * CSRF Store Interface
 *
 * Defines the contract for CSRF token storage operations.
 * Implementations must ensure:
 * - Tokens are hashed before storage (never plaintext)
 * - Constant-time comparison for validation
 * - Automatic expiration via TTL
 * - Fail-secure behavior when storage unavailable
 */
export interface ICsrfStore {
  /**
   * Store a CSRF token for a user
   *
   * @param userId - The user ID to associate with the token
   * @param token - The plaintext token (will be hashed before storage)
   * @param ttlSeconds - Optional TTL in seconds (default: 3600)
   */
  store(userId: string, token: string, ttlSeconds?: number): Promise<void>;

  /**
   * Validate a CSRF token for a user
   *
   * Uses constant-time comparison to prevent timing attacks.
   *
   * @param userId - The user ID associated with the token
   * @param token - The plaintext token to validate
   * @returns true if valid, false otherwise
   */
  validate(userId: string, token: string): Promise<boolean>;

  /**
   * Invalidate a specific CSRF token
   *
   * @param userId - The user ID associated with the token
   * @param token - The token to invalidate
   */
  invalidate(userId: string, token: string): Promise<void>;

  /**
   * Invalidate all CSRF tokens for a user
   *
   * Used during logout or password change.
   *
   * @param userId - The user ID to invalidate all tokens for
   */
  invalidateAllForUser(userId: string): Promise<void>;
}

/**
 * Dependency injection token for CSRF store
 */
export const CSRF_STORE = Symbol('CSRF_STORE');
