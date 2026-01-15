import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';
import * as crypto from 'crypto';
import {
  CsrfTokenMetadata,
  OAuthStateMetadata,
  ICsrfStore,
} from './interfaces/csrf-store.interface';

/**
 * Redis-backed CSRF Token Storage Service
 *
 * Provides secure CSRF token management for:
 * 1. OAuth state tokens - CSRF protection during OAuth flows
 * 2. User-bound tokens - CSRF protection for authenticated requests
 *
 * SECURITY FEATURES:
 * - Tokens are hashed (SHA-256) before storage - never stored in plaintext
 * - Constant-time comparison (crypto.timingSafeEqual) prevents timing attacks
 * - Automatic expiration via Redis TTL
 * - Fail-secure: operations fail if Redis unavailable (no fallback)
 *
 * KEY PATTERNS:
 * - OAuth state: csrf:state:{stateToken}
 * - User tokens: csrf:user:{userId}:{tokenHashPrefix}
 *
 * DISTRIBUTED SUPPORT:
 * All tokens are stored in Redis, allowing multiple API instances
 * to share state for consistent CSRF protection.
 */
@Injectable()
export class CsrfStoreService implements ICsrfStore {
  private readonly logger = new Logger(CsrfStoreService.name);

  /**
   * Redis key prefix for OAuth state tokens
   */
  private readonly STATE_KEY_PREFIX = 'csrf:state:';

  /**
   * Redis key prefix for user-bound CSRF tokens
   */
  private readonly USER_TOKEN_KEY_PREFIX = 'csrf:user:';

  /**
   * Default TTL for OAuth state tokens: 5 minutes (300 seconds)
   */
  private readonly DEFAULT_STATE_TTL_SECONDS = 300;

  /**
   * Default TTL for user-bound CSRF tokens: 1 hour (3600 seconds)
   */
  private readonly DEFAULT_TOKEN_TTL_SECONDS = 3600;

  constructor(private readonly redisService: RedisService) {}

  // ============================================================================
  // TOKEN GENERATION
  // ============================================================================

  /**
   * Generate a cryptographically secure CSRF token
   *
   * Uses crypto.randomBytes for true randomness and base64url
   * encoding for URL-safe tokens.
   *
   * @returns URL-safe random token (32 bytes = 43 characters)
   */
  generateToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  // ============================================================================
  // USER-BOUND CSRF TOKENS (ICsrfStore Implementation)
  // ============================================================================

  /**
   * Hash a token using SHA-256
   * @private
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Build Redis key for a user-bound token
   *
   * Uses first 16 chars of hash as key suffix for reasonable uniqueness
   * while keeping keys manageable for scanning.
   *
   * @private
   */
  private buildUserTokenKey(userId: string, token: string): string {
    const tokenHash = this.hashToken(token);
    return `${this.USER_TOKEN_KEY_PREFIX}${userId}:${tokenHash.slice(0, 16)}`;
  }

  /**
   * Store a CSRF token for a user
   *
   * The token is hashed before storage - plaintext is never persisted.
   *
   * @param userId - The user ID to associate with the token
   * @param token - The plaintext token (will be hashed)
   * @param ttlSeconds - Optional TTL in seconds (default: 3600)
   *
   * @throws Error if Redis is unavailable
   */
  async store(
    userId: string,
    token: string,
    ttlSeconds: number = this.DEFAULT_TOKEN_TTL_SECONDS,
  ): Promise<void> {
    const key = this.buildUserTokenKey(userId, token);
    const tokenHash = this.hashToken(token);

    const metadata: CsrfTokenMetadata = {
      userId,
      tokenHash,
      createdAt: Date.now(),
      expiresAt: Date.now() + ttlSeconds * 1000,
    };

    try {
      await this.redisService.set(key, JSON.stringify(metadata), ttlSeconds);
      this.logger.debug(
        `CSRF token stored for user ${userId.substring(0, 8)}... (TTL: ${ttlSeconds}s)`,
      );
    } catch (error) {
      const errorMsg = `Failed to store CSRF token in Redis: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Validate a CSRF token for a user
   *
   * SECURITY: Uses constant-time comparison to prevent timing attacks.
   * An attacker cannot determine token validity by measuring response time.
   *
   * @param userId - The user ID associated with the token
   * @param token - The plaintext token to validate
   * @returns true if valid, false otherwise
   *
   * @throws Error if Redis is unavailable
   */
  async validate(userId: string, token: string): Promise<boolean> {
    const key = this.buildUserTokenKey(userId, token);

    try {
      const data = await this.redisService.get(key);

      if (!data) {
        this.logger.debug(
          `CSRF token not found for user ${userId.substring(0, 8)}...`,
        );
        return false;
      }

      const metadata: CsrfTokenMetadata = JSON.parse(data);

      // Double-check expiration (Redis TTL should handle this, but defense in depth)
      if (metadata.expiresAt < Date.now()) {
        this.logger.debug(
          `CSRF token expired for user ${userId.substring(0, 8)}...`,
        );
        // Clean up expired token
        await this.redisService.delete(key);
        return false;
      }

      // Verify user ID matches
      if (metadata.userId !== userId) {
        this.logger.warn(
          `CSRF token user mismatch: expected ${userId.substring(0, 8)}..., got ${metadata.userId.substring(0, 8)}...`,
        );
        return false;
      }

      // Constant-time comparison to prevent timing attacks
      const providedHash = this.hashToken(token);
      const storedHashBuffer = Buffer.from(metadata.tokenHash, 'hex');
      const providedHashBuffer = Buffer.from(providedHash, 'hex');

      // Ensure buffers are same length before comparison
      if (storedHashBuffer.length !== providedHashBuffer.length) {
        return false;
      }

      const isValid = crypto.timingSafeEqual(
        storedHashBuffer,
        providedHashBuffer,
      );

      this.logger.debug(
        `CSRF token validation for user ${userId.substring(0, 8)}...: ${isValid ? 'valid' : 'invalid'}`,
      );

      return isValid;
    } catch (error) {
      const errorMsg = `Failed to validate CSRF token from Redis: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Invalidate a specific CSRF token
   *
   * @param userId - The user ID associated with the token
   * @param token - The token to invalidate
   *
   * @throws Error if Redis is unavailable
   */
  async invalidate(userId: string, token: string): Promise<void> {
    const key = this.buildUserTokenKey(userId, token);

    try {
      const deleted = await this.redisService.delete(key);
      this.logger.debug(
        `CSRF token ${deleted ? 'invalidated' : 'not found'} for user ${userId.substring(0, 8)}...`,
      );
    } catch (error) {
      const errorMsg = `Failed to invalidate CSRF token from Redis: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Invalidate all CSRF tokens for a user
   *
   * Used during logout, password change, or security events.
   * Uses Redis SCAN to safely iterate and delete matching keys.
   *
   * @param userId - The user ID to invalidate all tokens for
   *
   * @throws Error if Redis is unavailable
   */
  async invalidateAllForUser(userId: string): Promise<void> {
    const pattern = `${this.USER_TOKEN_KEY_PREFIX}${userId}:*`;

    try {
      const deletedCount = await this.redisService.deletePattern(pattern);
      this.logger.log(
        `Invalidated ${deletedCount} CSRF tokens for user ${userId.substring(0, 8)}...`,
      );
    } catch (error) {
      const errorMsg = `Failed to invalidate all CSRF tokens for user: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  // ============================================================================
  // OAUTH STATE TOKENS (Original Implementation)
  // ============================================================================

  /**
   * Build Redis key for an OAuth state token
   * @private
   */
  private buildStateKey(state: string): string {
    return `${this.STATE_KEY_PREFIX}${state}`;
  }

  /**
   * Store an OAuth state token in Redis
   *
   * Used during OAuth flow initiation for CSRF protection.
   *
   * @param state - The CSRF state token (random string)
   * @param redirectUri - The OAuth redirect URI associated with this state
   * @param ttlSeconds - Optional TTL in seconds (default: 300 / 5 minutes)
   *
   * @throws Error if Redis is unavailable
   */
  async storeState(
    state: string,
    redirectUri: string,
    ttlSeconds: number = this.DEFAULT_STATE_TTL_SECONDS,
  ): Promise<void> {
    const key = this.buildStateKey(state);
    const oauthState: OAuthStateMetadata = {
      redirectUri,
      expiresAt: Date.now() + ttlSeconds * 1000,
    };

    try {
      await this.redisService.set(key, JSON.stringify(oauthState), ttlSeconds);
      this.logger.debug(
        `OAuth state stored: ${state.substring(0, 8)}... (TTL: ${ttlSeconds}s)`,
      );
    } catch (error) {
      const errorMsg = `Failed to store OAuth state in Redis: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Retrieve an OAuth state from Redis
   *
   * @param state - The state token to look up
   * @returns The stored state metadata or null if not found/expired
   *
   * @throws Error if Redis is unavailable
   */
  async getState(state: string): Promise<OAuthStateMetadata | null> {
    const key = this.buildStateKey(state);

    try {
      const data = await this.redisService.get(key);

      if (!data) {
        this.logger.debug(`OAuth state not found: ${state.substring(0, 8)}...`);
        return null;
      }

      const oauthState = JSON.parse(data) as OAuthStateMetadata;

      // Double-check expiration
      if (oauthState.expiresAt < Date.now()) {
        this.logger.debug(`OAuth state expired: ${state.substring(0, 8)}...`);
        await this.deleteState(state);
        return null;
      }

      this.logger.debug(`OAuth state retrieved: ${state.substring(0, 8)}...`);
      return oauthState;
    } catch (error) {
      const errorMsg = `Failed to retrieve OAuth state from Redis: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Delete an OAuth state from Redis
   *
   * @param state - The state token to delete
   * @returns true if deleted, false if not found
   *
   * @throws Error if Redis is unavailable
   */
  async deleteState(state: string): Promise<boolean> {
    const key = this.buildStateKey(state);

    try {
      const deleted = await this.redisService.delete(key);
      this.logger.debug(
        `OAuth state ${deleted ? 'deleted' : 'not found'}: ${state.substring(0, 8)}...`,
      );
      return deleted;
    } catch (error) {
      const errorMsg = `Failed to delete OAuth state from Redis: ${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Validate and consume an OAuth state (get + delete atomically)
   *
   * This is the primary method for OAuth callback handling.
   * The state is deleted after retrieval (single-use token).
   *
   * @param state - The state token to validate
   * @returns The stored state metadata or null if not found/expired
   *
   * @throws Error if Redis is unavailable
   */
  async validateAndConsume(state: string): Promise<OAuthStateMetadata | null> {
    const oauthState = await this.getState(state);

    if (oauthState) {
      // Delete the state after retrieval (single-use token)
      await this.deleteState(state);
    }

    return oauthState;
  }

  /**
   * Check if Redis storage is available
   */
  async isAvailable(): Promise<boolean> {
    return Promise.resolve(this.redisService.isReady());
  }
}

/**
 * Re-export for backward compatibility
 * @deprecated Use OAuthStateMetadata instead
 */
export type CsrfState = OAuthStateMetadata;
