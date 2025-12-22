import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../../../../src/api/auth/guards/roles.guard';
import { ROLES_KEY } from '../../../../src/api/auth/decorators/roles.decorator';
import { UserRole } from '../../../../src/database/entities/user.entity';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const createMockExecutionContext = (
    requiredRoles: UserRole[] | undefined,
    userRole: UserRole,
  ): ExecutionContext => {
    const mockRequest = {
      user: {
        userId: '123',
        email: 'test@example.com',
        role: userRole,
      },
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  };

  describe('No Roles Required', () => {
    it('should allow requests without @Roles decorator', () => {
      const context = createMockExecutionContext(undefined, UserRole.VIEWER);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow any role when no roles specified', () => {
      const context = createMockExecutionContext(undefined, UserRole.ADMIN);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });

  describe('Role-Based Access Control', () => {
    it('should block requests with wrong role', () => {
      const context = createMockExecutionContext(
        [UserRole.ADMIN],
        UserRole.VIEWER,
      );
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.ADMIN]);

      try {
        guard.canActivate(context);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect(error.message).toContain('Insufficient permissions');
      }
    });

    it('should allow requests with correct role', () => {
      const context = createMockExecutionContext(
        [UserRole.ADMIN],
        UserRole.ADMIN,
      );
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.ADMIN]);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should allow requests when user has one of multiple required roles', () => {
      const context = createMockExecutionContext(
        [UserRole.ADMIN, UserRole.EDITOR],
        UserRole.EDITOR,
      );
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.ADMIN, UserRole.EDITOR]);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should block when user does not have any of required roles', () => {
      const context = createMockExecutionContext(
        [UserRole.ADMIN, UserRole.EDITOR],
        UserRole.VIEWER,
      );
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.ADMIN, UserRole.EDITOR]);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('Error Messages', () => {
    it('should include required role in error message', () => {
      const context = createMockExecutionContext(
        [UserRole.ADMIN],
        UserRole.VIEWER,
      );
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.ADMIN]);

      try {
        guard.canActivate(context);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect(error.message).toBe(
          'Insufficient permissions: required role ADMIN',
        );
      }
    });

    it('should throw ForbiddenException with proper status code', () => {
      const context = createMockExecutionContext(
        [UserRole.EDITOR],
        UserRole.VIEWER,
      );
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.EDITOR]);

      try {
        guard.canActivate(context);
        fail('Should have thrown ForbiddenException');
      } catch (error) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect(error.getStatus()).toBe(403);
      }
    });
  });

  describe('Role-Based Access (No Hierarchy)', () => {
    it('should block ADMIN from accessing EDITOR-only routes', () => {
      const context = createMockExecutionContext(
        [UserRole.EDITOR],
        UserRole.ADMIN,
      );
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.EDITOR]);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should block EDITOR from accessing VIEWER-only routes', () => {
      const context = createMockExecutionContext(
        [UserRole.VIEWER],
        UserRole.EDITOR,
      );
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.VIEWER]);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should block VIEWER from accessing EDITOR routes', () => {
      const context = createMockExecutionContext(
        [UserRole.EDITOR],
        UserRole.VIEWER,
      );
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.EDITOR]);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('should block EDITOR from accessing ADMIN routes', () => {
      const context = createMockExecutionContext(
        [UserRole.ADMIN],
        UserRole.EDITOR,
      );
      jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.ADMIN]);

      expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
    });
  });

  describe('Reflector Integration', () => {
    it('should check both handler and class for @Roles decorator', () => {
      const context = createMockExecutionContext(
        [UserRole.ADMIN],
        UserRole.ADMIN,
      );
      const spy = jest
        .spyOn(reflector, 'getAllAndOverride')
        .mockReturnValue([UserRole.ADMIN]);

      guard.canActivate(context);

      expect(spy).toHaveBeenCalledWith(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });
  });
});
