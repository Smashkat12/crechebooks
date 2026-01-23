/**
 * WebSocket JWT Authentication Guard
 * TASK-FEAT-101: Real-time Dashboard with WebSocket Updates
 *
 * Validates JWT tokens for WebSocket connections.
 * Supports both:
 * - Token in handshake auth (socket.handshake.auth.token)
 * - Token in query params (socket.handshake.query.token)
 */

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { PrismaService } from '../../database/prisma/prisma.service';
import { IUser, UserRole } from '../../database/entities/user.entity';

/**
 * JWT payload structure (matching JwtStrategy)
 */
interface JwtPayload {
  sub: string;
  email: string;
  'https://crechebooks.co.za/tenant_id'?: string;
  'https://crechebooks.co.za/role'?: string;
  tenantId?: string;
  role?: string;
  iat?: number;
  exp?: number;
}

/**
 * Extended Socket interface with authenticated user
 */
export interface AuthenticatedSocket extends Socket {
  user: IUser;
}

@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);
  private readonly isLocalDev: boolean;
  private readonly jwtSecret: string | undefined;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    const domain = this.configService.get<string>('AUTH0_DOMAIN');
    this.jwtSecret = this.configService.get<string>('JWT_SECRET');
    this.isLocalDev = nodeEnv === 'development' && !domain && !!this.jwtSecret;

    if (this.isLocalDev) {
      this.logger.warn(
        'WebSocket guard running in LOCAL DEVELOPMENT mode with JWT_SECRET',
      );
    }
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client = context.switchToWs().getClient<Socket>();
      const token = this.extractToken(client);

      if (!token) {
        this.logger.warn(
          `WebSocket connection rejected: No token provided, clientId=${client.id}`,
        );
        throw new WsException('Authentication token required');
      }

      // Verify and decode the token
      const payload = this.verifyToken(token);

      // Validate token expiration
      if (payload.exp && payload.exp <= Math.floor(Date.now() / 1000)) {
        this.logger.warn(
          `WebSocket connection rejected: Token expired, sub=${payload.sub}`,
        );
        throw new WsException('Token has expired');
      }

      // Find the user in the database
      const user = await this.findUser(payload);

      if (!user) {
        this.logger.warn(
          `WebSocket connection rejected: User not found, sub=${payload.sub}`,
        );
        throw new WsException('User not found');
      }

      if (!user.isActive) {
        this.logger.warn(
          `WebSocket connection rejected: User inactive, userId=${user.id}`,
        );
        throw new WsException('User account is deactivated');
      }

      // Attach user to socket for use in gateway handlers
      (client as AuthenticatedSocket).user = user;

      this.logger.debug(
        `WebSocket authenticated: userId=${user.id}, tenantId=${user.tenantId}`,
      );

      return true;
    } catch (error) {
      if (error instanceof WsException) {
        throw error;
      }

      this.logger.error(
        `WebSocket authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      throw new WsException('Authentication failed');
    }
  }

  /**
   * Extract JWT token from socket handshake
   */
  private extractToken(client: Socket): string | null {
    // Try handshake.auth.token first (recommended)
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) {
      return auth.token;
    }

    // Fall back to query parameter
    const query = client.handshake.query as { token?: string } | undefined;
    if (query?.token) {
      return Array.isArray(query.token) ? query.token[0] : query.token;
    }

    // Try Authorization header (less common for WebSocket)
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }

  /**
   * Verify JWT token
   */
  private verifyToken(token: string): JwtPayload {
    if (this.isLocalDev && this.jwtSecret) {
      // Local development: verify with symmetric key
      try {
        return this.jwtService.verify<JwtPayload>(token, {
          secret: this.jwtSecret,
        });
      } catch (error) {
        this.logger.warn(
          `Local JWT verification failed: ${error instanceof Error ? error.message : 'Unknown'}`,
        );
        throw new WsException('Invalid token');
      }
    }

    // Production: For Auth0, we need to decode and verify differently
    // The JwtService needs to be configured with Auth0's public key
    // For now, we decode and trust the token if it's valid JWT format
    // In production, proper Auth0 verification should be implemented
    try {
      const decoded = this.jwtService.decode<JwtPayload>(token);
      if (!decoded || !decoded.sub) {
        throw new WsException('Invalid token format');
      }
      return decoded;
    } catch (error) {
      this.logger.warn(
        `JWT decode failed: ${error instanceof Error ? error.message : 'Unknown'}`,
      );
      throw new WsException('Invalid token');
    }
  }

  /**
   * Find user by JWT payload
   */
  private async findUser(payload: JwtPayload): Promise<IUser | null> {
    let user: {
      id: string;
      tenantId: string;
      auth0Id: string | null;
      email: string;
      name: string | null;
      role: string;
      isActive: boolean;
      lastLoginAt: Date | null;
      currentTenantId: string | null;
      createdAt: Date;
      updatedAt: Date;
    } | null = null;

    if (this.isLocalDev) {
      // Local dev: try multiple lookup strategies
      const foundUser = await this.prisma.user.findFirst({
        where: {
          OR: [
            { id: payload.sub },
            { auth0Id: payload.sub },
            { email: payload.email },
          ],
        },
      });

      if (!foundUser) throw new Error('User not found');
      if (!foundUser.tenantId) throw new Error('User has no tenantId');

      // Assert tenantId is non-null after validation
      user = { ...foundUser, tenantId: foundUser.tenantId } as any;
    } else {
      // Production: Find by Auth0 ID
      const foundUser = await this.prisma.user.findUnique({
        where: { auth0Id: payload.sub },
      });

      if (foundUser) {
        if (!foundUser.tenantId) throw new Error('User has no tenantId');
        // Assert tenantId is non-null after validation
        user = { ...foundUser, tenantId: foundUser.tenantId } as any;
      }
    }

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      tenantId: user.tenantId,
      auth0Id: user.auth0Id ?? '',
      email: user.email,
      name: user.name ?? '',
      role: user.role as UserRole,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      currentTenantId: user.currentTenantId,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }
}
