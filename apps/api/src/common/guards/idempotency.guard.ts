/**
 * Idempotency Guard
 * TASK-INFRA-006: Webhook Idempotency Deduplication
 *
 * @description NestJS guard that enforces idempotency for webhook endpoints.
 * Checks Redis for duplicate request keys and attaches metadata to the request.
 *
 * IMPORTANT: This guard DOES NOT reject duplicate requests. Instead, it:
 * 1. Sets request.isDuplicate = true for duplicates
 * 2. Attaches cached result to request.idempotencyResult
 * 3. Allows the controller to decide how to respond
 *
 * This design allows controllers to return appropriate responses for their
 * specific webhook provider requirements.
 */

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IdempotencyService } from '../services/idempotency.service';
import {
  IDEMPOTENCY_KEY,
  IdempotencyOptions,
  IdempotentRequest,
} from '../decorators/idempotent.decorator';

@Injectable()
export class IdempotencyGuard implements CanActivate {
  private readonly logger = new Logger(IdempotencyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly idempotencyService: IdempotencyService,
  ) {}

  /**
   * Check request for idempotency.
   * Always returns true (allows request), but marks duplicates for controller handling.
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get idempotency options from decorator metadata
    const options = this.reflector.get<IdempotencyOptions>(
      IDEMPOTENCY_KEY,
      context.getHandler(),
    );

    // No @Idempotent decorator - skip idempotency check
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<IdempotentRequest>();

    // Initialize request idempotency metadata
    request.isDuplicate = false;
    request.idempotencyKey = undefined;
    request.idempotencyResult = undefined;

    // Extract idempotency key
    const idempotencyKey = this.extractIdempotencyKey(request, options);

    // No key found - skip idempotency check, allow processing
    if (!idempotencyKey) {
      this.logger.debug(
        'IdempotencyGuard: No idempotency key found, skipping check',
      );
      return true;
    }

    // Apply optional prefix
    const fullKey = options.keyPrefix
      ? `${options.keyPrefix}${idempotencyKey}`
      : idempotencyKey;

    request.idempotencyKey = fullKey;

    // Check if this is a duplicate request
    const isNew = await this.idempotencyService.checkAndSet(
      fullKey,
      options.ttl,
    );

    if (!isNew) {
      // Duplicate request detected
      this.logger.log(`IdempotencyGuard: Duplicate webhook: ${fullKey}`);

      request.isDuplicate = true;

      // Retrieve cached result if cacheResult option is enabled
      if (options.cacheResult) {
        const storedResult =
          await this.idempotencyService.getStoredResult(fullKey);
        if (storedResult !== null) {
          request.idempotencyResult = storedResult;
          this.logger.debug(
            `IdempotencyGuard: Cached result available for: ${fullKey}`,
          );
        }
      }
    } else {
      this.logger.debug(`IdempotencyGuard: New request registered: ${fullKey}`);
    }

    // Always allow the request through - let controller handle duplicate response
    return true;
  }

  /**
   * Extract idempotency key from request using configured options.
   * Priority: keyExtractor > header > body.idempotencyKey
   */
  private extractIdempotencyKey(
    request: IdempotentRequest,
    options: IdempotencyOptions,
  ): string | null {
    // Use custom key extractor if provided
    if (options.keyExtractor) {
      try {
        const key = options.keyExtractor(request);
        if (key) {
          this.logger.debug(
            `IdempotencyGuard: Key from extractor: ${key.substring(0, 50)}...`,
          );
          return key;
        }
      } catch (error) {
        this.logger.warn(
          `IdempotencyGuard: Key extractor error - ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      return null;
    }

    // Check configured header (default: x-idempotency-key)
    const headerName = options.headerName || 'x-idempotency-key';
    const headerKey = request.headers[headerName.toLowerCase()];
    if (headerKey && typeof headerKey === 'string') {
      this.logger.debug(
        `IdempotencyGuard: Key from header "${headerName}": ${headerKey.substring(0, 50)}...`,
      );
      return headerKey;
    }

    // Check request body for idempotencyKey property
    const bodyKey = (request.body as Record<string, unknown>)?.idempotencyKey;
    if (bodyKey && typeof bodyKey === 'string') {
      this.logger.debug(
        `IdempotencyGuard: Key from body.idempotencyKey: ${bodyKey.substring(0, 50)}...`,
      );
      return bodyKey;
    }

    return null;
  }
}
