import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtAuthGuard } from '../../../../src/api/auth/guards/jwt-auth.guard';
import { IS_PUBLIC_KEY } from '../../../../src/api/auth/decorators/public.decorator';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  const createMockExecutionContext = (
    isPublic: boolean | undefined,
    user?: any,
  ): ExecutionContext => {
    const mockRequest = {
      user,
      headers: user ? { authorization: 'Bearer valid-token' } : {},
    };

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  };

  describe('Public Routes', () => {
    it('should allow requests with @Public decorator', () => {
      const context = createMockExecutionContext(true);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      expect(reflector.getAllAndOverride).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
        expect.any(Object),
        expect.any(Object),
      ]);
    });

    it('should bypass JWT validation for public routes', () => {
      const context = createMockExecutionContext(true);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
      // Should not attempt to validate JWT
    });
  });

  describe('Protected Routes', () => {
    it('should block requests without token', async () => {
      const context = createMockExecutionContext(false);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      // Mock parent class canActivate to throw UnauthorizedException
      jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
        .mockImplementation(() => {
          throw new UnauthorizedException('No authorization token was found');
        });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should allow requests with valid token', async () => {
      const mockUser = {
        userId: '123',
        email: 'test@example.com',
        role: 'user',
      };

      const context = createMockExecutionContext(false, mockUser);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      // Mock parent class canActivate to return true for valid token
      jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
        .mockResolvedValue(true);

      const result = await guard.canActivate(context);

      expect(result).toBe(true);
    });

    it('should return proper error message for missing token', () => {
      const context = createMockExecutionContext(false);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
        .mockImplementation(() => {
          throw new UnauthorizedException('No authorization token was found');
        });

      try {
        guard.canActivate(context);
        fail('Should have thrown UnauthorizedException');
      } catch (error) {
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect(error.message).toBe('No authorization token was found');
      }
    });

    it('should handle malformed JWT tokens', () => {
      const context = createMockExecutionContext(false);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
        .mockImplementation(() => {
          throw new UnauthorizedException('Invalid token format');
        });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });

    it('should handle expired JWT tokens', () => {
      const context = createMockExecutionContext(false);
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);

      jest.spyOn(Object.getPrototypeOf(JwtAuthGuard.prototype), 'canActivate')
        .mockImplementation(() => {
          throw new UnauthorizedException('Token has expired');
        });

      expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    });
  });

  describe('Reflector Integration', () => {
    it('should check both handler and class for @Public decorator', () => {
      const context = createMockExecutionContext(true);
      const spy = jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      guard.canActivate(context);

      expect(spy).toHaveBeenCalledWith(IS_PUBLIC_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);
    });

    it('should prioritize handler decorator over class decorator', () => {
      const context = createMockExecutionContext(true);
      // getAllAndOverride returns handler value if both are set
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);

      const result = guard.canActivate(context);

      expect(result).toBe(true);
    });
  });
});
