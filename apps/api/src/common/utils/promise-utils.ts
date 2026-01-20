/**
 * Promise utilities with timeout and partial failure support
 * TASK-PERF-102: Parallel Dashboard Query Execution
 */

/**
 * Custom error class for timeout errors
 */
export class TimeoutError extends Error {
  constructor(message: string = 'Operation timed out') {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Wrap a promise with a timeout
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Optional custom error message
 * @returns The promise result or throws TimeoutError
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage?: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(
        new TimeoutError(
          errorMessage || `Operation timed out after ${timeoutMs}ms`,
        ),
      );
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error: unknown) => {
        clearTimeout(timeoutId);
        // Re-throw the original error, ensuring it's an Error instance
        if (error instanceof Error) {
          reject(error);
        } else {
          reject(new Error(String(error)));
        }
      });
  });
}

/**
 * Execute promises with a timeout, returning settled results
 * Similar to Promise.allSettled but with a timeout for each promise
 * @param promises - Array of promises to execute
 * @param timeoutMs - Timeout in milliseconds for each promise
 * @returns Array of settled results (fulfilled or rejected)
 */
export async function promiseAllSettledWithTimeout<T>(
  promises: Promise<T>[],
  timeoutMs: number,
): Promise<PromiseSettledResult<T>[]> {
  const wrappedPromises = promises.map((promise) =>
    withTimeout(promise, timeoutMs).then(
      (value): PromiseSettledResult<T> => ({ status: 'fulfilled', value }),
      (reason): PromiseSettledResult<T> => ({ status: 'rejected', reason }),
    ),
  );

  return Promise.all(wrappedPromises);
}

/**
 * Execute promises with partial failure support - returns results or defaults
 * If a promise fails, the corresponding default value is used
 * @param promises - Array of promises to execute
 * @param defaults - Array of default values (same length as promises)
 * @returns Array of results or defaults for failed promises
 */
export async function promiseAllWithPartialFailure<T>(
  promises: Promise<T>[],
  defaults: T[],
): Promise<T[]> {
  if (promises.length !== defaults.length) {
    throw new Error('Promises and defaults arrays must have the same length');
  }

  const results = await Promise.allSettled(promises);

  return results.map((result, index) =>
    result.status === 'fulfilled' ? result.value : defaults[index],
  );
}

/**
 * Execute promises with partial failure and timeout support
 * Combines timeout protection with graceful degradation
 * @param promises - Array of promises to execute
 * @param defaults - Array of default values (same length as promises)
 * @param timeoutMs - Timeout in milliseconds for each promise
 * @returns Array of results or defaults for failed/timed-out promises
 */
export async function promiseAllWithPartialFailureAndTimeout<T>(
  promises: Promise<T>[],
  defaults: T[],
  timeoutMs: number,
): Promise<T[]> {
  if (promises.length !== defaults.length) {
    throw new Error('Promises and defaults arrays must have the same length');
  }

  const results = await promiseAllSettledWithTimeout(promises, timeoutMs);

  return results.map((result, index) =>
    result.status === 'fulfilled' ? result.value : defaults[index],
  );
}

/**
 * Execute a batch of promises with concurrency limit
 * Useful for managing database connection pool pressure
 * @param tasks - Array of functions that return promises
 * @param concurrency - Maximum number of concurrent executions
 * @returns Array of results in the same order as tasks
 */
export async function promiseAllWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function runNext(): Promise<void> {
    while (nextIndex < tasks.length) {
      const index = nextIndex++;
      results[index] = await tasks[index]();
    }
  }

  // Start up to 'concurrency' workers
  const workers: Promise<void>[] = [];
  for (let i = 0; i < Math.min(concurrency, tasks.length); i++) {
    workers.push(runNext());
  }

  await Promise.all(workers);
  return results;
}
