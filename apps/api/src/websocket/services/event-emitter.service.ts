/**
 * Dashboard Event Emitter Service
 * TASK-FEAT-101: Real-time Dashboard with WebSocket Updates
 *
 * Provides a service for emitting dashboard events to connected WebSocket clients.
 * Used by other services (payment, invoice, etc.) to broadcast real-time updates.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import {
  DashboardEvent,
  DashboardEventType,
  PaymentReceivedData,
  InvoiceStatusChangedData,
  ArrearsAlertData,
  MetricsUpdatedData,
  createPaymentReceivedEvent,
  createInvoiceStatusChangedEvent,
  createArrearsAlertEvent,
  createMetricsUpdatedEvent,
  getTenantRoom,
} from '../events/dashboard.events';

/**
 * Rate limiting configuration
 */
interface RateLimitState {
  count: number;
  windowStart: number;
}

/**
 * Default rate limit: 10 events per second per tenant
 */
const DEFAULT_RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 1000;

@Injectable()
export class EventEmitterService {
  private readonly logger = new Logger(EventEmitterService.name);
  private server: Server | null = null;
  private readonly rateLimits: Map<string, RateLimitState> = new Map();

  /**
   * Set the WebSocket server instance (called by gateway)
   */
  setServer(server: Server): void {
    this.server = server;
    this.logger.log('WebSocket server registered with event emitter');
  }

  /**
   * Get the WebSocket server instance
   */
  getServer(): Server | null {
    return this.server;
  }

  /**
   * Check if server is available
   */
  isServerAvailable(): boolean {
    return this.server !== null;
  }

  /**
   * Emit a payment received event to a tenant's room
   */
  emitPaymentReceived(tenantId: string, data: PaymentReceivedData): boolean {
    const event = createPaymentReceivedEvent(tenantId, data);
    return this.emitToTenant(tenantId, event);
  }

  /**
   * Emit an invoice status changed event to a tenant's room
   */
  emitInvoiceStatusChanged(
    tenantId: string,
    data: InvoiceStatusChangedData,
  ): boolean {
    const event = createInvoiceStatusChangedEvent(tenantId, data);
    return this.emitToTenant(tenantId, event);
  }

  /**
   * Emit an arrears alert event to a tenant's room
   */
  emitArrearsAlert(tenantId: string, data: ArrearsAlertData): boolean {
    const event = createArrearsAlertEvent(tenantId, data);
    return this.emitToTenant(tenantId, event);
  }

  /**
   * Emit a metrics updated event to a tenant's room
   */
  emitMetricsUpdated(tenantId: string, data: MetricsUpdatedData): boolean {
    const event = createMetricsUpdatedEvent(tenantId, data);
    return this.emitToTenant(tenantId, event);
  }

  /**
   * Emit a generic dashboard event to a tenant's room
   */
  emitToTenant<T>(tenantId: string, event: DashboardEvent<T>): boolean {
    if (!this.server) {
      this.logger.debug(
        `WebSocket server not available, skipping event emission for tenant ${tenantId}`,
      );
      return false;
    }

    // Check rate limit
    if (!this.checkRateLimit(tenantId)) {
      this.logger.warn(
        `Rate limit exceeded for tenant ${tenantId}, dropping event ${event.type}`,
      );
      return false;
    }

    const room = getTenantRoom(tenantId);

    try {
      this.server.to(room).emit(event.type, event);
      this.logger.debug(
        `Emitted ${event.type} to room ${room}: ${JSON.stringify(event.data)}`,
      );
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to emit ${event.type} to room ${room}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  /**
   * Broadcast an event to all connected clients (admin use only)
   */
  broadcast<T>(event: DashboardEvent<T>): boolean {
    if (!this.server) {
      this.logger.debug('WebSocket server not available, skipping broadcast');
      return false;
    }

    try {
      this.server.emit(event.type, event);
      this.logger.debug(`Broadcast ${event.type} to all clients`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to broadcast ${event.type}: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
      return false;
    }
  }

  /**
   * Get connected client count for a tenant room
   */
  async getTenantClientCount(tenantId: string): Promise<number> {
    if (!this.server) {
      return 0;
    }

    const room = getTenantRoom(tenantId);
    const sockets = await this.server.in(room).fetchSockets();
    return sockets.length;
  }

  /**
   * Get total connected client count
   */
  async getTotalClientCount(): Promise<number> {
    if (!this.server) {
      return 0;
    }

    const sockets = await this.server.fetchSockets();
    return sockets.length;
  }

  /**
   * Check and update rate limit for a tenant
   * @returns true if within rate limit, false if exceeded
   */
  private checkRateLimit(tenantId: string): boolean {
    const now = Date.now();
    const state = this.rateLimits.get(tenantId);

    if (!state || now - state.windowStart >= RATE_LIMIT_WINDOW_MS) {
      // New window
      this.rateLimits.set(tenantId, { count: 1, windowStart: now });
      return true;
    }

    if (state.count >= DEFAULT_RATE_LIMIT) {
      return false;
    }

    state.count++;
    return true;
  }

  /**
   * Clear rate limit state (for testing)
   */
  clearRateLimits(): void {
    this.rateLimits.clear();
  }
}
