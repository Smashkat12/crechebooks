/**
 * Current Parent Decorator
 * TASK-PORTAL-012: Parent Portal Dashboard
 *
 * Extracts the authenticated parent's session from the request.
 * Used with ParentAuthGuard to access parent info in controllers.
 */

import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface ParentSession {
  id: string;
  parentId: string;
  tenantId: string;
  parent: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    tenantId: string;
  };
}

export const CurrentParent = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): ParentSession => {
    const request = ctx.switchToHttp().getRequest();
    return request.parentSession;
  },
);
