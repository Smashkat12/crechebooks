import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { UserRole, IUser } from '../../../database/entities/user.entity';
import { ROLES_KEY } from '../decorators/roles.decorator';

interface RequestWithUser extends Request {
  user?: IUser;
}

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required roles from decorator
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no roles specified, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    const path = request.url || 'unknown';
    const method = request.method || 'unknown';

    // If no user (should be caught by JwtAuthGuard first), deny
    if (!user) {
      this.logger.warn(`RolesGuard: No user in request for ${method} ${path}`);
      throw new ForbiddenException('Access denied: user not authenticated');
    }

    // Check if user has any of the required roles
    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      this.logger.warn(
        `Insufficient permissions for user ${user.id} (role: ${user.role}) on ${method} ${path}. Required: ${requiredRoles.join(', ')}`,
      );
      throw new ForbiddenException(
        `Insufficient permissions: required role ${requiredRoles.join(' or ')}`,
      );
    }

    this.logger.debug(
      `RolesGuard: User ${user.id} authorized with role ${user.role} for ${method} ${path}`,
    );

    return true;
  }
}
