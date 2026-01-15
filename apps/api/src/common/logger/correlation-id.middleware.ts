/**
 * Correlation ID Middleware
 * TASK-INFRA-005: Implements request correlation tracking using AsyncLocalStorage
 *
 * Provides:
 * - Unique correlation ID per request (from header or generated)
 * - Request timing tracking
 * - Correlation ID propagation via AsyncLocalStorage
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Store interface for correlation context
 */
export interface CorrelationStore {
  /** Unique correlation ID for request tracing */
  correlationId: string;
  /** Request start timestamp for duration tracking */
  startTime: number;
  /** Optional tenant ID for multi-tenant context */
  tenantId?: string;
  /** Optional user ID for user context */
  userId?: string;
}

/**
 * AsyncLocalStorage instance for correlation context
 * Allows access to correlation data anywhere in the request chain
 */
export const correlationStorage = new AsyncLocalStorage<CorrelationStore>();

/**
 * Get the current correlation ID from the async context
 * @returns The correlation ID or undefined if not in request context
 */
export function getCorrelationId(): string | undefined {
  return correlationStorage.getStore()?.correlationId;
}

/**
 * Get the current correlation store from the async context
 * @returns The full correlation store or undefined if not in request context
 */
export function getCorrelationStore(): CorrelationStore | undefined {
  return correlationStorage.getStore();
}

/**
 * Get request duration in milliseconds
 * @returns Duration in ms or undefined if not in request context
 */
export function getRequestDuration(): number | undefined {
  const store = correlationStorage.getStore();
  if (!store) return undefined;
  return Date.now() - store.startTime;
}

/**
 * Update the correlation store with additional context
 * Useful for adding tenant/user context after authentication
 */
export function updateCorrelationStore(
  updates: Partial<Omit<CorrelationStore, 'correlationId' | 'startTime'>>,
): void {
  const store = correlationStorage.getStore();
  if (store) {
    Object.assign(store, updates);
  }
}

/**
 * Header name for correlation ID
 */
export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Middleware that establishes correlation context for each request
 *
 * Features:
 * - Accepts correlation ID from incoming header or generates a new one
 * - Sets correlation ID on response header for client tracking
 * - Uses AsyncLocalStorage for context propagation without explicit passing
 */
@Injectable()
export class CorrelationIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Extract correlation ID from header or generate new one
    const incomingCorrelationId = req.headers[CORRELATION_ID_HEADER] as
      | string
      | undefined;
    const correlationId = incomingCorrelationId || randomUUID();

    // Attach to request object for easy access
    (req as any).correlationId = correlationId;

    // Set response header for client tracking
    res.setHeader(CORRELATION_ID_HEADER, correlationId);

    // Create correlation store
    const store: CorrelationStore = {
      correlationId,
      startTime: Date.now(),
    };

    // Run the rest of the middleware chain within the async context
    correlationStorage.run(store, () => next());
  }
}
