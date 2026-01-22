/**
 * Current Staff Decorator
 * TASK-PORTAL-021: Staff Portal Layout and Authentication
 *
 * Extracts the authenticated staff member from the request.
 * Use this decorator in controllers protected by StaffAuthGuard.
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Staff session attached to request by StaffAuthGuard
 */
export interface StaffSessionInfo {
  id: string;
  staffId: string;
  tenantId: string;
  staff: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    tenantId: string;
    simplePayEmployeeId?: string;
    position?: string;
    department?: string;
  };
}

/**
 * Parameter decorator to get current authenticated staff member.
 *
 * @example
 * ```typescript
 * @Get('profile')
 * @UseGuards(StaffAuthGuard)
 * async getProfile(@CurrentStaff() session: StaffSessionInfo) {
 *   return session.staff;
 * }
 * ```
 */
export const CurrentStaff = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): StaffSessionInfo => {
    const request = ctx.switchToHttp().getRequest();
    return request.staffSession;
  },
);
