/**
 * XeroSyncGateway
 * TASK-TRANS-034: Xero Sync REST API Endpoints
 *
 * WebSocket gateway for real-time Xero sync progress updates.
 * Clients subscribe to their tenant's sync events.
 *
 * CRITICAL: All operations must filter by tenantId.
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SyncProgress, SyncResult, SyncError } from './dto/xero.dto';

/**
 * WebSocket authentication guard
 * Validates JWT token from handshake query/auth
 */
// Note: Implement WsJwtGuard if needed for production
// @UseGuards(WsJwtGuard)

@WebSocketGateway({
  namespace: 'xero-sync',
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3001',
    credentials: true,
  },
})
export class XeroSyncGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(XeroSyncGateway.name);
  private readonly clientTenants: Map<string, string> = new Map();

  /**
   * Handle new WebSocket connection
   */
  handleConnection(client: Socket): void {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  /**
   * Handle WebSocket disconnection
   */
  handleDisconnect(client: Socket): void {
    const tenantId = this.clientTenants.get(client.id);
    if (tenantId) {
      client.leave(`tenant:${tenantId}`);
      this.clientTenants.delete(client.id);
    }
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  /**
   * Subscribe client to sync events for their tenant
   */
  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() tenantId: string,
  ): void {
    if (!tenantId) {
      this.logger.warn(
        `Client ${client.id} tried to subscribe without tenantId`,
      );
      return;
    }

    // Leave previous room if any
    const previousTenant = this.clientTenants.get(client.id);
    if (previousTenant) {
      client.leave(`tenant:${previousTenant}`);
    }

    // Join tenant room
    client.join(`tenant:${tenantId}`);
    this.clientTenants.set(client.id, tenantId);

    this.logger.debug(`Client ${client.id} subscribed to tenant ${tenantId}`);

    // Acknowledge subscription
    client.emit('subscribed', { tenantId, status: 'ok' });
  }

  /**
   * Unsubscribe client from sync events
   */
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(@ConnectedSocket() client: Socket): void {
    const tenantId = this.clientTenants.get(client.id);
    if (tenantId) {
      client.leave(`tenant:${tenantId}`);
      this.clientTenants.delete(client.id);
      this.logger.debug(
        `Client ${client.id} unsubscribed from tenant ${tenantId}`,
      );
    }
  }

  /**
   * Emit sync progress to all clients subscribed to tenant
   */
  emitProgress(tenantId: string, progress: SyncProgress): void {
    if (!this.server) {
      this.logger.debug('Server not initialized, skipping progress emit');
      return;
    }
    this.server.to(`tenant:${tenantId}`).emit('sync:progress', progress);
    this.logger.debug(
      `Emitted progress to tenant ${tenantId}: ${progress.entity} ${progress.percentage}%`,
    );
  }

  /**
   * Emit sync completion to all clients subscribed to tenant
   */
  emitComplete(tenantId: string, result: SyncResult): void {
    if (!this.server) {
      this.logger.debug('Server not initialized, skipping complete emit');
      return;
    }
    this.server.to(`tenant:${tenantId}`).emit('sync:complete', result);
    this.logger.log(
      `Emitted completion to tenant ${tenantId}: job ${result.jobId}`,
    );
  }

  /**
   * Emit sync error to all clients subscribed to tenant
   */
  emitError(tenantId: string, error: SyncError): void {
    if (!this.server) {
      this.logger.debug('Server not initialized, skipping error emit');
      return;
    }
    this.server.to(`tenant:${tenantId}`).emit('sync:error', error);
    this.logger.warn(`Emitted error to tenant ${tenantId}: ${error.message}`);
  }
}
