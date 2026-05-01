/**
 * Transaction Utilities
 *
 * Shared low-level helpers for database transaction support.
 *
 * @module common/transaction/transaction.utils
 */

/**
 * Hash a string to a 32-bit integer for use as a PostgreSQL advisory lock ID.
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
