/**
 * Dashboard WebSocket Gateway
 * TASK-FEAT-101: Real-time Dashboard with WebSocket Updates
 *
 * WebSocket gateway for real-time dashboard events.
 * Features:
 * - JWT authentication on connection
 * - Tenant-isolated rooms
 * - Heartbeat for connection health
 * - Graceful reconnection support
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
  WsException,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { WsJwtGuard } from './guards/ws-jwt.guard';
import type { AuthenticatedSocket } from './guards/ws-jwt.guard';
import { EventEmitterService } from './services/event-emitter.service';
import {
  DashboardEventType,
  getTenantRoom,
  createConnectedEvent,
  createErrorEvent,
} from './events/dashboard.events';

/**
 * Join room request payload
 */
interface JoinRoomPayload {
  tenantId?: string;
}

/**
 * Heartbeat interval in milliseconds (30 seconds)
 */
const HEARTBEAT_INTERVAL_MS = 30000;

/**
 * Maximum connections per instance
 */
const MAX_CONNECTIONS = 1000;

@WebSocketGateway({
  namespace: 'dashboard',
  cors: {
    origin: process.env.CORS_ALLOWED_ORIGINS?.split(',') || '*',
    credentials: true,
  },
  transports: ['websocket', 'polling'],
})
export class DashboardGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(DashboardGateway.name);
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private connectionCount = 0;

  constructor(private readonly eventEmitter: EventEmitterService) {}

  /**
   * Gateway initialization
   */
  afterInit(server: Server): void {
    this.eventEmitter.setServer(server);
    this.startHeartbeat();
    this.logger.log('Dashboard WebSocket gateway initialized');
  }

  /**
   * Handle new client connection
   * Note: Authentication is handled by WsJwtGuard on message handlers
   */
  async handleConnection(client: Socket): Promise<void> {
    // Check connection limit
    if (this.connectionCount >= MAX_CONNECTIONS) {
      this.logger.warn(
        `Connection limit reached (${MAX_CONNECTIONS}), rejecting client ${client.id}`,
      );
      client.emit(DashboardEventType.ERROR, {
        code: 'CONNECTION_LIMIT',
        message: 'Server connection limit reached, please try again later',
      });
      client.disconnect();
      return;
    }

    this.connectionCount++;
    this.logger.debug(
      `Client connected: ${client.id} (total: ${this.connectionCount})`,
    );
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket): void {
    this.connectionCount = Math.max(0, this.connectionCount - 1);
    this.logger.debug(
      `Client disconnected: ${client.id} (remaining: ${this.connectionCount})`,
    );
  }

  /**
   * Handle join room request
   * Authenticates the user and adds them to their tenant's room
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('join')
  handleJoin(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: JoinRoomPayload,
  ): void {
    const user = client.user;

    if (!user) {
      throw new WsException('Authentication required');
    }

    // Use user's tenantId, ignore payload.tenantId for security
    const tenantId = user.tenantId;
    const room = getTenantRoom(tenantId);

    // Leave any existing rooms first (except socket's own room)
    const currentRooms = Array.from(client.rooms);
    for (const existingRoom of currentRooms) {
      if (existingRoom !== client.id && existingRoom.startsWith('tenant:')) {
        client.leave(existingRoom);
        this.logger.debug(`Client ${client.id} left room: ${existingRoom}`);
      }
    }

    // Join tenant room
    client.join(room);
    this.logger.log(
      `Client ${client.id} joined room ${room} (user: ${user.id})`,
    );

    // Send connection confirmation
    const confirmationEvent = createConnectedEvent(tenantId, {
      clientId: client.id,
      room,
      serverTime: new Date().toISOString(),
    });

    client.emit(DashboardEventType.CONNECTED, confirmationEvent);
  }

  /**
   * Handle leave room request
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('leave')
  handleLeave(@ConnectedSocket() client: AuthenticatedSocket): void {
    const user = client.user;

    if (!user) {
      return;
    }

    const room = getTenantRoom(user.tenantId);
    client.leave(room);
    this.logger.debug(`Client ${client.id} left room: ${room}`);
  }

  /**
   * Handle ping for manual heartbeat
   */
  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket): { event: string; data: { timestamp: string } } {
    return {
      event: 'pong',
      data: { timestamp: new Date().toISOString() },
    };
  }

  /**
   * Start periodic heartbeat to all connected clients
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.server) {
        this.server.emit(DashboardEventType.HEARTBEAT, {
          timestamp: new Date().toISOString(),
          connections: this.connectionCount,
        });
      }
    }, HEARTBEAT_INTERVAL_MS);

    this.logger.debug(
      `Heartbeat started (interval: ${HEARTBEAT_INTERVAL_MS}ms)`,
    );
  }

  /**
   * Stop heartbeat on gateway shutdown
   */
  onModuleDestroy(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
      this.logger.debug('Heartbeat stopped');
    }
  }

  /**
   * Get current connection count
   */
  getConnectionCount(): number {
    return this.connectionCount;
  }

  /**
   * Send event to specific tenant room
   * Convenience method that delegates to EventEmitterService
   */
  broadcastToTenant(tenantId: string, eventType: string, data: unknown): void {
    const room = getTenantRoom(tenantId);
    this.server.to(room).emit(eventType, {
      type: eventType,
      timestamp: new Date().toISOString(),
      tenantId,
      data,
    });
  }
}
