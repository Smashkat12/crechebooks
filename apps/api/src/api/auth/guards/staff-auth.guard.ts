/**
 * Staff Authentication Guard
 * TASK-PORTAL-021: Staff Portal Layout and Authentication
 *
 * Guards staff portal routes by verifying the session token.
 * Uses the StaffMagicLinkService to validate staff sessions.
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
import { StaffMagicLinkService } from '../services/staff-magic-link.service';

@Injectable()
export class StaffAuthGuard implements CanActivate {
  private readonly logger = new Logger(StaffAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly staffMagicLinkService: StaffMagicLinkService,
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
      const staff = await this.staffMagicLinkService.verifySessionToken(token);

      if (!staff) {
        this.logger.warn('Invalid or expired staff session token');
        throw new UnauthorizedException('Invalid or expired session');
      }

      // Attach staff session info to request for use in controllers
      request.staffSession = {
        id: `session_${staff.id}`,
        staffId: staff.id,
        tenantId: staff.tenantId,
        staff: {
          id: staff.id,
          firstName: staff.firstName,
          lastName: staff.lastName,
          email: staff.email,
          tenantId: staff.tenantId,
          simplePayEmployeeId: staff.simplePayEmployeeId,
          position: staff.position,
          department: staff.department,
        },
      };

      return true;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(
        `Staff auth error: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw new UnauthorizedException('Authentication failed');
    }
  }
}
