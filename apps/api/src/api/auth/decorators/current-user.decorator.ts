import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { IUser, UserRole } from '../../../database/entities/user.entity';

/**
 * Extended request interface with impersonation context
 * TASK-ADMIN-001: TenantGuard sets these fields for impersonating SUPER_ADMINs
 */
interface RequestWithUser extends Request {
  user?: IUser;
  /** Effective tenant ID (from user.tenantId or impersonation context) */
  effectiveTenantId?: string;
  /** Effective role (from user.role or impersonation context) */
  effectiveRole?: UserRole;
  /** Whether the request is from an impersonating SUPER_ADMIN */
  isImpersonating?: boolean;
}

/**
 * Extended user interface returned during impersonation
 */
export interface IUserWithEffectiveContext extends IUser {
  /** True if this is an impersonation session */
  isImpersonating?: boolean;
  /** The original SUPER_ADMIN's tenantId (null) preserved for audit */
  originalTenantId?: string | null;
}

/**
 * CurrentUser decorator
 *
 * Extracts the current user from the request and merges impersonation context.
 * During impersonation, `user.tenantId` returns the effective (impersonated) tenant
 * so that downstream code like `getTenantId(user)` works transparently.
 *
 * @example
 * ```typescript
 * @Get()
 * async getData(@CurrentUser() user: IUser) {
 *   // user.tenantId is the effective tenant (impersonated or real)
 *   return this.service.getData(user.tenantId);
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (
    data: keyof IUser | undefined,
    ctx: ExecutionContext,
  ): IUser | IUserWithEffectiveContext | IUser[keyof IUser] => {
    const request = ctx.switchToHttp().getRequest<RequestWithUser>();
    const user = request.user;

    if (!user) {
      return undefined as unknown as IUser;
    }

    // TASK-ADMIN-001: Merge impersonation context into user object
    // This allows getTenantId(user) to work transparently during impersonation
    if (request.isImpersonating && request.effectiveTenantId) {
      const effectiveUser: IUserWithEffectiveContext = {
        ...user,
        tenantId: request.effectiveTenantId, // Override with effective tenant
        role: request.effectiveRole ?? user.role,
        isImpersonating: true,
        originalTenantId: user.tenantId, // Preserve original for audit
      };
      return data ? effectiveUser[data] : effectiveUser;
    }

    return data ? user[data] : user;
  },
);
