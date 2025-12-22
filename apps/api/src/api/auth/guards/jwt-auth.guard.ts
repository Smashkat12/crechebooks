import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { Request } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      this.logger.debug('Public route accessed, skipping authentication');
      return true;
    }

    // Proceed with JWT authentication
    return super.canActivate(context);
  }

  handleRequest<TUser>(
    err: Error | null,
    user: TUser,
    info: Error | null,
    context: ExecutionContext,
  ): TUser {
    const request = context.switchToHttp().getRequest<Request>();
    const path = request.url || 'unknown';
    const method = request.method || 'unknown';

    if (err) {
      this.logger.error(
        `Authentication error on ${method} ${path}: ${err.message}`,
        err.stack,
      );
      throw new UnauthorizedException('Authentication failed');
    }

    if (!user) {
      const errorMessage = info?.message || 'No valid token provided';
      this.logger.warn(
        `Unauthorized access attempt on ${method} ${path}: ${errorMessage}`,
      );
      throw new UnauthorizedException('Authorization token required');
    }

    return user;
  }
}
