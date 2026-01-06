/**
 * Test Utilities
 * TASK-TEST-001: Centralized test fixtures
 */

/**
 * Generate unique test ID to prevent collisions in parallel runs
 */
export function generateUniqueId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
