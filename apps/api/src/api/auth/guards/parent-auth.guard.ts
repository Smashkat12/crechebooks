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
import { MagicLinkService } from '../services/magic-link.service';

@Injectable()
export class ParentAuthGuard implements CanActivate {
  private readonly logger = new Logger(ParentAuthGuard.name);

  constructor(
    private readonly magicLinkService: MagicLinkService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // ParentAuthGuard always authenticates — it does not check @Public().
    // The @Public() decorator is for global guards (JwtAuthGuard, TenantGuard).
    // This guard is applied explicitly via @UseGuards and must always run.
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
