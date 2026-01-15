import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RateLimitService } from '../rate-limit/rate-limit.service';
import {
  RATE_LIMIT_KEY,
  RateLimitOptions,
} from '../decorators/rate-limit.decorator';
import { TooManyRequestsException } from '../../shared/exceptions';

/**
 * Request with potential user information
 */
interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    sub?: string;
  };
}

/**
 * Rate Limit Guard
 *
 * Enforces rate limits on endpoints decorated with @RateLimit().
 *
 * Features:
 * - Sliding window rate limiting using Redis
 * - Automatic IP-based or user-based limiting
 * - Adds X-RateLimit-* headers to responses
 * - Account lockout detection
 * - Exponential backoff tracking
 *
 * CRITICAL: If Redis is unavailable, requests will be REJECTED.
 * This is intentional to prevent authentication abuse when protection is unavailable.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get rate limit configuration from decorator
    const rateLimitOptions = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    // If no rate limit decorator, allow the request
    if (!rateLimitOptions) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    // Get identifier for rate limiting
    const identifier = this.getIdentifier(request, rateLimitOptions);

    // First, check if account is locked
    try {
      const isLocked = await this.rateLimitService.isAccountLocked(identifier);

      if (isLocked) {
        const lockoutRemaining =
          await this.rateLimitService.getLockoutRemaining(identifier);

        this.logger.warn(
          `Rate limit blocked - account locked: ${identifier}, remaining: ${lockoutRemaining}s`,
        );

        // Set rate limit headers
        this.setRateLimitHeaders(response, {
          limit: rateLimitOptions.limit,
          remaining: 0,
          retryAfter: lockoutRemaining,
        });

        throw new TooManyRequestsException(
          'Account temporarily locked due to too many failed attempts',
          lockoutRemaining,
          {
            lockoutRemaining,
            reason: 'account_locked',
          },
        );
      }
    } catch (error) {
      if (error instanceof TooManyRequestsException) {
        throw error;
      }

      // If Redis check fails, reject the request for security
      this.logger.error(
        `Rate limit lockout check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new TooManyRequestsException(
        'Rate limiting service unavailable. Please try again later.',
        60,
        { reason: 'service_unavailable' },
      );
    }

    // Check rate limit
    try {
      const result = await this.rateLimitService.checkRateLimit(
        `${rateLimitOptions.keyPrefix}:${identifier}`,
        rateLimitOptions.limit,
        rateLimitOptions.windowSeconds,
      );

      // Set rate limit headers
      this.setRateLimitHeaders(response, {
        limit: result.total,
        remaining: result.remaining,
        retryAfter: result.retryAfter,
      });

      if (!result.allowed) {
        this.logger.warn(
          `Rate limit exceeded: ${identifier} on ${rateLimitOptions.keyPrefix}`,
        );

        const errorMessage =
          rateLimitOptions.errorMessage ||
          `Too many requests. Please try again in ${result.retryAfter} seconds.`;

        throw new TooManyRequestsException(
          errorMessage,
          result.retryAfter || rateLimitOptions.windowSeconds,
          {
            limit: result.total,
            windowSeconds: result.windowSeconds,
            retryAfter: result.retryAfter,
          },
        );
      }

      return true;
    } catch (error) {
      if (error instanceof TooManyRequestsException) {
        throw error;
      }

      // If Redis check fails, reject the request for security
      this.logger.error(
        `Rate limit check failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new TooManyRequestsException(
        'Rate limiting service unavailable. Please try again later.',
        60,
        { reason: 'service_unavailable' },
      );
    }
  }

  /**
   * Get the identifier for rate limiting.
   * Uses user ID if authenticated and configured, otherwise falls back to IP.
   */
  private getIdentifier(
    request: AuthenticatedRequest,
    options: RateLimitOptions,
  ): string {
    // Use user ID if specified and user is authenticated
    if (options.useUserId && request.user) {
      const userId = request.user.id || request.user.sub;
      if (userId) {
        return `user:${userId}`;
      }
    }

    // Fall back to IP address
    const ip = this.getClientIp(request);
    return `ip:${ip}`;
  }

  /**
   * Extract client IP address from request.
   * Handles proxied requests using X-Forwarded-For header.
   */
  private getClientIp(request: Request): string {
    // Check for proxied requests
    const forwardedFor = request.headers['x-forwarded-for'];

    if (forwardedFor) {
      // X-Forwarded-For can contain multiple IPs, take the first one (client IP)
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }

    // Check for X-Real-IP header (common in nginx setups)
    const realIp = request.headers['x-real-ip'];
    if (realIp && typeof realIp === 'string') {
      return realIp.trim();
    }

    // Fall back to socket remote address
    return request.ip || request.socket.remoteAddress || 'unknown';
  }

  /**
   * Set rate limit headers on the response.
   */
  private setRateLimitHeaders(
    response: Response,
    info: {
      limit: number;
      remaining: number;
      retryAfter?: number;
    },
  ): void {
    response.setHeader('X-RateLimit-Limit', info.limit);
    response.setHeader('X-RateLimit-Remaining', Math.max(0, info.remaining));

    if (info.retryAfter !== undefined && info.retryAfter > 0) {
      response.setHeader('Retry-After', info.retryAfter);
      response.setHeader(
        'X-RateLimit-Reset',
        Math.ceil(Date.now() / 1000) + info.retryAfter,
      );
    }
  }
}
