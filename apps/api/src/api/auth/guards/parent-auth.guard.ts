/**
 * Parent Authentication Guard
 * TASK-PORTAL-012: Parent Portal Dashboard
 *
 * Guards parent portal routes by verifying the session token.
 * Uses the MagicLinkService to validate parent sessions.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { MagicLinkService } from '../services/magic-link.service';

@Injectable()
export class ParentAuthGuard implements CanActivate {
  private readonly logger = new Logger(ParentAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly magicLinkService: MagicLinkService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('No authorization header provided');
      throw new UnauthorizedException('No authentication token provided');
    }

    const token = authHeader.substring(7);

    try {
      const parent = await this.magicLinkService.verifySessionToken(token);

      if (!parent) {
        this.logger.warn('Invalid or expired parent session token');
        throw new UnauthorizedException('Invalid or expired session');
      }

      // Attach parent session info to request for use in controllers
      request.parentSession = {
        id: `session_${parent.id}`,
        parentId: parent.id,
        tenantId: parent.tenantId,
        parent: {
          id: parent.id,
          firstName: parent.firstName,
          lastName: parent.lastName,
          email: parent.email,
          tenantId: parent.tenantId,
        },
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(
        `Parent auth error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
