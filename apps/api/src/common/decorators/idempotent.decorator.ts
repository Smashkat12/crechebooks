/**
 * Idempotent Decorator
 * TASK-INFRA-006: Webhook Idempotency Deduplication
 *
 * @description Decorator for marking endpoints as idempotent.
 * Used in conjunction with IdempotencyGuard to prevent duplicate processing.
 *
 * @example
 * // Basic usage with default options
 * @Idempotent()
 * @Post('webhook')
 * async handleWebhook() { ... }
 *
 * @example
 * // Custom key extraction from request body
 * @Idempotent({
 *   keyExtractor: (req) => req.body.sg_message_id,
 *   ttl: 172800, // 48 hours
 * })
 * @Post('webhook')
 * async handleWebhook() { ... }
 *
 * @example
 * // Using a specific header
 * @Idempotent({
 *   headerName: 'x-webhook-id',
 * })
 * @Post('webhook')
 * async handleWebhook() { ... }
 */

import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Metadata key for storing idempotency options
 */
export const IDEMPOTENCY_KEY = 'idempotency_options';

/**
 * Configuration options for the @Idempotent decorator
 */
export interface IdempotencyOptions {
  /**
   * Custom function to extract the idempotency key from the request.
   * If not provided, looks for x-idempotency-key header or body.idempotencyKey.
   *
   * @param req - Express request object
   * @returns Idempotency key string, or null to skip idempotency check
   *
   * @example
   * keyExtractor: (req) => req.body.event_id
   * keyExtractor: (req) => `${req.body.provider}:${req.body.message_id}`
   */
  keyExtractor?: (req: Request) => string | null;

  /**
   * TTL in seconds for the idempotency key.
   * Default: 86400 (24 hours) from IDEMPOTENCY_TTL env var.
   *
   * For webhooks, consider the retry window of the provider:
   * - SendGrid: Up to 72 hours of retries
   * - WhatsApp/Meta: Up to 24 hours of retries
   * - Stripe: Up to 72 hours of retries
   */
  ttl?: number;

  /**
   * Header name to look for idempotency key.
   * Default: 'x-idempotency-key'
   */
  headerName?: string;

  /**
   * Whether to store and return the result of the first request.
   * When true, duplicate requests will receive the cached result.
   * Default: false (duplicates receive empty response)
   */
  cacheResult?: boolean;

  /**
   * HTTP status code to return for duplicate requests.
   * Default: 200 (OK) - webhook providers expect 200 for acknowledged requests
   */
  duplicateStatusCode?: number;

  /**
   * Response body for duplicate requests.
   * Default: { status: 'duplicate', message: 'Request already processed' }
   */
  duplicateResponse?: unknown;

  /**
   * Prefix to add to the idempotency key for namespacing.
   * Useful when the same endpoint handles multiple webhook types.
   * Default: '' (no prefix, uses raw key)
   *
   * @example
   * keyPrefix: 'sendgrid:'
   * keyPrefix: 'whatsapp:'
   */
  keyPrefix?: string;
}

/**
 * Default response for duplicate requests
 */
export const DEFAULT_DUPLICATE_RESPONSE = {
  status: 'duplicate',
  message: 'Request already processed',
};

/**
 * Mark an endpoint as idempotent.
 * Used with IdempotencyGuard to prevent duplicate processing of webhook retries.
 *
 * @param options - Configuration options for idempotency handling
 * @returns Method decorator
 *
 * @example
 * // Basic usage - looks for x-idempotency-key header
 * @Idempotent()
 *
 * @example
 * // Extract key from webhook payload
 * @Idempotent({
 *   keyExtractor: (req) => req.body.sg_message_id,
 *   keyPrefix: 'sendgrid:',
 *   ttl: 259200, // 72 hours for SendGrid retry window
 * })
 *
 * @example
 * // Cache and return original result
 * @Idempotent({
 *   cacheResult: true,
 *   headerName: 'x-webhook-id',
 * })
 */
export const Idempotent = (options?: IdempotencyOptions) =>
  SetMetadata(IDEMPOTENCY_KEY, options || {});

/**
 * Type guard to check if a request has idempotency metadata attached
 */
export interface IdempotentRequest extends Request {
  /** Idempotency key extracted from the request */
  idempotencyKey?: string;
  /** True if this is a duplicate request */
  isDuplicate?: boolean;
  /** Stored result from original request (if cacheResult is enabled) */
  idempotencyResult?: unknown;
}
