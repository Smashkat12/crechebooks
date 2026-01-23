/**
 * Tenant Guard
 * TASK-SEC-105: Enforce tenant context for non-admin routes
 *
 * @module api/auth/guards/tenant
 * @description Guard that ensures users have a tenantId to access tenant-scoped endpoints
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { IUser, UserRole } from '../../../database/entities/user.entity';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

interface RequestWithUser extends Request {
  user?: IUser;
}

/**
 * TenantGuard
 *
 * Architecture principle:
 * - SUPER_ADMIN users have null tenantId and can ONLY access /api/admin/* endpoints
 * - Regular users (OWNER, ADMIN, ACCOUNTANT, VIEWER) MUST have a tenantId
 * - This guard blocks SUPER_ADMIN from accessing tenant endpoints
 * - Admin endpoints are protected by @Roles(SUPER_ADMIN) so they bypass this check
 *
 * Order of guards in app.module.ts:
 * 1. ThrottlerGuard (rate limiting)
 * 2. JwtAuthGuard (authentication)
 * 3. TenantGuard (tenant context) <- THIS GUARD
 * 4. RolesGuard (authorization)
 */
@Injectable()
export class TenantGuard implements CanActivate {
  private readonly logger = new Logger(TenantGuard.name);

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if route is marked as public - skip tenant check
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      this.logger.debug('Public route accessed, skipping tenant check');
      return true;
    }

    // Check if route requires SUPER_ADMIN role - admin endpoints don't need tenant
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (requiredRoles?.includes(UserRole.SUPER_ADMIN)) {
      this.logger.debug('Admin endpoint accessed, skipping tenant check');
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;
    const path = request.url || 'unknown';
    const method = request.method || 'unknown';

    // If no user, JwtAuthGuard should have caught this first
    if (!user) {
      this.logger.warn(`TenantGuard: No user in request for ${method} ${path}`);
      // Allow through - JwtAuthGuard will handle authentication
      return true;
    }

    // SUPER_ADMIN should not access tenant endpoints
    if (user.role === UserRole.SUPER_ADMIN) {
      this.logger.warn(
        `TenantGuard: SUPER_ADMIN user ${user.id} attempted to access tenant endpoint ${method} ${path}`,
      );
      throw new ForbiddenException(
        'Platform administrators cannot access tenant endpoints. Use /api/admin/* routes instead.',
      );
    }

    // Regular users MUST have a tenantId
    if (!user.tenantId) {
      this.logger.error(
        `TenantGuard: Non-admin user ${user.id} (role: ${user.role}) missing tenantId on ${method} ${path}`,
      );
      throw new ForbiddenException(
        'Tenant context required. Please ensure you are assigned to a tenant.',
      );
    }

    this.logger.debug(
      `TenantGuard: User ${user.id} authorized with tenantId ${user.tenantId} for ${method} ${path}`,
    );

    return true;
  }
}
