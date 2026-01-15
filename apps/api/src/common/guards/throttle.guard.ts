/**
 * Custom Throttler Guard
 * TASK-INFRA-003: Global Rate Limiting
 *
 * Extends NestJS ThrottlerGuard to extract client identifier from
 * API key, user ID, or IP address for rate limiting tracking.
 */

import { Injectable, ExecutionContext, Logger } from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { Request } from 'express';

/**
 * Request with potential user information
 */
interface AuthenticatedRequest extends Request {
  user?: {
    id?: string;
    sub?: string;
  };
}

@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(CustomThrottlerGuard.name);

  /**
   * Get tracker identifier for rate limiting
   * Priority: API Key > User ID > IP Address
   */
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const authRequest = req as unknown as AuthenticatedRequest;

    // Priority 1: API Key header
    const headers = (req as unknown as Request).headers || {};
    const apiKey = headers['x-api-key'] as string | undefined;
    if (apiKey) {
      return `api:${apiKey}`;
    }

    // Priority 2: Authenticated user ID
    const userId = authRequest.user?.id || authRequest.user?.sub;
    if (userId) {
      return `user:${userId}`;
    }

    // Priority 3: IP Address (with proxy support)
    const ip = this.getClientIp(req as unknown as Request);
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
    return request.ip || request.socket?.remoteAddress || 'unknown';
  }

  /**
   * Custom throttling exception with clear message
   */
  protected async throwThrottlingException(
    _context: ExecutionContext,
    _throttlerLimitDetail: {
      limit: number;
      ttl: number;
      key: string;
      tracker: string;
      totalHits: number;
      timeToExpire: number;
    },
  ): Promise<void> {
    this.logger.warn(
      `Rate limit exceeded for tracker: ${_throttlerLimitDetail.tracker}, ` +
        `hits: ${_throttlerLimitDetail.totalHits}/${_throttlerLimitDetail.limit}`,
    );

    throw new ThrottlerException(
      'Rate limit exceeded. Please slow down and try again later.',
    );
  }

  /**
   * Skip throttling for certain routes
   */
  protected async shouldSkip(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.path;

    // Skip health endpoints - they should always be accessible
    if (path === '/health' || path.startsWith('/health/')) {
      return true;
    }

    return super.shouldSkip(context);
  }
}
