/**
 * Transaction Utilities
 * TASK-BILL-002: Transaction Isolation for Batch Invoice Generation
 *
 * Provides utilities for managing database transactions with:
 * - Serializable isolation level for batch operations
 * - Automatic retry on serialization failures
 * - Exponential backoff for retries
 * - Advisory locking for preventing concurrent batch runs
 *
 * @module common/transaction/transaction.utils
 */

import { Prisma, PrismaClient } from '@prisma/client';
import { Logger } from '@nestjs/common';
import { ConflictException } from '../../shared/exceptions';

const logger = new Logger('TransactionUtils');

/**
 * Options for configuring transaction behavior
 */
export interface TransactionOptions {
  /** Maximum number of retry attempts for serialization failures (default: 3) */
  maxRetries?: number;
  /** Transaction isolation level (default: Serializable) */
  isolationLevel?: Prisma.TransactionIsolationLevel;
  /** Transaction timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Maximum wait time to acquire lock in milliseconds (default: 5000) */
  maxWait?: number;
}

/**
 * Default transaction options for batch operations
 */
export const DEFAULT_BATCH_TRANSACTION_OPTIONS: TransactionOptions = {
  maxRetries: 3,
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
  timeout: 60000, // 60 seconds for batch operations
  maxWait: 10000, // 10 seconds to acquire lock
};

/**
 * Execute a function within a serializable transaction with automatic retry
 * on serialization failures.
 *
 * TASK-BILL-002: Provides transaction isolation for batch operations to prevent
 * race conditions and ensure data consistency.
 *
 * @param prisma - PrismaClient or PrismaService instance
 * @param fn - Async function to execute within the transaction
 * @param options - Transaction configuration options
 * @returns Result of the transaction function
 * @throws Last error encountered if all retries fail
 *
 * @example
 * ```typescript
 * const result = await withSerializableTransaction(
 *   prisma,
 *   async (tx) => {
 *     const invoice = await tx.invoice.create({ data: {...} });
 *     await tx.invoiceLine.createMany({ data: lines });
 *     return invoice;
 *   },
 *   { maxRetries: 3, timeout: 60000 }
 * );
 * ```
 */
export async function withSerializableTransaction<T>(
  prisma: PrismaClient | { $transaction: PrismaClient['$transaction'] },
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: TransactionOptions = {},
): Promise<T> {
  const {
    maxRetries = DEFAULT_BATCH_TRANSACTION_OPTIONS.maxRetries!,
    isolationLevel = DEFAULT_BATCH_TRANSACTION_OPTIONS.isolationLevel!,
    timeout = DEFAULT_BATCH_TRANSACTION_OPTIONS.timeout!,
    maxWait = DEFAULT_BATCH_TRANSACTION_OPTIONS.maxWait!,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        isolationLevel,
        timeout,
        maxWait,
      });
    } catch (error) {
      lastError = error as Error;

      if (isSerializationFailure(error)) {
        logger.warn(
          `Transaction serialization failure, attempt ${attempt}/${maxRetries}: ${(error as Error).message}`,
        );

        if (attempt < maxRetries) {
          const backoffMs = calculateExponentialBackoff(attempt);
          logger.debug(`Retrying transaction after ${backoffMs}ms backoff`);
          await sleep(backoffMs);
          continue;
        }

        logger.error(
          `Transaction failed after ${maxRetries} attempts due to serialization failures`,
        );
      }

      throw error;
    }
  }

  // This should not be reached, but TypeScript needs it
  throw lastError ?? new Error('Transaction failed with unknown error');
}

/**
 * Check if an error is a serialization failure that can be retried
 *
 * Prisma error codes:
 * - P2034: Transaction failed due to a write conflict or deadlock
 * - PostgreSQL error code 40001: serialization_failure
 *
 * @param error - Error to check
 * @returns true if the error is a serialization failure
 */
export function isSerializationFailure(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2034: Transaction failed due to a write conflict or deadlock
    if (error.code === 'P2034') {
      return true;
    }

    // Check for PostgreSQL serialization failure code

    if ((error.meta as any)?.code === '40001') {
      return true;
    }
  }

  // Check error message for common serialization failure patterns
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('serialization failure') ||
      message.includes('could not serialize access') ||
      message.includes('deadlock detected')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Calculate exponential backoff delay with jitter
 *
 * Formula: (2^attempt * baseMs) + randomJitter
 * - Attempt 1: ~200ms (100-300ms with jitter)
 * - Attempt 2: ~400ms (300-500ms with jitter)
 * - Attempt 3: ~800ms (700-900ms with jitter)
 *
 * @param attempt - Current retry attempt (1-based)
 * @param baseMs - Base delay in milliseconds (default: 100)
 * @returns Delay in milliseconds
 */
export function calculateExponentialBackoff(
  attempt: number,
  baseMs: number = 100,
): number {
  const exponentialDelay = Math.pow(2, attempt) * baseMs;
  const jitter = Math.random() * baseMs; // Add random jitter to prevent thundering herd
  return Math.round(exponentialDelay + jitter);
}

/**
 * Acquire an advisory lock for a batch operation
 *
 * TASK-BILL-002: Uses PostgreSQL advisory locks to prevent concurrent
 * batch operations for the same tenant/operation combination.
 *
 * @param prisma - PrismaClient instance with raw query support
 * @param lockKey - Unique string key for the lock (e.g., "batch_invoice_tenant123")
 * @returns true if lock was acquired, false if already held by another process
 *
 * @example
 * ```typescript
 * const acquired = await acquireAdvisoryLock(prisma, `batch_invoice_${tenantId}`);
 * if (!acquired) {
 *   throw new ConflictException('Batch operation already in progress');
 * }
 * try {
 *   // ... perform batch operation
 * } finally {
 *   await releaseAdvisoryLock(prisma, `batch_invoice_${tenantId}`);
 * }
 * ```
 */
export async function acquireAdvisoryLock(
  prisma: PrismaClient | { $queryRaw: PrismaClient['$queryRaw'] },
  lockKey: string,
): Promise<boolean> {
  const lockId = hashStringToInt(lockKey);
  logger.debug(
    `Attempting to acquire advisory lock: ${lockKey} (id: ${lockId})`,
  );

  try {
    const result = await prisma.$queryRaw<[{ pg_try_advisory_lock: boolean }]>`
      SELECT pg_try_advisory_lock(${lockId})
    `;

    const acquired = result[0]?.pg_try_advisory_lock ?? false;

    if (acquired) {
      logger.debug(`Advisory lock acquired: ${lockKey}`);
    } else {
      logger.warn(`Failed to acquire advisory lock (already held): ${lockKey}`);
    }

    return acquired;
  } catch (error) {
    logger.error(
      `Error acquiring advisory lock ${lockKey}: ${(error as Error).message}`,
    );
    throw error;
  }
}

/**
 * Release an advisory lock
 *
 * @param prisma - PrismaClient instance with raw query support
 * @param lockKey - Unique string key for the lock
 * @returns true if lock was released, false if lock was not held
 */
export async function releaseAdvisoryLock(
  prisma: PrismaClient | { $queryRaw: PrismaClient['$queryRaw'] },
  lockKey: string,
): Promise<boolean> {
  const lockId = hashStringToInt(lockKey);
  logger.debug(`Releasing advisory lock: ${lockKey} (id: ${lockId})`);

  try {
    const result = await prisma.$queryRaw<[{ pg_advisory_unlock: boolean }]>`
      SELECT pg_advisory_unlock(${lockId})
    `;

    const released = result[0]?.pg_advisory_unlock ?? false;

    if (released) {
      logger.debug(`Advisory lock released: ${lockKey}`);
    } else {
      logger.warn(`Advisory lock was not held: ${lockKey}`);
    }

    return released;
  } catch (error) {
    logger.error(
      `Error releasing advisory lock ${lockKey}: ${(error as Error).message}`,
    );
    // Don't throw on release errors - log and continue
    return false;
  }
}

/**
 * Execute a function with an advisory lock, ensuring the lock is released
 * even if an error occurs.
 *
 * @param prisma - PrismaClient instance
 * @param lockKey - Unique string key for the lock
 * @param fn - Async function to execute while holding the lock
 * @returns Result of the function
 * @throws ConflictException if lock cannot be acquired
 *
 * @example
 * ```typescript
 * const result = await withAdvisoryLock(
 *   prisma,
 *   `batch_invoice_${tenantId}`,
 *   async () => {
 *     return await generateBatchInvoices(tenantId, month);
 *   }
 * );
 * ```
 */
export async function withAdvisoryLock<T>(
  prisma: PrismaClient | { $queryRaw: PrismaClient['$queryRaw'] },
  lockKey: string,
  fn: () => Promise<T>,
): Promise<T> {
  const acquired = await acquireAdvisoryLock(prisma, lockKey);

  if (!acquired) {
    throw new ConflictException(
      `Cannot acquire lock for operation: ${lockKey}. Another batch operation may be in progress.`,
    );
  }

  try {
    return await fn();
  } finally {
    await releaseAdvisoryLock(prisma, lockKey);
  }
}

/**
 * Hash a string to a 32-bit integer for use as PostgreSQL advisory lock ID
 *
 * Uses a simple but effective hash algorithm that distributes well
 * and produces consistent results across calls.
 *
 * @param str - String to hash
 * @returns 32-bit integer suitable for pg_advisory_lock
 */
export function hashStringToInt(str: string): number {
  let hash = 0;

  if (str.length === 0) {
    return hash;
  }

  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32-bit integer
  }

  // Return absolute value to ensure positive lock ID
  return Math.abs(hash);
}

/**
 * Sleep for a specified number of milliseconds
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Result of a batch operation with advisory locking
 */
export interface BatchOperationResult<T> {
  /** Whether the lock was acquired */
  lockAcquired: boolean;
  /** Result of the batch operation */
  result: T;
  /** Duration of the operation in milliseconds */
  durationMs: number;
}

/**
 * Execute a batch operation with both advisory locking and transaction isolation
 *
 * TASK-BILL-002: Combines advisory locking (to prevent concurrent batch runs)
 * with serializable transactions (to prevent race conditions within a batch).
 *
 * @param prisma - PrismaClient instance
 * @param lockKey - Unique string key for the advisory lock
 * @param fn - Async function to execute within the transaction
 * @param options - Transaction configuration options
 * @returns BatchOperationResult with the function result and timing info
 * @throws ConflictException if lock cannot be acquired
 *
 * @example
 * ```typescript
 * const { result, durationMs } = await withBatchIsolation(
 *   prisma,
 *   `batch_invoice_${tenantId}_${billingMonth}`,
 *   async (tx) => {
 *     const invoices = [];
 *     for (const enrollment of enrollments) {
 *       const invoice = await createInvoice(tx, enrollment);
 *       invoices.push(invoice);
 *     }
 *     return invoices;
 *   }
 * );
 * ```
 */
export async function withBatchIsolation<T>(
  prisma:
    | PrismaClient
    | {
        $queryRaw: PrismaClient['$queryRaw'];
        $transaction: PrismaClient['$transaction'];
      },
  lockKey: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  options: TransactionOptions = {},
): Promise<BatchOperationResult<T>> {
  const startTime = Date.now();

  const acquired = await acquireAdvisoryLock(prisma, lockKey);

  if (!acquired) {
    throw new ConflictException(
      `Cannot acquire lock for batch operation: ${lockKey}. Another batch operation may be in progress.`,
    );
  }

  try {
    const result = await withSerializableTransaction(
      prisma as PrismaClient,
      fn,
      options,
    );

    return {
      lockAcquired: true,
      result,
      durationMs: Date.now() - startTime,
    };
  } finally {
    await releaseAdvisoryLock(prisma, lockKey);
  }
}
