/**
 * Tenant Guard
 * TASK-SEC-105: Enforce tenant context for non-admin routes
 * TASK-ADMIN-001: Support impersonation context for SUPER_ADMIN users
 *
 * @module api/auth/guards/tenant
 * @description Guard that ensures users have a tenantId to access tenant-scoped endpoints.
 *              Supports impersonation context from JWT for SUPER_ADMIN users.
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

/**
 * Extended user interface with impersonation context
 */
interface IUserWithImpersonation extends IUser {
  impersonation?: {
    sessionId: string;
    tenantId: string;
    role: UserRole;
    startedAt: number;
    expiresAt: number;
  };
}

interface RequestWithUser extends Request {
  user?: IUserWithImpersonation;
  /**
   * TASK-ADMIN-001: Effective tenant ID (either from user.tenantId or impersonation context)
   */
  effectiveTenantId?: string;
  /**
   * TASK-ADMIN-001: Effective role (either from user.role or impersonation context)
   */
  effectiveRole?: UserRole;
  /**
   * TASK-ADMIN-001: Whether the request is from an impersonating SUPER_ADMIN
   */
  isImpersonating?: boolean;
}

/**
 * TenantGuard
 *
 * Architecture principle:
 * - SUPER_ADMIN users have null tenantId and can ONLY access /api/admin/* endpoints
 * - SUPER_ADMIN users WITH valid impersonation context CAN access tenant endpoints
 * - Regular users (OWNER, ADMIN, ACCOUNTANT, VIEWER) MUST have a tenantId
 * - This guard blocks SUPER_ADMIN from accessing tenant endpoints WITHOUT impersonation
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

    // TASK-ADMIN-001: Check for impersonation context
    if (user.role === UserRole.SUPER_ADMIN) {
      // Check if SUPER_ADMIN has valid impersonation context
      if (user.impersonation) {
        const now = Math.floor(Date.now() / 1000);

        // Validate impersonation hasn't expired
        if (user.impersonation.expiresAt > now) {
          // Set effective tenant and role on request for downstream handlers
          request.effectiveTenantId = user.impersonation.tenantId;
          request.effectiveRole = user.impersonation.role;
          request.isImpersonating = true;

          this.logger.debug(
            `TenantGuard: SUPER_ADMIN ${user.id} impersonating tenant ${user.impersonation.tenantId} as ${user.impersonation.role} for ${method} ${path}`,
          );
          return true;
        }

        // Impersonation expired
        this.logger.warn(
          `TenantGuard: Impersonation expired for SUPER_ADMIN ${user.id}`,
        );
      }

      // No valid impersonation - block access to tenant endpoints
      this.logger.warn(
        `TenantGuard: SUPER_ADMIN user ${user.id} attempted to access tenant endpoint ${method} ${path} without impersonation`,
      );
      throw new ForbiddenException(
        'Platform administrators cannot access tenant endpoints. Use /api/admin/* routes or start an impersonation session.',
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

    // Set effective values for regular users
    request.effectiveTenantId = user.tenantId;
    request.effectiveRole = user.role;
    request.isImpersonating = false;

    this.logger.debug(
      `TenantGuard: User ${user.id} authorized with tenantId ${user.tenantId} for ${method} ${path}`,
    );

    return true;
  }
}
