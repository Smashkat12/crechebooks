/**
 * Failed Attempts Service
 *
 * TASK-SEC-004: Specialized service for tracking failed authentication attempts
 * with exponential backoff and account lockout functionality.
 *
 * This service provides a clean, auth-focused API for managing failed login attempts.
 * It wraps the underlying RateLimitService to provide authentication-specific functionality.
 *
 * Features:
 * - Track failed login attempts by email and/or IP
 * - Automatic account lockout after max failures
 * - Exponential backoff delays
 * - Clear attempts on successful login
 * - Redis-backed for distributed deployments
 *
 * CRITICAL: If Redis is unavailable, operations will throw errors.
 * This is intentional to prevent authentication abuse when protection is unavailable.
 */

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';

/**
 * Information about an authentication attempt
 */
export interface AttemptInfo {
  /** Number of failed attempts recorded */
  count: number;
  /** Timestamp of the last failed attempt */
  lastAttempt: number;
  /** Timestamp when the lockout expires (if locked) */
  lockedUntil?: number;
  /** Whether the account is currently locked */
  isLocked: boolean;
  /** Backoff delay in seconds (0 if no backoff needed) */
  backoffSeconds: number;
}

/**
 * Result of checking if an identifier is locked
 */
export interface LockStatus {
  /** Whether the identifier is currently locked */
  locked: boolean;
  /** Remaining time in seconds until unlock (if locked) */
  remainingTime?: number;
  /** Reason for the lock */
  reason?: string;
}

/**
 * Configuration for the failed attempts tracking
 */
export interface FailedAttemptsConfig {
  /** Maximum number of failed attempts before lockout */
  maxAttempts: number;
  /** Duration of lockout in milliseconds */
  lockoutDuration: number;
  /** Duration of the sliding window for attempts in milliseconds */
  windowDuration: number;
  /** Number of failures before exponential backoff starts */
  backoffThreshold: number;
  /** Base delay for exponential backoff in milliseconds */
  baseDelay: number;
  /** Maximum delay for exponential backoff in milliseconds */
  maxDelay: number;
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: FailedAttemptsConfig = {
  maxAttempts: 5,
  lockoutDuration: 15 * 60 * 1000, // 15 minutes
  windowDuration: 15 * 60 * 1000, // 15 minutes
  backoffThreshold: 2,
  baseDelay: 1000, // 1 second
  maxDelay: 30000, // 30 seconds
};

@Injectable()
export class FailedAttemptsService implements OnModuleInit {
  private readonly logger = new Logger(FailedAttemptsService.name);
  private readonly keyPrefix = 'auth:attempts:';
  private config: FailedAttemptsConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly rateLimitService: RateLimitService,
  ) {
    this.config = this.loadConfig();
  }

  /**
   * Initialize the service and log configuration
   */
  onModuleInit(): void {
    this.logger.log(
      `FailedAttemptsService initialized with config: maxAttempts=${this.config.maxAttempts}, ` +
        `lockoutDuration=${this.config.lockoutDuration / 1000}s, backoffThreshold=${this.config.backoffThreshold}`,
    );
  }

  /**
   * Load configuration from environment variables with defaults
   */
  private loadConfig(): FailedAttemptsConfig {
    return {
      maxAttempts:
        this.configService.get<number>('AUTH_MAX_FAILED_ATTEMPTS') ||
        DEFAULT_CONFIG.maxAttempts,
      lockoutDuration:
        (this.configService.get<number>('AUTH_LOCKOUT_DURATION_SECONDS') ||
          DEFAULT_CONFIG.lockoutDuration / 1000) * 1000,
      windowDuration:
        (this.configService.get<number>('AUTH_ATTEMPT_WINDOW_SECONDS') ||
          DEFAULT_CONFIG.windowDuration / 1000) * 1000,
      backoffThreshold:
        this.configService.get<number>('AUTH_BACKOFF_THRESHOLD') ||
        DEFAULT_CONFIG.backoffThreshold,
      baseDelay:
        this.configService.get<number>('AUTH_BACKOFF_BASE_DELAY_MS') ||
        DEFAULT_CONFIG.baseDelay,
      maxDelay:
        this.configService.get<number>('AUTH_BACKOFF_MAX_DELAY_MS') ||
        DEFAULT_CONFIG.maxDelay,
    };
  }

  /**
   * Record a failed authentication attempt for an identifier.
   *
   * @param identifier - Unique identifier (email, IP, or combined key)
   * @returns AttemptInfo with current status
   * @throws Error if Redis is unavailable
   */
  async recordFailedAttempt(identifier: string): Promise<AttemptInfo> {
    const normalizedKey = this.normalizeIdentifier(identifier);

    try {
      const result =
        await this.rateLimitService.trackFailedAttempt(normalizedKey);

      const attemptInfo: AttemptInfo = {
        count: result.attempts,
        lastAttempt: Date.now(),
        isLocked: result.isLocked,
        backoffSeconds: result.backoffSeconds,
        lockedUntil: result.isLocked
          ? Date.now() + this.config.lockoutDuration
          : undefined,
      };

      // Log security event
      if (result.isLocked) {
        this.logger.warn(
          `SECURITY: Account locked for ${identifier} after ${result.attempts} failed attempts`,
        );
      } else if (result.attempts > this.config.backoffThreshold) {
        this.logger.warn(
          `SECURITY: Failed attempt ${result.attempts}/${this.config.maxAttempts} for ${identifier}, ` +
            `backoff: ${result.backoffSeconds}s`,
        );
      }

      return attemptInfo;
    } catch (error) {
      this.logger.error(
        `Failed to record attempt for ${identifier}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Check if an identifier is currently locked.
   *
   * @param identifier - Unique identifier to check
   * @returns LockStatus with lock information
   * @throws Error if Redis is unavailable
   */
  async isLocked(identifier: string): Promise<LockStatus> {
    const normalizedKey = this.normalizeIdentifier(identifier);

    try {
      const locked = await this.rateLimitService.isAccountLocked(normalizedKey);

      if (locked) {
        const remainingTime =
          await this.rateLimitService.getLockoutRemaining(normalizedKey);

        return {
          locked: true,
          remainingTime,
          reason: 'Too many failed authentication attempts',
        };
      }

      return { locked: false };
    } catch (error) {
      this.logger.error(
        `Failed to check lock status for ${identifier}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Clear all failed attempts for an identifier.
   * Call this on successful authentication.
   *
   * @param identifier - Unique identifier to clear
   * @throws Error if Redis is unavailable
   */
  async clearAttempts(identifier: string): Promise<void> {
    const normalizedKey = this.normalizeIdentifier(identifier);

    try {
      await this.rateLimitService.clearFailedAttempts(normalizedKey);
      this.logger.debug(`Cleared failed attempts for ${identifier}`);
    } catch (error) {
      this.logger.error(
        `Failed to clear attempts for ${identifier}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Unlock an account manually (admin function).
   *
   * @param identifier - Unique identifier to unlock
   * @throws Error if Redis is unavailable
   */
  async unlockAccount(identifier: string): Promise<void> {
    const normalizedKey = this.normalizeIdentifier(identifier);

    try {
      await this.rateLimitService.unlockAccount(normalizedKey);
      this.logger.log(`SECURITY: Account manually unlocked for ${identifier}`);
    } catch (error) {
      this.logger.error(
        `Failed to unlock account ${identifier}: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Calculate the exponential backoff delay based on attempt count.
   *
   * @param attemptCount - Number of failed attempts
   * @returns Delay in milliseconds (0 if no backoff needed)
   */
  getBackoffDelay(attemptCount: number): number {
    // No backoff for first N attempts (based on threshold)
    if (attemptCount <= this.config.backoffThreshold) {
      return 0;
    }

    // Exponential backoff: baseDelay * 2^(attempts - threshold - 1)
    // e.g., with threshold=2: attempt 3 = 1s, attempt 4 = 2s, attempt 5 = 4s, etc.
    const power = attemptCount - this.config.backoffThreshold - 1;
    const delay = this.config.baseDelay * Math.pow(2, power);

    // Cap at maximum delay
    return Math.min(delay, this.config.maxDelay);
  }

  /**
   * Check both email and IP for lockout status.
   * Returns locked if either is locked.
   *
   * @param email - User email
   * @param ip - Client IP address
   * @returns Combined lock status
   */
  async checkCombinedLockStatus(
    email: string,
    ip?: string,
  ): Promise<LockStatus> {
    const emailStatus = await this.isLocked(`email:${email}`);

    if (emailStatus.locked) {
      return emailStatus;
    }

    if (ip) {
      const ipStatus = await this.isLocked(`ip:${ip}`);
      if (ipStatus.locked) {
        return ipStatus;
      }
    }

    return { locked: false };
  }

  /**
   * Record failed attempt for both email and IP.
   * Returns the highest backoff from both.
   *
   * @param email - User email
   * @param ip - Client IP address (optional)
   * @returns Combined attempt info with highest backoff
   */
  async recordCombinedFailedAttempt(
    email: string,
    ip?: string,
  ): Promise<AttemptInfo> {
    const emailResult = await this.recordFailedAttempt(`email:${email}`);

    if (!ip) {
      return emailResult;
    }

    const ipResult = await this.recordFailedAttempt(`ip:${ip}`);

    // Return the result with the highest backoff/severity
    return {
      count: Math.max(emailResult.count, ipResult.count),
      lastAttempt: Date.now(),
      isLocked: emailResult.isLocked || ipResult.isLocked,
      backoffSeconds: Math.max(
        emailResult.backoffSeconds,
        ipResult.backoffSeconds,
      ),
      lockedUntil:
        emailResult.lockedUntil || ipResult.lockedUntil
          ? Math.max(emailResult.lockedUntil || 0, ipResult.lockedUntil || 0)
          : undefined,
    };
  }

  /**
   * Clear attempts for both email and IP on successful login.
   *
   * @param email - User email
   * @param ip - Client IP address (optional)
   */
  async clearCombinedAttempts(email: string, ip?: string): Promise<void> {
    await this.clearAttempts(`email:${email}`);

    if (ip) {
      await this.clearAttempts(`ip:${ip}`);
    }
  }

  /**
   * Get the current configuration.
   */
  getConfig(): Readonly<FailedAttemptsConfig> {
    return { ...this.config };
  }

  /**
   * Normalize an identifier to ensure consistent key format.
   */
  private normalizeIdentifier(identifier: string): string {
    // If identifier already has a prefix (email:, ip:), use it as-is
    if (
      identifier.startsWith('email:') ||
      identifier.startsWith('ip:') ||
      identifier.startsWith('user:')
    ) {
      return identifier;
    }

    // Otherwise, assume it's a generic identifier
    return identifier;
  }
}
