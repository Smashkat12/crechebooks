/**
 * API Key Authentication Guard
 *
 * TASK-CLI-001: Authenticate requests using API keys for CLI/MCP access
 *
 * This guard:
 * - Checks for X-API-Key header
 * - Falls back to JWT auth if no API key present
 * - Validates API key and attaches user context to request
 * - Tracks last used time and IP for security audits
 * - Enforces scope-based access control
 *
 * Usage:
 * - Add @UseGuards(ApiKeyAuthGuard) to controllers/routes
 * - Or configure globally in app.module
 */

import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
  CanActivate,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ApiKeyService } from '../services/api-key.service';
import { JwtAuthGuard } from './jwt-auth.guard';

// Custom header for API key authentication
const API_KEY_HEADER = 'x-api-key';

@Injectable()
export class ApiKeyAuthGuard implements CanActivate {
  private readonly logger = new Logger(ApiKeyAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly apiKeyService: ApiKeyService,
    private readonly jwtAuthGuard: JwtAuthGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      this.logger.debug('Public route accessed, skipping authentication');
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = this.extractApiKey(request);

    // If API key is present, use API key auth
    if (apiKey) {
      return this.authenticateWithApiKey(apiKey, request);
    }

    // Fall back to JWT authentication
    this.logger.debug('No API key found, falling back to JWT auth');
    return this.jwtAuthGuard.canActivate(context) as Promise<boolean>;
  }

  /**
   * Extract API key from request headers
   */
  private extractApiKey(request: Request): string | null {
    // Check X-API-Key header (case-insensitive)
    const apiKey = request.headers[API_KEY_HEADER] as string | undefined;

    if (apiKey && apiKey.startsWith('cb_')) {
      return apiKey;
    }

    // Also check Authorization header for Bearer cb_... format
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer cb_')) {
      return authHeader.slice(7); // Remove 'Bearer ' prefix
    }

    return null;
  }

  /**
   * Authenticate request using API key
   */
  private async authenticateWithApiKey(
    apiKey: string,
    request: Request,
  ): Promise<boolean> {
    const clientIp = this.getClientIp(request);

    this.logger.debug(`Authenticating with API key (prefix: ${apiKey.slice(0, 12)}...)`);

    const validated = await this.apiKeyService.validateApiKey(apiKey, clientIp);

    if (!validated) {
      this.logger.warn(`Invalid API key attempt from ${clientIp}`);
      throw new UnauthorizedException('Invalid or expired API key');
    }

    // Attach user and API key context to request
    (request as any).user = validated.user;
    (request as any).apiKey = validated.apiKey;
    (request as any).authMethod = 'api_key';

    this.logger.debug(
      `API key authenticated: user=${validated.user.email}, tenant=${validated.tenantId}`,
    );

    return true;
  }

  /**
   * Extract client IP address (handles proxies)
   */
  private getClientIp(request: Request): string {
    // Check common proxy headers
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      // x-forwarded-for can be comma-separated list, take first
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }

    const realIp = request.headers['x-real-ip'];
    if (realIp) {
      return Array.isArray(realIp) ? realIp[0] : realIp;
    }

    // Fall back to direct connection IP
    return request.ip || request.socket.remoteAddress || 'unknown';
  }
}

/**
 * Combined auth guard that supports both API keys and JWT
 * Use this as the default guard for all protected routes
 */
@Injectable()
export class CombinedAuthGuard extends ApiKeyAuthGuard {
  constructor(
    reflector: Reflector,
    apiKeyService: ApiKeyService,
    jwtAuthGuard: JwtAuthGuard,
  ) {
    super(reflector, apiKeyService, jwtAuthGuard);
  }
}
