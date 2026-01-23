/**
 * Tenant Assertion Utilities
 * TASK-SEC-105: Type-safe tenant assertions for controllers
 *
 * @module api/auth/utils/tenant-assertions
 * @description Helper functions to assert tenant context in controllers
 */

import { ForbiddenException } from '@nestjs/common';
import { IUser } from '../../../database/entities/user.entity';

/**
 * Type guard and assertion for tenant users
 * Ensures user has a non-null tenantId
 *
 * Usage in controllers:
 * ```typescript
 * @Get()
 * async getData(@GetUser() user: IUser) {
 *   const tenantUser = assertTenantUser(user);
 *   // tenantUser.tenantId is now string, not string | null
 *   return this.service.getData(tenantUser.tenantId);
 * }
 * ```
 *
 * @param user - User object from request
 * @throws {ForbiddenException} If user does not have a tenantId
 * @returns User object with tenantId guaranteed to be string
 */
export function assertTenantUser(
  user: IUser,
): asserts user is IUser & { tenantId: string } {
  if (!user.tenantId) {
    throw new ForbiddenException(
      'Tenant context required. User must be assigned to a tenant.',
    );
  }
}

/**
 * Type guard for tenant users (non-throwing version)
 * Checks if user has a tenantId without throwing
 *
 * Usage:
 * ```typescript
 * if (isTenantUser(user)) {
 *   // user.tenantId is string here
 *   return this.service.getData(user.tenantId);
 * }
 * ```
 *
 * @param user - User object to check
 * @returns True if user has a tenantId
 */
export function isTenantUser(
  user: IUser,
): user is IUser & { tenantId: string } {
  return user.tenantId !== null;
}

/**
 * Extract tenantId from user with proper type safety
 * Throws if tenantId is missing
 *
 * Usage:
 * ```typescript
 * const tenantId = getTenantId(req.user);
 * // tenantId is now string, not string | null
 * ```
 *
 * @param user - User object from request
 * @throws {ForbiddenException} If user does not have a tenantId
 * @returns The user's tenantId
 */
export function getTenantId(user: IUser): string {
  assertTenantUser(user);
  return user.tenantId;
}

/**
 * Tenant user type for use in controller method signatures
 * Represents a user that is guaranteed to have a tenantId
 *
 * Usage:
 * ```typescript
 * @Get()
 * async getData(@GetUser() user: TenantUser) {
 *   // user.tenantId is string, not string | null
 *   return this.service.getData(user.tenantId);
 * }
 * ```
 */
export type TenantUser = IUser & { tenantId: string };
